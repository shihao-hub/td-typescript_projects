import { cpus } from 'node:os';

/**
 * 系统 CPU 占用口径：
 * 基于 node:os cpus() 计算跨采样周期的 idle 与 total 时间增量：
 * deltaTotal = deltaUser + deltaNice + deltaSys + deltaIdle + deltaIrq
 * usedPct = 1 - deltaIdle / deltaTotal
 * 零子进程开销，纯 Node 原生系统调用。
 */
export interface SysCpu {
  /** 0~1 之间的占用率 */
  usedPct: number;
  /** 逻辑核心数量 */
  cores: number;
}

interface CpuSnapshot {
  idle: number;
  total: number;
}

let lastSnapshot: CpuSnapshot | undefined;

function takeSnapshot(): { idle: number; total: number; cores: number } {
  const list = cpus();
  let idle = 0;
  let total = 0;
  for (const c of list) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total, cores: list.length };
}

/** 读取当前系统 CPU 占用率（与上一拍比对；首拍返回 0） */
export function readSysCpu(): SysCpu {
  const snap = takeSnapshot();
  let usedPct = 0;
  if (lastSnapshot) {
    const deltaIdle = snap.idle - lastSnapshot.idle;
    const deltaTotal = snap.total - lastSnapshot.total;
    if (deltaTotal > 0) {
      usedPct = Math.max(0, Math.min(1, 1 - deltaIdle / deltaTotal));
    }
  }
  lastSnapshot = { idle: snap.idle, total: snap.total };
  return { usedPct, cores: snap.cores };
}

/** 重置快照状态（单测用） */
export function resetSysCpu(): void {
  lastSnapshot = undefined;
}
