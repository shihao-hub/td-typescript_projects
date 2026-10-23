import { freemem, totalmem } from 'node:os';

/**
 * 物理内存口径（≈ 任务管理器「使用中 / 可用」）：
 * Windows 上 os.totalmem()/os.freemem() 对应 GlobalMemoryStatusEx 的
 * ullTotalPhys / ullAvailPhys，used = total - free。零子进程开销，每拍顺手取一次。
 */
export interface SysMem {
  total: number;
  used: number;
  free: number;
  /** used / total，0~1 */
  usedPct: number;
}

export function readSysMem(): SysMem {
  const total = totalmem();
  const free = freemem();
  const used = Math.max(0, total - free);
  return { total, used, free, usedPct: total > 0 ? used / total : 0 };
}
