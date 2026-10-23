import { listProcesses } from './tasklist.js';
import { collectCimProcesses } from './cim.js';
import type { CimProc } from './cim.js';
import { groupProcesses } from './grouping.js';
import { buildTree, mergeTopology } from './proctree.js';
import type { ProcessTreeNode } from './proctree.js';
import { readSysMem } from './sysmem.js';
import type { SysMem } from './sysmem.js';
import type { ProcessGroup, ProcessInfo } from './types.js';
import { logger } from '../shared/logger.js';

export interface Snapshot {
  at: number;
  procs: ProcessInfo[];
  groups: ProcessGroup[];
  tree: ProcessTreeNode[];
  totalProcs: number;
  sysMem: SysMem;
  topology: { available: boolean; at: number | null };
  error?: string;
}

/**
 * 采样器：tasklist 主频刷新 + CIM 低频拓扑（overlap-skip）。
 * TUI 与 HTTP 服务共用同一套采集语义；HTTP 侧只读缓存，绝不为每个请求 spawn 子进程。
 */
export class Sampler {
  private procs: ProcessInfo[] = [];
  private groups: ProcessGroup[] = [];
  private tree: ProcessTreeNode[] = [];
  private cim = new Map<number, CimProc>();
  private cimAt: Date | undefined;
  private cimBusy = false;
  private cimWarned = false;
  private busy = false;
  private running = false;
  private timer: NodeJS.Timeout | undefined;
  private cimTimer: NodeJS.Timeout | undefined;
  private lastAt = new Date();
  private lastError: string | undefined;

  constructor(private readonly intervalMs = 2_000) {}

  start(): Promise<void> {
    if (this.running) return Promise.resolve();
    this.running = true;
    const first = this.tick();
    void this.cimTick();
    return first;
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.cimTimer) clearTimeout(this.cimTimer);
    this.timer = undefined;
    this.cimTimer = undefined;
  }

  snapshot(): Snapshot {
    return {
      at: this.lastAt.getTime(),
      procs: this.procs,
      groups: this.groups,
      tree: this.tree,
      totalProcs: this.procs.length,
      sysMem: readSysMem(),
      topology: { available: this.cim.size > 0, at: this.cimAt?.getTime() ?? null },
      error: this.lastError,
    };
  }

  private applyTopology(): void {
    this.procs = mergeTopology(this.procs, this.cim);
    this.groups = groupProcesses(this.procs);
    this.tree = buildTree(this.procs);
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      this.procs = await listProcesses();
      this.applyTopology();
      this.lastAt = new Date();
      this.lastError = undefined;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      logger.error({ err: this.lastError }, '采集进程数据失败');
    } finally {
      this.busy = false;
      this.scheduleTick();
    }
  }

  private scheduleTick(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => void this.tick(), this.intervalMs);
  }

  private scheduleCim(): void {
    if (!this.running) return;
    this.cimTimer = setTimeout(() => void this.cimTick(), this.intervalMs);
  }

  private async cimTick(): Promise<void> {
    if (!this.running || this.cimBusy) {
      this.scheduleCim();
      return;
    }
    this.cimBusy = true;
    try {
      this.cim = await collectCimProcesses();
      this.cimAt = new Date();
      if (this.procs.length > 0) this.applyTopology();
    } catch (e) {
      if (!this.cimWarned) {
        this.cimWarned = true;
        logger.warn({ err: e instanceof Error ? e.message : String(e) }, 'CIM 拓扑采集失败，树视图降级（主刷新不受影响）');
      }
    } finally {
      this.cimBusy = false;
      this.scheduleCim();
    }
  }
}

export const sampler = new Sampler();
