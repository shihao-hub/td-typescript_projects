import { describe, expect, it } from 'vitest';
import type { CimProc } from '../cim.js';
import { buildTree, collectNodes, defaultExpandedRootPids, flattenTree, isValidParent, mergeTopology, subtreeProcesses } from '../proctree.js';
import type { ProcessInfo } from '../types.js';

const MB = 1024 * 1024;
const T0 = 1_700_000_000_000;

function cim(pid: number, ppid: number, created: number | null = T0, cmd: string | null = null): CimProc {
  return { pid, ppid, name: `p${pid}.exe`, created, cmd };
}

function cimMap(...procs: CimProc[]): Map<number, CimProc> {
  return new Map(procs.map((p) => [p.pid, p]));
}

function p(name: string, pid: number, mb: number, extra: Partial<ProcessInfo> = {}): ProcessInfo {
  return { name, pid, memBytes: mb * MB, ...extra };
}

describe('isValidParent', () => {
  it('父缺失 / 自引用 → 无效', () => {
    expect(isValidParent(1, T0, undefined)).toBe(false);
    expect(isValidParent(1, T0, { pid: 1, creationDate: T0 - 1000 })).toBe(false);
  });

  it('父早于子创建 → 有效', () => {
    expect(isValidParent(2, T0, { pid: 1, creationDate: T0 - 1000 })).toBe(true);
  });

  it('父晚于子创建（PID 复用）→ 无效', () => {
    expect(isValidParent(2, T0, { pid: 1, creationDate: T0 + 1000 })).toBe(false);
  });

  it('任一侧创建时间缺失 → 不做复用判定，按有效处理', () => {
    expect(isValidParent(2, undefined, { pid: 1, creationDate: T0 + 1000 })).toBe(true);
    expect(isValidParent(2, T0, { pid: 1 })).toBe(true);
  });
});

describe('mergeTopology', () => {
  it('补全 ppid/创建时间/命令行/父进程名', () => {
    const out = mergeTopology(
      [p('zed.exe', 10, 100), p('gopls.exe', 11, 50)],
      cimMap(cim(10, 4, T0 - 5000, 'Zed.exe'), cim(11, 10, T0, 'gopls -mode=stdio')),
    );
    const gopls = out.find((x) => x.pid === 11)!;
    expect(gopls.ppid).toBe(10);
    expect(gopls.creationDate).toBe(T0);
    expect(gopls.commandLine).toBe('gopls -mode=stdio');
    expect(gopls.parentName).toBe('p10.exe');
    expect(gopls.orphan).toBe(false);
  });

  it('父不在 CIM 快照 → orphan=true 且无父名', () => {
    const out = mergeTopology([p('node.exe', 20, 50)], cimMap(cim(20, 999, T0)));
    expect(out[0]!.orphan).toBe(true);
    expect(out[0]!.parentName).toBeUndefined();
  });

  it('ppid=0 或自引用（System Idle/System）→ 根但不标孤儿', () => {
    const out = mergeTopology(
      [p('System Idle Process', 0, 1), p('System', 4, 1)],
      cimMap(cim(0, 0, T0), cim(4, 4, T0)),
    );
    expect(out[0]!.orphan).toBe(false);
    expect(out[1]!.orphan).toBe(false);
  });

  it('父晚于子创建（PID 复用）→ orphan=true', () => {
    const out = mergeTopology(
      [p('node.exe', 20, 50), p('new.exe', 999, 10)],
      cimMap(cim(20, 999, T0), cim(999, 1, T0 + 60_000)),
    );
    expect(out[0]!.orphan).toBe(true);
    expect(out[0]!.parentName).toBeUndefined();
  });

  it('CIM name 覆盖 tasklist 残损名（代码页乱码兜底）', () => {
    const garbled: CimProc = { pid: 30, ppid: 0, name: '笔记管理系统.exe', created: T0, cmd: null };
    const out = mergeTopology([p('\u25C6**\'\u25C6\u2666\u2666eT.exe', 30, 10)], cimMap(garbled));
    expect(out[0]!.name).toBe('笔记管理系统.exe');
  });

  it('无 CIM 数据的进程原样保留（不标孤儿）', () => {
    const out = mergeTopology([p('a.exe', 1, 1)], new Map());
    expect(out[0]).toEqual(p('a.exe', 1, 1));
  });
});

describe('buildTree', () => {
  it('两级树：子挂到父、子树合计、按子树内存降序', () => {
    const procs = [
      p('zed.exe', 1, 800),
      p('opencode.exe', 2, 900, { ppid: 1 }),
      p('gopls.exe', 3, 600, { ppid: 1 }),
      p('chrome.exe', 4, 2000),
    ];
    const roots = buildTree(procs);
    // zed 子树 800+900+600=2300 > chrome 2000
    expect(roots.map((r) => r.proc.pid)).toEqual([1, 4]);
    const zed = roots[0]!;
    expect(zed.subtreeBytes).toBe(2300 * MB);
    expect(zed.children.map((c) => c.proc.pid)).toEqual([2, 3]); // 900 > 600
    expect(roots[1]!.subtreeBytes).toBe(2000 * MB);
  });

  it('自引用（PPID==PID）不构成边，成为根', () => {
    const roots = buildTree([p('a.exe', 7, 10, { ppid: 7 })]);
    expect(roots).toHaveLength(1);
    expect(roots[0]!.children).toHaveLength(0);
  });

  it('孤儿（父不在快照）成为根', () => {
    const roots = buildTree([p('a.exe', 1, 10), p('orphan.exe', 2, 20, { ppid: 999 })]);
    expect(roots.map((r) => r.proc.pid).sort()).toEqual([1, 2]);
  });

  it('PID 复用（"父"晚于子）断链：子成为根', () => {
    const roots = buildTree([
      p('child.exe', 2, 10, { ppid: 1, creationDate: T0 }),
      p('reused.exe', 1, 10, { creationDate: T0 + 60_000 }),
    ]);
    // pid 1 晚于 pid 2 创建 → 2 的 ppid 指向无关进程 → 断链
    expect(roots).toHaveLength(2);
    expect(roots.every((r) => r.children.length === 0)).toBe(true);
  });

  it('环（A↔B 互指、创建时间缺失）不死循环：断链提升为孤立根', () => {
    const procs = [
      p('a.exe', 1, 10, { ppid: 2 }),
      p('b.exe', 2, 20, { ppid: 1 }),
      p('c.exe', 3, 5, { ppid: 1 }),
      p('normal.exe', 9, 100),
    ];
    const roots = buildTree(procs);
    // 环成员 1、2 及环后代 3 与 normal 一起成为根；环边全部断开
    const rootPids = roots.map((r) => r.proc.pid).sort((a, b) => a - b);
    expect(rootPids).toEqual([1, 2, 3, 9]);
    expect(roots.every((r) => r.children.length === 0)).toBe(true);
  });

  it('环保险下的子树合计仍准确', () => {
    const procs = [
      p('root.exe', 1, 100),
      p('x.exe', 2, 10, { ppid: 1 }),
      p('y.exe', 3, 20, { ppid: 2 }),
    ];
    const roots = buildTree(procs);
    expect(roots[0]!.subtreeBytes).toBe(130 * MB);
  });
});

describe('flattenTree', () => {
  const procs = [
    p('zed.exe', 1, 800),
    p('opencode.exe', 2, 900, { ppid: 1 }),
    p('gopls.exe', 3, 600, { ppid: 1 }),
    p('chrome.exe', 4, 2000),
  ];
  const roots = buildTree(procs);

  it('默认折叠：只有根行', () => {
    const rows = flattenTree(roots, new Set());
    expect(rows.map((r) => r.node.proc.pid)).toEqual([1, 4]);
    expect(rows[0]!.hasChildren).toBe(true);
    expect(rows[0]!.expanded).toBe(false);
  });

  it('展开根：子行按深度缩进且顺序正确', () => {
    const rows = flattenTree(roots, new Set([1]));
    expect(rows.map((r) => r.node.proc.pid)).toEqual([1, 2, 3, 4]);
    expect(rows[1]!.depth).toBe(1);
    expect(rows[3]!.depth).toBe(0);
    expect(rows[0]!.expanded).toBe(true);
  });
});

describe('subtreeProcesses', () => {
  it('收集整棵子树（含自身）', () => {
    const procs = [
      p('zed.exe', 1, 800),
      p('a.exe', 2, 100, { ppid: 1 }),
      p('b.exe', 3, 100, { ppid: 2 }),
    ];
    const roots = buildTree(procs);
    const pids = subtreeProcesses(roots[0]!).map((x) => x.pid);
    expect(pids).toEqual([1, 2, 3]);
  });
});

describe('collectNodes', () => {
  it('全树（含折叠节点）按 PID 建索引，供搜索跳转展开祖先链用', () => {
    const procs = [
      p('zed.exe', 1, 800),
      p('opencode.exe', 2, 900, { ppid: 1 }),
      p('node.exe', 3, 300, { ppid: 2 }),
      p('chrome.exe', 4, 100),
    ];
    const roots = buildTree(procs);
    const byPid = collectNodes(roots);
    expect(byPid.size).toBe(4);
    expect(byPid.get(3)!.proc.name).toBe('node.exe');
    // 沿 ppid 可回溯到根
    let cur = byPid.get(3)!;
    const chain: number[] = [];
    while (cur.proc.ppid !== undefined) {
      chain.push(cur.proc.ppid);
      cur = byPid.get(cur.proc.ppid)!;
    }
    expect(chain).toEqual([2, 1]);
  });
});

describe('defaultExpandedRootPids', () => {
  it('返回 explorer 根的 PID（大小写不敏感），其他根不返回', () => {
    const procs = [
      p('wininit.exe', 1, 100),
      p('explorer.exe', 2, 300),
      p('Zed.exe', 3, 800, { ppid: 2 }),
      p('EXPLORER.EXE', 4, 50),
    ];
    const roots = buildTree(procs);
    expect(defaultExpandedRootPids(roots).sort((a, b) => a - b)).toEqual([2, 4]);
  });

  it('无 explorer 根时返回空数组（等待出现后下轮再补）', () => {
    const roots = buildTree([p('chrome.exe', 1, 100)]);
    expect(defaultExpandedRootPids(roots)).toEqual([]);
  });
});
