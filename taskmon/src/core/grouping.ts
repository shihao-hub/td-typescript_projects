import type { ProcessGroup, ProcessInfo } from './types.js';

/**
 * 按进程名分组：
 * - 组间按总内存从大到小排序
 * - 组内按单进程内存从大到小排序
 */
export function groupProcesses(procs: ProcessInfo[]): ProcessGroup[] {
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
    const processes = [...list].sort((a, b) => b.memBytes - a.memBytes);
    const totalBytes = processes.reduce((s, p) => s + p.memBytes, 0);
    groups.push({
      name,
      processes,
      totalBytes,
      maxSingleBytes: processes[0]?.memBytes ?? 0,
    });
  }

  groups.sort((a, b) => b.totalBytes - a.totalBytes);
  return groups;
}
