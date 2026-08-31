import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProcessGroup } from './types.js';

const execFileAsync = promisify(execFile);

/**
 * 单次 taskkill 尝试的超时。
 * /T 树终止需要对进程树做快照遍历，深树（如 IDE 带 node 子进程链）会很慢，
 * 因此给足余量；超时后由 killPid 回退到不带 /T 的直接结束。
 */
const TASKKILL_TIMEOUT_MS = 15_000;

/**
 * 硬保护名单（小写比较）：直接拒绝结束。
 * - 致命级：杀了蓝屏 / 系统瘫痪
 * - 高破坏级：杀了黑屏 / 桌面崩溃，真要杀请用系统任务管理器
 */
export const PROTECTED_NAMES: ReadonlySet<string> = new Set([
  // 致命级
  'system',
  'system idle process',
  'registry',
  'memory compression',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'winlogon.exe',
  'services.exe',
  'lsass.exe',
  'svchost.exe',
  'fontdrvhost.exe',
  // 高破坏级
  'dwm.exe',
  'explorer.exe',
  'sihost.exe',
  'taskhostw.exe',
]);

export type KillOutcome = 'killed' | 'gone' | 'failed';

export interface KillResult {
  pid: number;
  outcome: KillOutcome;
  /** 补充说明（无权限/已退出/超时回退等） */
  detail?: string;
  /** 单 PID 端到端耗时（ms），诊断慢树终止用 */
  durationMs: number;
}

/** 单次 taskkill 执行观测：code 为退出码（启动失败时是 'ENOENT' 等字符串；被超时信号杀死时为 null） */
export interface TaskkillAttempt {
  code: number | string | null | undefined;
  signal?: string;
}

export type KillRunner = (args: string[]) => Promise<TaskkillAttempt>;

async function defaultRunner(args: string[]): Promise<TaskkillAttempt> {
  try {
    await execFileAsync('taskkill', args, {
      windowsHide: true,
      timeout: TASKKILL_TIMEOUT_MS,
    });
    return { code: 0 };
  } catch (e) {
    // execFile 以非零退出码 reject，error.code 即 taskkill 退出码；
    // 超时被杀时 code 为 null 且 signal 为 'SIGTERM'；启动失败时 code 为 'ENOENT' 等字符串
    const err = e as { code?: number | string | null; signal?: string };
    return { code: err.code ?? null, signal: err.signal };
  }
}

type AttemptOutcome = { outcome: KillOutcome | 'timeout'; detail?: string };

/**
 * 退出码/信号 → 结果分类。
 * 不解析输出文本：taskkill 输出为 OEM 编码，中文系统上会乱码，成败只认退出码。
 * 0=成功；128=进程不存在（快照过期，或被同组父进程的 /T 连带杀掉）；1=典型为拒绝访问。
 */
export function classifyAttempt(a: TaskkillAttempt): AttemptOutcome {
  if (a.code === 0) return { outcome: 'killed' };
  if (a.code === 128) return { outcome: 'gone', detail: '进程已退出' };
  if (a.code === 1) return { outcome: 'failed', detail: '无权限（拒绝访问）' };
  if (a.signal === 'SIGTERM') return { outcome: 'timeout', detail: '树终止超时' };
  if (typeof a.code === 'string') return { outcome: 'failed', detail: `无法启动 taskkill(${a.code})` };
  return { outcome: 'failed', detail: `taskkill 异常(${String(a.code)})` };
}

/** 结束单个 PID：先 /F /T（连带子进程树），树终止超时则回退不带 /T 的直接结束（TerminateProcess，秒级） */
export async function killPid(pid: number, runner: KillRunner = defaultRunner): Promise<KillResult> {
  const start = Date.now();
  const finish = (r: AttemptOutcome): KillResult => ({
    pid,
    outcome: r.outcome === 'timeout' ? 'failed' : r.outcome,
    detail: r.detail,
    durationMs: Date.now() - start,
  });

  const tree = classifyAttempt(await runner(['/F', '/T', '/PID', String(pid)]));
  if (tree.outcome !== 'timeout') return finish(tree);

  const direct = classifyAttempt(await runner(['/F', '/PID', String(pid)]));
  if (direct.outcome === 'killed') return finish({ outcome: 'killed', detail: '树终止超时，回退直接结束' });
  return finish(direct);
}

export interface KillProgress {
  /** 正在串行结束第 i 个（1 起） */
  i: number;
  total: number;
  pid: number;
}

/**
 * 按 PID 快照串行结束整组。
 * 串行而非并行：组内父进程先死会让后续子 PID 的 taskkill 秒回 128，
 * 也避免多个 /T 对互相重叠的大树反复快照造成争用（曾导致整体超时一刀未落）。
 */
export async function killPids(
  pids: number[],
  runner: KillRunner = defaultRunner,
  onProgress?: (p: KillProgress) => void,
): Promise<KillResult[]> {
  const results: KillResult[] = [];
  for (let i = 0; i < pids.length; i++) {
    const pid = pids[i]!;
    onProgress?.({ i: i + 1, total: pids.length, pid });
    results.push(await killPid(pid, runner));
  }
  // 展示序：失败在前（需要用户关注），其次已结束、已退出；同类按 PID
  const order: Record<KillOutcome, number> = { failed: 0, killed: 1, gone: 2 };
  return results.sort((a, b) => order[a.outcome] - order[b.outcome] || a.pid - b.pid);
}

export interface GuardResult {
  ok: boolean;
  reason?: string;
}

/** kill 前护栏：保护名单 + 防自杀（taskmon 自身所在分组，含开发模式下的 node.exe 组） */
export function guardKill(group: ProcessGroup, ownPid: number): GuardResult {
  if (PROTECTED_NAMES.has(group.name.toLowerCase())) {
    return { ok: false, reason: `${group.name} 为系统保护进程，禁止结束` };
  }
  if (group.processes.some((p) => p.pid === ownPid)) {
    return { ok: false, reason: '不能结束 taskmon 自身所在的分组' };
  }
  return { ok: true };
}
