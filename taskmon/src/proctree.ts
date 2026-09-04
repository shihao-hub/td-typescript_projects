import type { CimProc } from './cim.js';
import type { ProcessInfo } from './types.js';

/** 进程树节点：children 已按子树内存降序，subtreeBytes = 自身 + 全部后代 */
export interface ProcessTreeNode {
  proc: ProcessInfo;
  children: ProcessTreeNode[];
  subtreeBytes: number;
}

/**
 * 父子边有效性（PID 复用防线）：
 * - 父缺失（已退出）→ 无效
 * - 自引用（PPID == PID）→ 无效
 * - 父的创建时间晚于子 → PPID 指向无关进程（原父退出后 PID 被复用）→ 无效
 */
export function isValidParent(
  childPid: number,
  childCreationDate: number | undefined,
  parent: { pid: number; creationDate?: number } | undefined,
): boolean {
  if (!parent || parent.pid === childPid) return false;
  if (childCreationDate !== undefined && parent.creationDate !== undefined && parent.creationDate > childCreationDate) {
    return false;
  }
  return true;
}

/**
 * 用 CIM 拓扑补全 tasklist 进程：ppid / 创建时间 / 命令行 / 父进程名 / 孤儿标记。
 * - 无 CIM 数据的进程原样保留（树视图中作为无标记的根，组视图中不显示父列）
 * - orphan=true：曾有父但已不可达——父不在 CIM 快照中，或 PPID 已被复用；
 *   ppid<=0 与自引用（System Idle/System 等）视为"从未有父"，不标孤儿
 */
export function mergeTopology(procs: ProcessInfo[], cim: Map<number, CimProc>): ProcessInfo[] {
  if (cim.size === 0) return procs;
  return procs.map((p) => {
    const c = cim.get(p.pid);
    if (!c) return p;
    // 无父占位（0）或自引用：根，但不算孤儿
    const noParent = c.ppid <= 0 || c.ppid === c.pid;
    const parent = noParent ? undefined : cim.get(c.ppid);
    const parentValid =
      !noParent &&
      isValidParent(c.pid, c.created ?? undefined, parent ? { pid: parent.pid, creationDate: parent.created ?? undefined } : undefined);
    return {
      ...p,
      ppid: c.ppid,
      creationDate: c.created ?? undefined,
      commandLine: c.cmd ?? undefined,
      parentName: parentValid ? parent!.name : undefined,
      orphan: !noParent && !parentValid,
    };
  });
}

/**
 * 构建进程森林（根 = 无有效父边的进程，按子树内存降序）。
 *
 * 防环：快照竞态可能出现 A↔B 互相引用之类的环——先从根 DFS 标记可达，
 * 未达节点（环成员及其后代）从父的 children 断链后提升为孤立根，
 * 保证后续求和/排序/展平的递归必然终止。
 */
export function buildTree(procs: ProcessInfo[]): ProcessTreeNode[] {
  const nodes = new Map<number, ProcessTreeNode>();
  for (const p of procs) {
    nodes.set(p.pid, { proc: p, children: [], subtreeBytes: p.memBytes });
  }

  const roots: ProcessTreeNode[] = [];
  const parentOf = new Map<number, ProcessTreeNode>();
  for (const node of nodes.values()) {
    const p = node.proc;
    if (p.ppid !== undefined) {
      const parent = nodes.get(p.ppid);
      if (isValidParent(p.pid, p.creationDate, parent?.proc)) {
        parent!.children.push(node);
        parentOf.set(p.pid, parent!);
        continue;
      }
    }
    roots.push(node);
  }

  // 可达性：从根出发能到的节点构成无环森林；其余为环成员/环后代
  const reached = new Set<number>();
  const stack = [...roots];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (reached.has(n.proc.pid)) continue;
    reached.add(n.proc.pid);
    stack.push(...n.children);
  }
  for (const node of nodes.values()) {
    if (reached.has(node.proc.pid)) continue;
    const parent = parentOf.get(node.proc.pid);
    if (parent) {
      const i = parent.children.indexOf(node);
      if (i >= 0) parent.children.splice(i, 1);
    }
    roots.push(node);
  }

  // 子树合计 + 层内排序（子按子树内存降序；根同理）
  const compute = (n: ProcessTreeNode): number => {
    n.subtreeBytes = n.proc.memBytes + n.children.reduce((s, c) => s + compute(c), 0);
    return n.subtreeBytes;
  };
  const sortTree = (n: ProcessTreeNode): void => {
    n.children.sort((a, b) => b.subtreeBytes - a.subtreeBytes || a.proc.pid - b.proc.pid);
    for (const c of n.children) sortTree(c);
  };
  for (const r of roots) {
    compute(r);
    sortTree(r);
  }
  roots.sort((a, b) => b.subtreeBytes - a.subtreeBytes || a.proc.pid - b.proc.pid);
  return roots;
}

/** 树视图的可见行（按 expandedNodes 折叠子树） */
export interface TreeRow {
  node: ProcessTreeNode;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  /** 是否为父的最后一个孩子（└─ / ├─ 分支符号用） */
  isLast: boolean;
}

/** 展平森林为可见行序列：折叠的节点只出根行不出后代 */
export function flattenTree(roots: ProcessTreeNode[], expandedNodes: ReadonlySet<number>): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (n: ProcessTreeNode, depth: number, isLast: boolean): void => {
    const hasChildren = n.children.length > 0;
    const isOpen = hasChildren && expandedNodes.has(n.proc.pid);
    rows.push({ node: n, depth, hasChildren, expanded: isOpen, isLast });
    if (isOpen) {
      n.children.forEach((c, i) => walk(c, depth + 1, i === n.children.length - 1));
    }
  };
  roots.forEach((r, i) => walk(r, 0, i === roots.length - 1));
  return rows;
}

/** 收集整棵子树的进程列表（子树 kill 的快照与防自杀检查用） */
export function subtreeProcesses(node: ProcessTreeNode): ProcessInfo[] {
  const out: ProcessInfo[] = [node.proc];
  for (const c of node.children) out.push(...subtreeProcesses(c));
  return out;
}

/** 全树（含折叠的节点）按 PID 建索引：搜索跳转时展开祖先链用 */
export function collectNodes(roots: ProcessTreeNode[], out: Map<number, ProcessTreeNode> = new Map()): Map<number, ProcessTreeNode> {
  for (const r of roots) {
    out.set(r.proc.pid, r);
    collectNodes(r.children, out);
  }
  return out;
}

/**
 * 树视图默认展开的根 PID：explorer.exe——开始菜单/资源管理器启动的 App（含 Zed 等）
 * 都挂在它下面，默认展开让"我的应用"第一眼可见。只影响交互模式初始状态（--once 输出不受影响）。
 */
export function defaultExpandedRootPids(roots: ProcessTreeNode[]): number[] {
  return roots.filter((r) => r.proc.name.toLowerCase() === 'explorer.exe').map((r) => r.proc.pid);
}
