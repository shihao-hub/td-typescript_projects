import type { ProcessGroup, ProcessInfo } from './types.js';

/**
 * 按进程名分组：
 * - 组间按总内存或总 CPU 占用从大到小排序
 * - 组内按单进程内存或单进程 CPU 占用从大到小排序
 */
export function groupProcesses(procs: ProcessInfo[], sortBy: 'mem' | 'cpu' = 'mem'): ProcessGroup[] {
  const byName = new Map<string, ProcessInfo[]>();
  for (const p of procs) {
    const list = byName.get(p.name);
    if (list) {
      list.push(p);
    } else {
      byName.set(p.name, [p]);
    }
  }

  const groups: ProcessGroup[] = [];
  for (const [name, list] of byName) {
    const processes = [...list].sort((a, b) => {
      if (sortBy === 'cpu') {
        return (b.cpuPct ?? 0) - (a.cpuPct ?? 0) || b.memBytes - a.memBytes || a.pid - b.pid;
      }
      return b.memBytes - a.memBytes || (b.cpuPct ?? 0) - (a.cpuPct ?? 0) || a.pid - b.pid;
    });
    const totalBytes = processes.reduce((s, p) => s + p.memBytes, 0);
    const hasCpu = processes.some((p) => p.cpuPct !== undefined);
    const totalCpuPct = hasCpu ? processes.reduce((s, p) => s + (p.cpuPct ?? 0), 0) : undefined;
    groups.push({
      name,
      processes,
      totalBytes,
      maxSingleBytes: processes[0]?.memBytes ?? 0,
      totalCpuPct,
    });
  }

  if (sortBy === 'cpu') {
    groups.sort((a, b) => (b.totalCpuPct ?? 0) - (a.totalCpuPct ?? 0) || b.totalBytes - a.totalBytes);
  } else {
    groups.sort((a, b) => b.totalBytes - a.totalBytes || (b.totalCpuPct ?? 0) - (a.totalCpuPct ?? 0));
  }
  return groups;
}
