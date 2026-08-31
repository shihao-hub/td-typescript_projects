import { describe, expect, it } from 'vitest';
import { classifyAttempt, guardKill, killPid, killPids } from '../kill.js';
import type { ProcessGroup } from '../types.js';

function makeGroup(name: string, pids: number[]): ProcessGroup {
  return {
    name,
    processes: pids.map((pid) => ({ name, pid, memBytes: 1024 })),
    totalBytes: pids.length * 1024,
    maxSingleBytes: 1024,
  };
}

describe('guardKill', () => {
  it('保护名单命中则拒绝（大小写不敏感）', () => {
    expect(guardKill(makeGroup('svchost.exe', [1]), 999).ok).toBe(false);
    expect(guardKill(makeGroup('DWM.exe', [1]), 999).ok).toBe(false);
    expect(guardKill(makeGroup('System Idle Process', [0]), 999).ok).toBe(false);
  });

  it('组内含 taskmon 自身 PID 则拒绝（防自杀，含开发模式 node.exe 组）', () => {
    expect(guardKill(makeGroup('node.exe', [123, 456]), 456).ok).toBe(false);
    expect(guardKill(makeGroup('taskmon.exe', [789]), 789).ok).toBe(false);
  });

  it('普通组放行', () => {
    expect(guardKill(makeGroup('notepad.exe', [1, 2]), 999).ok).toBe(true);
  });

  it('拒绝时携带原因文案', () => {
    const r = guardKill(makeGroup('explorer.exe', [1]), 999);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('explorer.exe');
  });
});

describe('classifyAttempt', () => {
  it('0 → killed', () => {
    expect(classifyAttempt({ code: 0 })).toEqual({ outcome: 'killed' });
  });

  it('128 → gone（快照过期或被 /T 连带杀掉）', () => {
    expect(classifyAttempt({ code: 128 })).toEqual({ outcome: 'gone', detail: '进程已退出' });
  });

  it('1 → failed（拒绝访问）', () => {
    expect(classifyAttempt({ code: 1 }).detail).toContain('无权限');
  });

  it('SIGTERM → timeout（我方超时击毙 taskkill）', () => {
    expect(classifyAttempt({ code: null, signal: 'SIGTERM' })).toEqual({ outcome: 'timeout', detail: '树终止超时' });
  });

  it('启动失败字符串码 → failed', () => {
    expect(classifyAttempt({ code: 'ENOENT' }).detail).toContain('无法启动 taskkill');
  });
});

describe('killPid', () => {
  it('/T 一次成功，不再回退', async () => {
    const calls: string[] = [];
    const runner = async (args: string[]) => {
      calls.push(args.join(' '));
      return { code: 0 };
    };
    const r = await killPid(100, runner);
    expect(r).toMatchObject({ pid: 100, outcome: 'killed' });
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
    expect(calls).toEqual(['/F /T /PID 100']);
  });

  it('128 → gone', async () => {
    const r = await killPid(100, async () => ({ code: 128 }));
    expect(r.outcome).toBe('gone');
    expect(r.detail).toBe('进程已退出');
  });

  it('/T 超时则回退不带 /T 的直接结束', async () => {
    const calls: string[][] = [];
    const runner = async (args: string[]) => {
      calls.push(args);
      return args.includes('/T') ? { code: null, signal: 'SIGTERM' } : { code: 0 };
    };
    const r = await killPid(100, runner);
    expect(r.outcome).toBe('killed');
    expect(r.detail).toContain('超时');
    expect(calls).toEqual([
      ['/F', '/T', '/PID', '100'],
      ['/F', '/PID', '100'],
    ]);
  });

  it('回退也超时则 failed（树终止超时）', async () => {
    const r = await killPid(100, async () => ({ code: null, signal: 'SIGTERM' }));
    expect(r.outcome).toBe('failed');
    expect(r.detail).toContain('超时');
  });

  it('启动失败不回退', async () => {
    let n = 0;
    const r = await killPid(
      100,
      async () => {
        n++;
        return { code: 'ENOENT' };
      },
    );
    expect(r.outcome).toBe('failed');
    expect(n).toBe(1);
  });
});

describe('killPids', () => {
  it('串行逐个结束并回调进度', async () => {
    const calls: string[] = [];
    const progress: string[] = [];
    const runner = async (args: string[]) => {
      calls.push(args.join(' '));
      return { code: 0 };
    };
    const results = await killPids([1, 2, 3], runner, (p) => progress.push(`${p.i}/${p.total}:${p.pid}`));
    expect(calls).toEqual(['/F /T /PID 1', '/F /T /PID 2', '/F /T /PID 3']);
    expect(progress).toEqual(['1/3:1', '2/3:2', '3/3:3']);
    expect(results.map((r) => r.outcome)).toEqual(['killed', 'killed', 'killed']);
  });

  it('展示序：failed 在前，同类按 PID 升序', async () => {
    const runner = async (args: string[]) => {
      const pid = Number(args[3]);
      return { code: pid % 2 === 0 ? 0 : 1 };
    };
    const results = await killPids([5, 2, 9, 4], runner);
    expect(results.map((r) => r.pid)).toEqual([5, 9, 2, 4]);
    expect(results.map((r) => r.outcome)).toEqual(['failed', 'failed', 'killed', 'killed']);
  });

  it('空列表返回空结果', async () => {
    expect(await killPids([], async () => ({ code: 0 }))).toEqual([]);
  });
});
