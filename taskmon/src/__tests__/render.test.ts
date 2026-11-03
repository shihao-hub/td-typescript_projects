import { describe, expect, it } from 'vitest';
import { allLines, renderFrame, renderTreeFrame } from '../cli/render.js';
import type { Frame } from '../cli/render.js';
import { groupProcesses } from '../core/grouping.js';
import { buildTree } from '../core/proctree.js';
import type { ProcessInfo } from '../core/types.js';

const MB = 1024 * 1024;

function p(name: string, pid: number, mb: number, cpuPct?: number): ProcessInfo {
  return { name, pid, memBytes: mb * MB, cpuPct };
}

function buildGroups(): ReturnType<typeof groupProcesses> {
  return groupProcesses([
    p('chrome.exe', 111, 300),
    p('chrome.exe', 222, 200),
    p('explorer.exe', 333, 50),
  ]);
}

const GB = 1024 * 1024 * 1024;

function sysMem32() {
  return { total: 32 * GB, used: 20 * GB, free: 12 * GB, usedPct: 0.625 };
}

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const flat = (f: Frame) => allLines(f).map(strip);

function frame(over: Partial<Parameters<typeof renderFrame>[1]> = {}) {
  return renderFrame(buildGroups(), {
    width: 100,
    top: 0,
    timestamp: new Date('2026-01-01T12:00:00'),
    intervalSec: 2,
    totalProcs: 3,
    ...over,
  });
}

describe('renderFrame', () => {
  it('包含标题、摘要、列头', () => {
    const lines = flat(frame());

    expect(lines[0]).toContain('taskmon');
    expect(lines[0]).toContain('2026-01-01 12:00:00');
    expect(lines[1]).toContain('进程 3');
    expect(lines[1]).toContain('分组 2');
    expect(lines[3]).toContain('进程 / 组');
  });

  it('sticky header：header 为固定前缀（标题/摘要/分隔线/列头），groupRows 均为 body 相对行号', () => {
    const f = frame({ expanded: new Set(['chrome.exe']) });
    expect(f.header).toHaveLength(4);
    expect(allLines(f).slice(0, f.header.length)).toEqual(f.header);
    expect(strip(f.header[3]!)).toContain('进程 / 组');
    for (const r of f.groupRows) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(f.body.length);
    }
    expect(f.body.map(strip).join('\n')).toContain('chrome.exe (2)');
  });

  it('默认折叠：多实例组只显示组行（带 ▸），不显示成员 PID', () => {
    const f = frame();
    const lines = flat(f);
    const txt = lines.join('\n');

    const groupRow = lines.findIndex((l) => l.includes('chrome.exe (2)'));
    expect(groupRow).toBeGreaterThan(0);
    expect(lines[groupRow]).toContain('▸');
    expect(txt).not.toContain('111');
    expect(txt).not.toContain('222');
  });

  it('单实例组不受折叠影响，单行含 PID', () => {
    const single = flat(frame()).find((l) => l.includes('explorer.exe'));
    expect(single).toBeTruthy();
    expect(single).toContain('333');
  });

  it('expanded 集合展开指定组：▾ + 成员行按内存降序', () => {
    const f = frame({ expanded: new Set(['chrome.exe']) });
    const lines = flat(f);

    expect(strip(f.body[f.groupRows[0]!]!)).toContain('▾');
    const i111 = lines.findIndex((l) => l.includes('111'));
    const i222 = lines.findIndex((l) => l.includes('222'));
    expect(i111).toBeGreaterThan(0);
    expect(i222).toBeGreaterThan(0);
    expect(i111).toBeLessThan(i222); // 300MB 在 200MB 前
  });

  it('expandAll 展开全部', () => {
    const txt = flat(frame({ expandAll: true })).join('\n');
    expect(txt).toContain('111');
    expect(txt).toContain('222');
  });

  it('groupRows 与可见组一一对应且指向 body 中的组行', () => {
    const f = frame({ expanded: new Set(['chrome.exe']) });
    expect(f.groupRows).toHaveLength(2);
    expect(strip(f.body[f.groupRows[0]!]!)).toContain('chrome.exe');
    expect(strip(f.body[f.groupRows[1]!]!)).toContain('explorer.exe');
  });

  it('cursorIndex 不破坏结构', () => {
    const f0 = frame({ cursorIndex: 0 });
    const f1 = frame({ cursorIndex: 1 });
    expect(flat(f0)).toEqual(flat(f1));
  });

  it('组间顺序：总内存大的组在前', () => {
    const groups = groupProcesses([
      p('small.exe', 1, 10),
      p('large.exe', 2, 200),
      p('mid.exe', 3, 50),
    ]);
    const f = renderFrame(groups, {
      width: 100,
      top: 0,
      timestamp: new Date(),
      intervalSec: 2,
      totalProcs: 3,
    });
    const lines = flat(f);
    const iLarge = lines.findIndex((l) => l.includes('large.exe'));
    const iMid = lines.findIndex((l) => l.includes('mid.exe'));
    const iSmall = lines.findIndex((l) => l.includes('small.exe'));
    expect(iLarge).toBeLessThan(iMid);
    expect(iMid).toBeLessThan(iSmall);
  });

  it('top 截断组数量', () => {
    const f = frame({ top: 1 });
    const txt = flat(f).join('\n');
    expect(txt).toContain('chrome.exe');
    expect(txt).not.toContain('explorer.exe');
    expect(strip(f.header[1]!)).toContain('前 1 组');
  });

  it('sysMem：摘要含物理内存使用率，组行显示占物理总量%', () => {
    const f = frame({ sysMem: sysMem32() });
    expect(strip(f.header[1]!)).toContain('物理内存 62.5% 已用');
    const groupRow = strip(f.body[f.groupRows[0]!]!);
    expect(groupRow).toContain('1.5%'); // 500MB / 32GB = 1.52%
  });

  it('sysCpu：摘要含 CPU 占用率与核心数', () => {
    const f = frame({ sysCpu: { usedPct: 0.245, cores: 8 } });
    expect(strip(f.header[1]!)).toContain('CPU 24.5%');
  });

  it('支持展示组 CPU 与成员 CPU', () => {
    const procs = [
      p('chrome.exe', 111, 300, 0.15),
      p('chrome.exe', 222, 200, 0.05),
    ];
    const groups = groupProcesses(procs);
    const f = renderFrame(groups, {
      width: 100,
      top: 0,
      timestamp: new Date(),
      intervalSec: 2,
      totalProcs: 2,
      expanded: new Set(['chrome.exe']),
    });
    const lines = flat(f);
    expect(lines.some((l) => l.includes('20.0%'))).toBe(true); // 组 CPU 15% + 5% = 20%
    expect(lines.some((l) => l.includes('15.0%'))).toBe(true); // 成员 111 CPU
    expect(lines.some((l) => l.includes('5.0%'))).toBe(true); // 成员 222 CPU
  });

  it('sysMem：成员行仍为组内占比', () => {
    const f = frame({ sysMem: sysMem32(), expanded: new Set(['chrome.exe']) });
    const member = strip(f.body[f.groupRows[0]! + 1]!);
    expect(member).toContain('60.0%'); // 300MB / 500MB
  });

  it('无 sysMem：摘要无物理内存段，组行占比列留空不报错', () => {
    const f = frame();
    expect(strip(f.header[1]!)).not.toContain('物理内存');
    const groupRow = strip(f.body[f.groupRows[0]!]!);
    expect(groupRow).not.toContain('%');
  });

  it('空数据：header 无列头，提示进入 body', () => {
    const f = renderFrame([], {
      width: 100,
      top: 0,
      timestamp: new Date(),
      intervalSec: 2,
      totalProcs: 0,
    });
    expect(f.header).toHaveLength(3); // 标题/摘要/分隔线，无列头
    expect(f.body.some((l) => l.includes('未捕获到任何进程'))).toBe(true);
    expect(f.groupRows).toEqual([]);
  });
});

describe('renderTreeFrame', () => {
  const treeProcs: ProcessInfo[] = [
    { name: 'zed.exe', pid: 1, memBytes: 800 * MB, ppid: 999, orphan: true, cpuPct: 0.02 },
    { name: 'opencode.exe', pid: 2, memBytes: 900 * MB, ppid: 1, cpuPct: 0.10 },
    { name: 'node.exe', pid: 3, memBytes: 300 * MB, ppid: 2, cpuPct: 0.05 },
    { name: 'chrome.exe', pid: 4, memBytes: 100 * MB, cpuPct: 0.01 },
  ];
  const roots = buildTree(treeProcs);

  const treeFrame = (over: Partial<Parameters<typeof renderTreeFrame>[1]> = {}) =>
    renderTreeFrame(roots, {
      width: 100,
      top: 0,
      timestamp: new Date('2026-01-01T12:00:00'),
      intervalSec: 2,
      totalProcs: 4,
      topoAvailable: true,
      ...over,
    });

  it('标题为进程树，摘要含根数与拓扑状态', () => {
    const lines = flat(treeFrame());
    expect(lines[0]).toContain('进程树');
    expect(lines[1]).toContain('根 2');
    expect(lines[1]).toContain('拓扑');
  });

  it('摘要含 sysCpu', () => {
    const f = treeFrame({ sysCpu: { usedPct: 0.18, cores: 16 } });
    expect(flat(f)[1]).toContain('CPU 18.0%');
  });

  it('树视图行内显示自身 CPU 与子树 CPU', () => {
    const f = treeFrame();
    const rootRow = flat(f).find((l) => l.includes('zed.exe'))!;
    expect(rootRow).toContain('2.0%'); // zed 自身 2%
    expect(rootRow).toContain('17.0%'); // zed 子树 2 + 10 + 5 = 17%
  });

  it('默认折叠只显示根行；根行不显示孤儿 †（Windows 顶层进程父退出是常态）', () => {
    const f = treeFrame();
    const txt = flat(f).join('\n');
    expect(txt).toContain('zed.exe (1)');
    expect(txt).toContain('chrome.exe');
    expect(txt).not.toContain('†');
    expect(txt).not.toContain('opencode.exe'); // 折叠态子行不出现
  });

  it('展开根：子行带 ├─/└─ 分支符号与正确缩进', () => {
    const f = treeFrame({ expanded: new Set([1, 2]) });
    const lines = flat(f);
    const i1 = lines.findIndex((l) => l.includes('zed.exe'));
    const i2 = lines.findIndex((l) => l.includes('opencode.exe'));
    const i3 = lines.findIndex((l) => l.includes('node.exe'));
    expect(i1).toBeGreaterThan(0);
    expect(i2).toBe(i1 + 1);
    expect(i3).toBe(i1 + 2);
    expect(lines[i2]!).toContain('└─');
    expect(lines[i3]!).toContain('└─');
    expect(lines[i3]!.indexOf('└─')).toBeGreaterThan(lines[i2]!.indexOf('└─')); // 更深一层
  });

  it('子树合计：根行显示 自身+后代 总量', () => {
    const f = treeFrame({ expanded: new Set([1]) });
    const rootRow = flat(f).find((l) => l.includes('zed.exe'))!;
    expect(rootRow).toContain('1.95 GB'); // (800+900+300) MB = 1.953 GB
  });

  it('拓扑不可用：body 首行给降级提示，摘要显示 拓扑不可用', () => {
    const f = treeFrame({ topoAvailable: false });
    expect(flat(f).join('\n')).toContain('拓扑数据不可用');
    expect(strip(f.header[1]!)).toContain('拓扑不可用');
    // 行序号不漂移：groupRows 仍指向各节点行
    expect(f.groupRows.length).toBeGreaterThan(0);
    for (const r of f.groupRows) expect(r).toBeLessThan(f.body.length);
  });

  it('groupRows 覆盖全部可见行（树视图每行可选）', () => {
    const f = treeFrame({ expanded: new Set([1, 2]) });
    expect(f.groupRows).toEqual([0, 1, 2, 3]);
  });

  it('top 过滤根数量', () => {
    const f = treeFrame({ top: 1 });
    const txt = flat(f).join('\n');
    expect(txt).toContain('zed.exe');
    expect(txt).not.toContain('chrome.exe');
    expect(strip(f.header[1]!)).toContain('前 1 根');
  });
});
