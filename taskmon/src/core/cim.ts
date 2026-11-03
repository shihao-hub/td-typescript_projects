import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** CIM 拓扑快照的单进程记录（Get-CimInstance Win32_Process 的精简投影） */
export interface CimProc {
  pid: number;
  ppid: number;
  name: string;
  /** 创建时间（epoch 毫秒）；受保护进程可能为 null */
  created: number | null;
  /** 完整命令行；System 等受保护进程为 null */
  cmd: string | null;
  /** 累计 CPU 时间（100ns 单位，KernelModeTime + UserModeTime） */
  cpuTime?: number;
  /** 最近采样周期的 CPU 占用率（0~1，占整机总核心算力） */
  cpuPct?: number;
}

/**
 * 采集脚本要点：
 * - [Console]::OutputEncoding=UTF8：WinPS 5.1 管道输出默认 OEM，中文命令行会乱码
 * - created 输出 epoch 毫秒：绕开 ConvertTo-Json 的 /Date()/ 序列化歧义
 *   （解析器仍兼容 /Date()/ 形态，双保险）
 * - cpu: KernelModeTime + UserModeTime 累计 100ns 时间片
 */
const CIM_SCRIPT = [
  'try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}',
  'Get-CimInstance Win32_Process | ForEach-Object {',
  '  $created = $null',
  '  if ($_.CreationDate) { $created = [DateTimeOffset]::new($_.CreationDate).ToUnixTimeMilliseconds() }',
  '  $cpu = [int64]($_.KernelModeTime + $_.UserModeTime)',
  '  [PSCustomObject]@{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; name = [string]$_.Name; created = $created; cmd = $_.CommandLine; cpu = $cpu }',
  '} | ConvertTo-Json -Compress',
].join('\n');

/** 解析 created 字段：epoch 毫秒数字，或 /Date(1234567890)/ 字符串 */
export function parseCreated(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = /\/Date\((\d+)\)\//.exec(v);
    if (m) return Number(m[1]!);
  }
  return null;
}

/** 解析 CIM JSON 输出（对象或数组均兼容），坏行静默跳过 */
export function parseCimJson(text: string): CimProc[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return [];
  }
  const arr = Array.isArray(data) ? data : [data];
  const out: CimProc[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const pid = Number(r['pid']);
    const ppid = Number(r['ppid']);
    if (!Number.isFinite(pid) || !Number.isFinite(ppid)) continue;
    const name = typeof r['name'] === 'string' ? r['name'] : '';
    if (!name) continue;
    const proc: CimProc = {
      pid,
      ppid,
      name,
      created: parseCreated(r['created']),
      cmd: typeof r['cmd'] === 'string' && r['cmd'] ? r['cmd'] : null,
    };
    const rawCpu = r['cpu'] ?? r['cpuTime'];
    if (typeof rawCpu === 'number' && Number.isFinite(rawCpu)) {
      proc.cpuTime = rawCpu;
    }
    out.push(proc);
  }
  return out;
}

/**
 * 计算两次 CIM 采集快照之间的进程 CPU 占用率（0~1，相对于整机总核心算力）。
 * - 结果直接写入 curr 中的每个 CimProc.cpuPct
 * - PID 0（System Idle Process）固定置 0，避免空闲进程常驻冲顶干扰视线
 */
export function computeCpuPercentages(
  curr: Map<number, CimProc>,
  currAt: number,
  prev: Map<number, CimProc> | undefined,
  prevAt: number | undefined,
  cores: number,
): void {
  if (!prev || prevAt === undefined || currAt <= prevAt || cores <= 0) {
    for (const p of curr.values()) p.cpuPct = 0;
    return;
  }
  const dtMs = currAt - prevAt;
  const totalSlice = dtMs * 10_000 * cores;
  if (totalSlice <= 0) {
    for (const p of curr.values()) p.cpuPct = 0;
    return;
  }

  for (const [pid, proc] of curr) {
    if (pid === 0) {
      proc.cpuPct = 0;
      continue;
    }
    const prevProc = prev.get(pid);
    if (prevProc && proc.cpuTime !== undefined && prevProc.cpuTime !== undefined) {
      const deltaCpu = proc.cpuTime - prevProc.cpuTime;
      proc.cpuPct = deltaCpu > 0 ? Math.max(0, Math.min(1, deltaCpu / totalSlice)) : 0;
    } else {
      proc.cpuPct = 0;
    }
  }
}

/** 按_pid 建索引（重复 PID 保留首个） */
export function indexByPid(procs: CimProc[]): Map<number, CimProc> {
  const m = new Map<number, CimProc>();
  for (const p of procs) {
    if (!m.has(p.pid)) m.set(p.pid, p);
  }
  return m;
}

/**
 * 一次性 CIM 拓扑采集（实测约 2-4s，含 powershell 启动 ~1s）。
 * 失败抛异常，由调用方降级（不阻塞 tasklist 主刷新）。
 */
export async function collectCimProcesses(timeoutMs = 30_000): Promise<Map<number, CimProc>> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', CIM_SCRIPT],
    {
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      timeout: timeoutMs,
      encoding: 'utf8',
    },
  );
  return indexByPid(parseCimJson(stdout));
}
