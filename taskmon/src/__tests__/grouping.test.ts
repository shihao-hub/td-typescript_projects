import { describe, expect, it } from 'vitest';
import { groupProcesses } from '../grouping.js';
import type { ProcessInfo } from '../types.js';

const MB = 1024 * 1024;

function p(name: string, pid: number, mb: number): ProcessInfo {
  return { name, pid, memBytes: mb * MB };
}

describe('groupProcesses', () => {
  it('同名进程归为一组', () => {
    const groups = groupProcesses([p('a.exe', 1, 10), p('a.exe', 2, 20), p('b.exe', 3, 100)]);
    expect(groups.map((g) => g.name)).toEqual(['b.exe', 'a.exe']);
    const a = groups[1]!;
    expect(a.processes).toHaveLength(2);
    expect(a.totalBytes).toBe(30 * MB);
  });

  it('组间按总内存降序', () => {
    const groups = groupProcesses([
      p('a.exe', 1, 10),
      p('a.exe', 2, 10),
      p('a.exe', 3, 10), // 30
      p('b.exe', 4, 100), // 100
      p('c.exe', 5, 5), // 5
    ]);
    expect(groups.map((g) => g.name)).toEqual(['b.exe', 'a.exe', 'c.exe']);
  });

  it('组内按单进程内存降序', () => {
    const groups = groupProcesses([
      p('a.exe', 101, 5),
      p('a.exe', 102, 30),
      p('a.exe', 103, 20),
    ]);
    const a = groups[0]!;
    expect(a.processes.map((x) => x.pid)).toEqual([102, 103, 101]);
    expect(a.maxSingleBytes).toBe(30 * MB);
  });

  it('空输入返回空数组', () => {
    expect(groupProcesses([])).toEqual([]);
  });
});
