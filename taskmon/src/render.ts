import chalk from 'chalk';
import type { ProcessGroup } from './types.js';
import type { SysMem } from './sysmem.js';
import type { ProcessTreeNode } from './proctree.js';
import { flattenTree } from './proctree.js';
import { bar, displayWidth, formatBytes, padEnd, padStart, truncate } from './format.js';

export interface RenderOptions {
  width: number;
  /** 只显示前 N 组（0 = 全部） */
  top: number;
  timestamp: Date;
  intervalSec: number;
  totalProcs: number;
  /** 物理内存读数：驱动摘要行与组行「占比」（占物理总量） */
  sysMem?: SysMem;
  /** 已展开的组名集合（多实例组默认折叠） */
  expanded?: ReadonlySet<string>;
  /** 无视 expanded 集合，直接展开全部 */
  expandAll?: boolean;
  /** 光标所在组序号（top 过滤后的可见组列表内），用于高亮该组行 */
  cursorIndex?: number;
}

export interface Frame {
  /** 固定区：标题、摘要、分隔线、列头，不随滚动移出视口 */
  header: string[];
  /** 滚动区：组行 + 成员行 + 组间空行，视口按 offset 切片 */
  body: string[];
  /** 每个可见组的"组行"在 body 中的行号（与可见组一一对应） */
  groupRows: number[];
}

/** header + body 拼成整帧行序（--once 模式整帧打印 / 测试用） */
export function allLines(frame: Frame): string[] {
  return [...frame.header, ...frame.body];
}

type Tier = 'red' | 'yellow' | 'green';

function memTier(bytes: number): Tier {
  if (bytes >= 1024 ** 3) return 'red';
  if (bytes >= 256 * 1024 ** 2) return 'yellow';
  return 'green';
}

function fmtDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const RANK_W = 3;
const PID_W = 6;
const MEM_W = 10;
const PCT_W = 7;
const GAP = '  ';
/** 展开指示符占位（▸ / ▾ + 空格） */
const IND_W = 2;

/** 渲染整帧（纯函数）：header 为固定区（不随滚动），body 为滚动区，默认仅展示分组行，展开的组追加成员行 */
export function renderFrame(allGroups: ProcessGroup[], opts: RenderOptions): Frame {
  const width = Math.max(72, Math.min(300, opts.width));
  const groups = opts.top > 0 ? allGroups.slice(0, opts.top) : allGroups;
  const header: string[] = [];
  const body: string[] = [];
  const groupRows: number[] = [];

  const totalMem = allGroups.reduce((s, g) => s + g.totalBytes, 0);
  const maxTotal = groups[0]?.totalBytes ?? 0;

  // 标题 + 时间（右侧留 2 列余量：部分字体把 · 等歧义宽度字符按 2 渲染，恰好占满会换行截尾）
  const time = fmtDateTime(opts.timestamp);
  const title = 'taskmon · 内存监控';
  header.push(chalk.bold.cyan(padEnd(title, width - displayWidth(time) - 2)) + chalk.dim(time));

  // 摘要
  const sep = chalk.dim(' · ');
  const statsParts = [
    `进程 ${chalk.bold(String(opts.totalProcs))}`,
    `分组 ${chalk.bold(String(allGroups.length))}`,
  ];
  if (opts.sysMem) {
    statsParts.push(
      `物理内存 ${chalk.bold(`${(opts.sysMem.usedPct * 100).toFixed(1)}%`)} 已用` +
        chalk.dim(`(${formatBytes(opts.sysMem.used)}/${formatBytes(opts.sysMem.total)})`),
    );
  }
  statsParts.push(`工作集合计 ${chalk.bold(formatBytes(totalMem))}`, `刷新 ${opts.intervalSec}s`);
  if (opts.top > 0) statsParts.push(chalk.dim(`前 ${groups.length} 组`));
  // 截断到终端宽度：摘要行超宽会回绕，把整帧顶进 scrollback 造成旧表头残留
  header.push(truncate(statsParts.join(sep), width));

  // 分隔线
  header.push(chalk.dim('-'.repeat(width)));

  if (groups.length === 0) {
    body.push(chalk.yellow('未捕获到任何进程'));
    return { header, body, groupRows };
  }

  // 列宽计算
  const nameW = Math.max(
    18,
    Math.min(40, ...groups.map((g) => displayWidth(g.name) + (g.processes.length > 1 ? ` (${g.processes.length})`.length : 0))),
  );
  const nameColW = nameW + IND_W;
  const barW = Math.max(8, Math.min(40, width - (RANK_W + PID_W + MEM_W + PCT_W + GAP.length * 5 + nameColW)));

  // 列头（固定区末行）
  header.push(
    chalk.bold(
      padStart('#', RANK_W) + GAP + padEnd('  进程 / 组', nameColW) + GAP + padStart('PID', PID_W) + GAP +
        padStart('内存', MEM_W) + GAP + padStart('占比', PCT_W) + GAP + padEnd('分布', barW),
    ),
  );

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]!;
    const multi = g.processes.length > 1;
    const isOpen = opts.expandAll === true || opts.expanded?.has(g.name) === true;
    const tier = memTier(g.totalBytes);
    const label = multi ? `${g.name} (${g.processes.length})` : g.name;
    const ind = multi ? (isOpen ? '▾ ' : '▸ ') : '  ';
    const nameCell = padEnd(ind + truncate(label, nameW), nameColW);

    // 组行：排名 + 名称(×N + 展开指示) + [单例时 PID] + 总内存 + 占物理总量% + 条形图
    const ratio = maxTotal > 0 ? g.totalBytes / maxTotal : 0;
    const filled = Math.round(Math.max(0, Math.min(1, ratio)) * barW);
    const barCell =
      (filled > 0 ? chalk[tier]('█'.repeat(filled)) : '') + chalk.dim('░'.repeat(Math.max(0, barW - filled)));
    const pctCell =
      opts.sysMem && opts.sysMem.total > 0
        ? chalk[tier](padStart(`${((g.totalBytes / opts.sysMem.total) * 100).toFixed(1)}%`, PCT_W))
        : ' '.repeat(PCT_W);

    // 行首文本单元格（选中行整体反色；条形图不参与反色，否则嵌套 ANSI 复位码会把彩色块渲成黑块）
    const head =
      chalk.dim(padStart(String(i + 1), RANK_W)) + GAP +
      (multi ? chalk.bold(nameCell) : nameCell) + GAP +
      (multi ? ' '.repeat(PID_W) : chalk.dim(padStart(String(g.processes[0]!.pid), PID_W))) + GAP +
      chalk.bold(chalk[tier](padStart(formatBytes(g.totalBytes), MEM_W))) + GAP +
      pctCell;
    body.push((opts.cursorIndex === i ? chalk.inverse(head) : head) + GAP + barCell);
    groupRows.push(body.length - 1);

    // 组内成员行（仅展开时）：PID + 单进程内存 + 组内占比 + [拓扑：↖父进程 / †孤儿 + 命令行截断]
    if (multi && isOpen) {
      const usedW = RANK_W + GAP.length + nameColW + GAP.length + PID_W + GAP.length + MEM_W + GAP.length + PCT_W + GAP.length;
      const freeW = Math.max(0, width - usedW);
      for (const p of g.processes) {
        const pct = g.totalBytes > 0 ? (p.memBytes / g.totalBytes) * 100 : 0;
        const base =
          ' '.repeat(RANK_W) + GAP + ' '.repeat(nameColW) + GAP +
          chalk.dim(padStart(String(p.pid), PID_W)) + GAP +
          padStart(formatBytes(p.memBytes), MEM_W) + GAP +
          chalk.dim(padStart(`${pct.toFixed(1)}%`, PCT_W));
        // 拓扑信息（CIM 可用才有）：孤儿 † / 父进程 ↖，命令行压平空白后截断填满剩余宽度
        const cells: string[] = [];
        let budget = freeW;
        if (p.orphan) {
          const t = truncate('† 父已退出', budget);
          cells.push(chalk.yellow(t));
          budget -= displayWidth(t) + GAP.length;
        } else if (p.parentName) {
          const t = truncate(`↖${p.parentName}`, budget);
          cells.push(chalk.dim(t));
          budget -= displayWidth(t) + GAP.length;
        }
        if (p.commandLine && budget > 4) {
          const t = truncate(p.commandLine.replace(/\s+/g, ' ').trim(), budget);
          cells.push(chalk.dim(t));
        }
        body.push(cells.length > 0 ? base + GAP + cells.join(GAP) : base);
      }
    }

    if (i < groups.length - 1) body.push('');
  }

  return { header, body, groupRows };
}

export interface TreeRenderOptions {
  width: number;
  /** 只显示子树最大的前 N 个根（0 = 全部） */
  top: number;
  timestamp: Date;
  intervalSec: number;
  totalProcs: number;
  sysMem?: SysMem;
  /** 已展开的节点 PID 集合 */
  expanded?: ReadonlySet<number>;
  /** 无视 expanded 集合，直接展开全部 */
  expandAll?: boolean;
  /** 光标所在行序号（可见行内），用于高亮该行 */
  cursorIndex?: number;
  /** CIM 拓扑是否可用（false 时显示降级提示） */
  topoAvailable: boolean;
  /** 拓扑快照距今秒数 */
  topoLagSec?: number;
}

/** 收集森林中所有有孩子的节点 PID（expandAll 用） */
function collectParentPids(roots: ProcessTreeNode[], out: Set<number> = new Set()): Set<number> {
  for (const r of roots) {
    if (r.children.length > 0) {
      out.add(r.proc.pid);
      collectParentPids(r.children, out);
    }
  }
  return out;
}

/**
 * 渲染进程树整帧（纯函数）：根按子树内存降序、子按子树内存降序；
 * 缩进分支符号 ├─/└─，孤儿标 †；行内显示 PID + 自身内存 + 子树合计 + 占物理总量%。
 * groupRows = 全部可见行（每行都可选中和 k 结束子树）。
 */
export function renderTreeFrame(allRoots: ProcessTreeNode[], opts: TreeRenderOptions): Frame {
  const width = Math.max(72, Math.min(300, opts.width));
  const roots = opts.top > 0 ? allRoots.slice(0, opts.top) : allRoots;
  const expandedSet = opts.expandAll === true ? collectParentPids(roots) : (opts.expanded ?? new Set<number>());
  const rows = flattenTree(roots, expandedSet);

  const header: string[] = [];
  const body: string[] = [];
  const groupRows: number[] = [];

  const totalMem = allRoots.reduce((s, r) => s + r.subtreeBytes, 0);
  const maxSub = rows[0]?.node.subtreeBytes ?? 0;

  const time = fmtDateTime(opts.timestamp);
  const title = 'taskmon · 进程树';
  header.push(chalk.bold.cyan(padEnd(title, width - displayWidth(time) - 2)) + chalk.dim(time));

  const sep = chalk.dim(' · ');
  const statsParts = [
    `进程 ${chalk.bold(String(opts.totalProcs))}`,
    `根 ${chalk.bold(String(allRoots.length))}`,
  ];
  if (opts.sysMem) {
    statsParts.push(
      `物理内存 ${chalk.bold(`${(opts.sysMem.usedPct * 100).toFixed(1)}%`)} 已用` +
        chalk.dim(`(${formatBytes(opts.sysMem.used)}/${formatBytes(opts.sysMem.total)})`),
    );
  }
  statsParts.push(`子树合计 ${chalk.bold(formatBytes(totalMem))}`, `刷新 ${opts.intervalSec}s`);
  if (opts.top > 0) statsParts.push(chalk.dim(`前 ${roots.length} 根`));
  statsParts.push(
    opts.topoAvailable
      ? `拓扑 ${opts.topoLagSec !== undefined ? `${Math.max(0, Math.round(opts.topoLagSec))}s 前` : '就绪'}`
      : chalk.yellow('拓扑不可用'),
  );
  header.push(truncate(statsParts.join(sep), width));
  header.push(chalk.dim('-'.repeat(width)));

  if (rows.length === 0) {
    body.push(chalk.yellow('未捕获到任何进程'));
    return { header, body, groupRows };
  }
  if (!opts.topoAvailable) {
    body.push(chalk.yellow('拓扑数据不可用：无法展示父子关系，全部进程显示为独立根（tasklist 主刷新不受影响）'));
  }

  // 两遍渲染：先算每行的缩进前缀与标签，确定树列宽度，再拼行
  const prefixes = rows.map((r) =>
    r.depth === 0 ? '' : '  '.repeat(r.depth - 1) + (r.isLast ? '└─ ' : '├─ '),
  );
  const labels = rows.map((r) => {
    const n = r.node;
    const ind = r.hasChildren ? (r.expanded ? '▾ ' : '▸ ') : '';
    const cnt = n.children.length > 0 ? ` (${n.children.length})` : '';
    // 根 = 无有效父，树视图不再标 †（Windows 顶层进程父退出是常态，标了全是噪音）；
    // 孤儿/父进程信息保留在分组视图的成员行
    return `${ind}${n.proc.name}${cnt}`;
  });
  const treeW = Math.max(
    24,
    Math.min(48, ...rows.map((_, i) => displayWidth(prefixes[i]! + labels[i]!))),
  );

  const SUB_W = 10;
  const barW = Math.max(8, Math.min(40, width - (RANK_W + PID_W + MEM_W + SUB_W + PCT_W + GAP.length * 6 + treeW)));

  header.push(
    chalk.bold(
      padStart('#', RANK_W) + GAP + padEnd('  进程树', treeW) + GAP + padStart('PID', PID_W) + GAP +
        padStart('自身', MEM_W) + GAP + padStart('子树', SUB_W) + GAP + padStart('占比', PCT_W) + GAP +
        padEnd('分布', barW),
    ),
  );

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const n = r.node;
    const tier = memTier(n.subtreeBytes);
    const ratio = maxSub > 0 ? n.subtreeBytes / maxSub : 0;
    const filled = Math.round(Math.max(0, Math.min(1, ratio)) * barW);
    const barCell =
      (filled > 0 ? chalk[tier]('█'.repeat(filled)) : '') + chalk.dim('░'.repeat(Math.max(0, barW - filled)));
    const pctCell =
      opts.sysMem && opts.sysMem.total > 0
        ? chalk[tier](padStart(`${((n.subtreeBytes / opts.sysMem.total) * 100).toFixed(1)}%`, PCT_W))
        : ' '.repeat(PCT_W);
    const treeCell = padEnd(truncate(prefixes[i]! + labels[i]!, treeW), treeW);

    const head =
      chalk.dim(padStart(String(i + 1), RANK_W)) + GAP +
      treeCell + GAP +
      chalk.dim(padStart(String(n.proc.pid), PID_W)) + GAP +
      padStart(formatBytes(n.proc.memBytes), MEM_W) + GAP +
      chalk[tier](padStart(formatBytes(n.subtreeBytes), SUB_W)) + GAP +
      pctCell;
    body.push((opts.cursorIndex === i ? chalk.inverse(head) : head) + GAP + barCell);
    groupRows.push(body.length - 1);
  }

  return { header, body, groupRows };
}
