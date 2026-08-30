import { describe, expect, it } from 'vitest';
import { renderFrame } from '../render.js';
import { groupProcesses } from '../grouping.js';
import type { ProcessInfo } from '../types.js';

const MB = 1024 * 1024;

function p(name: string, pid: number, mb: number): ProcessInfo {
  return { name, pid, memBytes: mb * MB };
}

function buildGroups(): ReturnType<typeof groupProcesses> {
  return groupProcesses([
    p('chrome.exe', 111, 300),
    p('chrome.exe', 222, 200),
    p('explorer.exe', 333, 50),
  ]);
}

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

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
    const lines = frame().lines.map(strip);

    expect(lines[0]).toContain('taskmon');
    expect(lines[0]).toContain('2026-01-01 12:00:00');
    expect(lines[1]).toContain('进程 3');
    expect(lines[1]).toContain('分组 2');
    expect(lines[3]).toContain('进程 / 组');
  });

  it('默认折叠：多实例组只显示组行（带 ▸），不显示成员 PID', () => {
    const f = frame();
    const txt = f.lines.map(strip).join('\n');

    const groupRow = f.lines.findIndex((l) => strip(l).includes('chrome.exe (2)'));
    expect(groupRow).toBeGreaterThan(0);
    expect(f.lines[groupRow]).toContain('▸');
    expect(txt).not.toContain('111');
    expect(txt).not.toContain('222');
  });

  it('单实例组不受折叠影响，单行含 PID', () => {
    const single = frame().lines.map(strip).find((l) => l.includes('explorer.exe'));
    expect(single).toBeTruthy();
    expect(single).toContain('333');
  });

  it('expanded 集合展开指定组：▾ + 成员行按内存降序', () => {
    const f = frame({ expanded: new Set(['chrome.exe']) });
    const txt = f.lines.map(strip);

    expect(strip(f.lines[f.groupRows[0]!]!)).toContain('▾');
    const i111 = txt.findIndex((l) => l.includes('111'));
    const i222 = txt.findIndex((l) => l.includes('222'));
    expect(i111).toBeGreaterThan(0);
    expect(i222).toBeGreaterThan(0);
    expect(i111).toBeLessThan(i222); // 300MB 在 200MB 前
  });

  it('expandAll 展开全部', () => {
    const txt = frame({ expandAll: true }).lines.map(strip).join('\n');
    expect(txt).toContain('111');
    expect(txt).toContain('222');
  });

  it('groupRows 与可见组一一对应且指向组行', () => {
    const f = frame({ expanded: new Set(['chrome.exe']) });
    expect(f.groupRows).toHaveLength(2);
    expect(strip(f.lines[f.groupRows[0]!]!)).toContain('chrome.exe (2)');
    expect(strip(f.lines[f.groupRows[1]!]!)).toContain('explorer.exe');
    // 展开插入的成员行位于两个组行之间
    expect(f.groupRows[1]!).toBeGreaterThan(f.groupRows[0]! + 2);
  });

  it('cursorIndex 不破坏结构', () => {
    const f = frame({ cursorIndex: 0 });
    expect(strip(f.lines[f.groupRows[0]!]!)).toContain('chrome.exe (2)');
    expect(f.lines.length).toBeGreaterThan(5);
  });

  it('组间顺序：总内存大的组在前', () => {
    const lines = frame().lines.map(strip);
    expect(lines.findIndex((l) => l.includes('chrome.exe'))).toBeLessThan(
      lines.findIndex((l) => l.includes('explorer.exe')),
    );
  });

  it('top 截断组数量', () => {
    const lines = frame({ top: 1 }).lines.map(strip);
    expect(lines.some((l) => l.includes('chrome.exe (2)'))).toBe(true);
    expect(lines.some((l) => l.includes('explorer.exe'))).toBe(false);
    expect(lines[1]).toContain('前 1 组');
  });

  it('空数据显示提示', () => {
    const f = renderFrame([], {
      width: 100,
      top: 0,
      timestamp: new Date(),
      intervalSec: 2,
      totalProcs: 0,
    });
    expect(f.lines.some((l) => l.includes('未捕获到任何进程'))).toBe(true);
    expect(f.groupRows).toEqual([]);
  });
});
