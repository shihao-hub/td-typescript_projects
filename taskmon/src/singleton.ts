import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { logger } from './logger.js';
import { parseTasklistCsv } from './tasklist.js';

const execFileAsync = promisify(execFile);

/** 锁内 startedAt 与目标进程 CreationDate 的比对容差：覆盖 node 启动 + 模块加载耗时（秒级） */
const START_TOLERANCE_MS = 5_000;
const PS_TIMEOUT_MS = 10_000;
const ACTIVATE_TIMEOUT_MS = 15_000;

/** 允许持锁的进程名（小写）：exe 本体 / tsx·node 直跑 / bun 直跑 */
export const VALID_OWNER_NAMES: ReadonlySet<string> = new Set(['taskmon.exe', 'node.exe', 'bun.exe']);

export interface LockInfo {
  pid: number;
  mode: 'exe' | 'dev';
  version: string;
  /** 写锁时刻（Date.now()）≈ 进程启动时刻，与 CreationDate 比对防 PID 复用 */
  startedAt: number;
  hostname: string;
}

export type LockDecision =
  | { action: 'claim' }
  | { action: 'activate'; info: LockInfo };

export interface ActivateResult {
  ok: boolean;
  reason?: string;
}

// 判定 exe/dev 必须用全局 process：import process 会让 Bun --define 的文本替换失配（README「日志」已记录的同类坑）
function isPackaged(): boolean {
  return process.env.TASKMON_VERSION !== undefined;
}

function lockDir(): string {
  return join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'taskmon');
}

function lockPath(): string {
  // 按版本隔离：不同版本（含 dev 与 exe 之间）各持一把锁，可并行；唤起也只唤起同版本实例
  const version = process.env.TASKMON_VERSION ?? 'dev';
  return join(lockDir(), `singleton-v${version}.lock`);
}

function ownLockInfo(): LockInfo {
  return {
    pid: process.pid,
    mode: isPackaged() ? 'exe' : 'dev',
    version: process.env.TASKMON_VERSION ?? 'dev',
    startedAt: Date.now(),
    hostname: os.hostname(),
  };
}

/** 锁文件文本 → LockInfo；JSON 损坏/缺字段/类型不对 → undefined（纯函数，单测目标） */
export function parseLockText(text: string): LockInfo | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const { pid, mode, version, startedAt, hostname } = r;
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return undefined;
  if (mode !== 'exe' && mode !== 'dev') return undefined;
  if (typeof version !== 'string' || version.length === 0) return undefined;
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return undefined;
  if (typeof hostname !== 'string' || hostname.length === 0) return undefined;
  return { pid, mode, version, startedAt, hostname };
}

function readLock(): LockInfo | undefined {
  try {
    return parseLockText(readFileSync(lockPath(), 'utf8'));
  } catch {
    return undefined;
  }
}

/** O_EXCL 抢锁：写入成功即成为唯一实例；EEXIST（并发竞态）返回 false，其余异常上抛由调用方降级 */
function writeLockExclusive(info: LockInfo): boolean {
  mkdirSync(lockDir(), { recursive: true });
  try {
    writeFileSync(lockPath(), JSON.stringify(info), { flag: 'wx' });
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw e;
  }
}

/** 退出清理：仅当锁内 pid 仍是自己时删除，避免误删后来接管者的锁 */
export function releaseLock(): void {
  try {
    if (readLock()?.pid === process.pid) unlinkSync(lockPath());
  } catch {
    // 退出路径，忽略
  }
}

function removeLockFile(reason: string): void {
  try {
    unlinkSync(lockPath());
    logger.info({ reason }, '删除陈旧单例锁');
  } catch {
    // 文件已不存在等，忽略
  }
}

/** pid 存活探测：signal 0 探测；EPERM = 存在但提权；其余（含 ESRCH）按已退出处理，宁可放行启动 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * 探测目标进程的名字与启动时刻：进程不存在 → undefined。
 * 主路径 PowerShell Get-CimInstance（一次拿到名字 + CreationDate）；
 * PS 不可用/超时 → 降级 tasklist 只查名字（startMs=NaN，无法防 PID 复用，已知风险见 README）。
 * pid 经 parseLockText 校验为正整数，内插无注入风险。
 */
async function probeProcess(pid: number): Promise<{ name: string; startMs: number } | undefined> {
  const script = [
    `$p = Get-CimInstance -ClassName Win32_Process -Filter 'ProcessId=${pid}'`,
    `if ($p) { "{0}|{1}" -f $p.Name, ([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds() }`,
  ].join('\n');
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      timeout: PS_TIMEOUT_MS,
    });
    const line = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (!line) return undefined; // 查询成功但无此进程
    const [name, startRaw] = line.split('|');
    const startMs = Number(startRaw);
    if (!name || !Number.isFinite(startMs)) return undefined;
    return { name, startMs };
  } catch {
    try {
      const { stdout } = await execFileAsync('tasklist', ['/fo', 'csv', '/nh', '/fi', `PID eq ${pid}`], {
        windowsHide: true,
        timeout: 15_000,
        maxBuffer: 8 * 1024 * 1024,
      });
      const hit = parseTasklistCsv(stdout).find((p) => p.pid === pid);
      return hit ? { name: hit.name, startMs: Number.NaN } : undefined;
    } catch {
      return undefined;
    }
  }
}

/** 锁与存活进程是否同一实例：名字白名单 + 启动时刻 ±容差；startMs=NaN（tasklist 降级）时仅校验名字 */
export function matchesLock(info: LockInfo, probe: { name: string; startMs: number }): boolean {
  if (!VALID_OWNER_NAMES.has(probe.name.toLowerCase())) return false;
  if (Number.isNaN(probe.startMs)) return true;
  return Math.abs(probe.startMs - info.startedAt) <= START_TOLERANCE_MS;
}

/**
 * 单例主入口：无锁/陈锁 → claim（锁已写好，调用方注册退出清理）；已有存活实例 → activate。
 * 陈锁自愈：进程死 / PID 被无关进程复用 / 文件损坏 / 跨机器 → 删除后重写。
 * 两轮验证仍无法建立（病态竞态）→ 强制覆写接管：宁可极小概率双开，也不阻塞启动。
 */
export async function ensureSingleton(): Promise<LockDecision> {
  // 迁移：清理不带版本号的旧版全局锁（对旧实例无害：其退出时的释放会静默跳过）
  try {
    unlinkSync(join(lockDir(), 'singleton.lock'));
  } catch {
    // 不存在或不可删，忽略
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!existsSync(lockPath())) {
      if (writeLockExclusive(ownLockInfo())) return { action: 'claim' };
      continue; // 并发竞态：别人刚写入，下一轮走验证分支
    }
    const lock = readLock();
    if (!lock) {
      removeLockFile('锁文件损坏或不可读');
      continue;
    }
    if (lock.hostname !== os.hostname()) {
      removeLockFile('锁来自其他机器（用户目录被同步）');
      continue;
    }
    if (!isPidAlive(lock.pid)) {
      removeLockFile(`PID ${lock.pid} 已退出`);
      continue;
    }
    const probe = await probeProcess(lock.pid);
    if (!probe) {
      removeLockFile(`PID ${lock.pid} 探测不到`);
      continue;
    }
    if (matchesLock(lock, probe)) return { action: 'activate', info: lock };
    removeLockFile(`PID ${lock.pid} 已被其他进程复用（${probe.name}）`);
  }
  mkdirSync(lockDir(), { recursive: true });
  writeFileSync(lockPath(), JSON.stringify(ownLockInfo()), { flag: 'w' });
  logger.warn('单例锁两轮验证未决，强制覆写接管');
  return { action: 'claim' };
}

/**
 * 唤起已运行实例的控制台窗口。控制台窗口属 conhost / WindowsTerminal 所有，按 PID 枚举窗口找不到，
 * 正确姿势是在本 PowerShell 子进程内 FreeConsole → AttachConsole(目标 pid) → GetConsoleWindow
 * 拿到对方控制台顶层窗口后还原 + 前置。FreeConsole 只作用于 PS 子进程自身，Node 侧不受影响。
 * 退出码：0 成功；2 AttachConsole 失败（对方无控制台）；4 拿不到窗口句柄。
 */
export async function activateInstance(pid: number): Promise<ActivateResult> {
  const script = [
    "$sig = @'",
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class Win {',
    '  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool FreeConsole();',
    '  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool AttachConsole(uint dwProcessId);',
    '  [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();',
    '  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);',
    '  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);',
    '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
    '  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);',
    '}',
    "'@",
    'Add-Type -TypeDefinition $sig',
    // 无条件 FreeConsole：windowsHide 的 CREATE_NO_WINDOW 会给 PS 一个无窗口的隐藏控制台，
    // 不先脱离会导致 AttachConsole 报 ERROR_ACCESS_DENIED；无控制台时 FreeConsole 无副作用
    '[void][Win]::FreeConsole()',
    `if (-not [Win]::AttachConsole(${pid})) { exit 2 }`,
    '$h = [Win]::GetConsoleWindow()',
    'if ($h -eq [IntPtr]::Zero) { exit 4 }',
    'if ([Win]::IsIconic($h)) { [void][Win]::ShowWindow($h, 9) }',
    'if (-not [Win]::SetForegroundWindow($h)) { [Win]::SwitchToThisWindow($h, $true) }',
    'exit 0',
  ].join('\n');
  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      timeout: ACTIVATE_TIMEOUT_MS,
    });
    return { ok: true };
  } catch (e) {
    // execFile 非零退出时 err.code 为退出码（number）；启动失败为 'ENOENT' 等字符串
    const code = (e as { code?: number | string }).code;
    if (code === 2) return { ok: false, reason: '对方实例无控制台窗口' };
    if (code === 4) return { ok: false, reason: '未找到对方窗口句柄' };
    if (code === 'ENOENT') return { ok: false, reason: '无法启动 PowerShell' };
    return { ok: false, reason: `PowerShell 异常（${String(code)}）` };
  }
}
