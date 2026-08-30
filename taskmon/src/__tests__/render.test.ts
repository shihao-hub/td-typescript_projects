import { describe, expect, it } from 'vitest';
import chalk from 'chalk';
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

describe('renderFrame', () => {
  it('包含标题、摘要、列头', () => {
    const lines = renderFrame(buildGroups(), {
      width: 100,
      top: 0,
      timestamp: new Date('2026-01-01T12:00:00'),
      intervalSec: 2,
      totalProcs: 3,
    }).map(strip);

    expect(lines[0]).toContain('taskmon');
    expect(lines[0]).toContain('2026-01-01 12:00:00');
    expect(lines[1]).toContain('进程 3');
    expect(lines[1]).toContain('分组 2');
    expect(lines[3]).toContain('进程 / 组');
  });

  it('多实例组展示组行与成员行，单例组单行', () => {
    const lines = renderFrame(buildGroups(), {
      width: 100,
      top: 0,
      timestamp: new Date(),
      intervalSec: 2,
      totalProcs: 3,
    }).map(strip);

    const groupRow = lines.findIndex((l) => l.includes('chrome.exe (2)'));
    expect(groupRow).toBeGreaterThan(0);
    expect(lines.some((l) => l.includes('111'))).toBe(true);
    expect(lines.some((l) => l.includes('222'))).toBe(true);
    const single = lines.find((l) => l.includes('explorer.exe'));
    expect(single).toBeTruthy();
    expect(single).toContain('333');
  });

  it('组间顺序：总内存大的组在前', () => {
    const lines = renderFrame(buildGroups(), {
      width: 100,
      top: 0,
      timestamp: new Date(),
      intervalSec: 2,
      totalProcs: 3,
    }).map(strip);

    expect(lines.findIndex((l) => l.includes('chrome.exe'))).toBeLessThan(
      lines.findIndex((l) => l.includes('explorer.exe')),
    );
  });

  it('top 截断组数量', () => {
    const lines = renderFrame(buildGroups(), {
      width: 100,
      top: 1,
      timestamp: new Date(),
      intervalSec: 2,
      totalProcs: 3,
    }).map(strip);

    expect(lines.some((l) => l.includes('chrome.exe (2)'))).toBe(true);
    expect(lines.some((l) => l.includes('explorer.exe'))).toBe(false);
    expect(lines[1]).toContain('前 1 组');
  });

  it('空数据显示提示', () => {
    const lines = renderFrame([], {
      width: 100,
      top: 0,
      timestamp: new Date(),
      intervalSec: 2,
      totalProcs: 0,
    });
    expect(lines.some((l) => l.includes('未捕获到任何进程'))).toBe(true);
  });

  it('chalk 在非 TTY 下自动去色也不影响结构', () => {
    const lines = renderFrame(buildGroups(), {
      width: 100,
      top: 0,
      timestamp: new Date(),
      intervalSec: 2,
      totalProcs: 3,
    });
    expect(lines.length).toBeGreaterThan(5);
    expect(chalk.level).toBeTypeOf('number');
  });
});
