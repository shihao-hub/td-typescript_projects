import chalk from 'chalk';
import type { ProcessGroup } from './types.js';
import { bar, displayWidth, formatBytes, padEnd, padStart, truncate } from './format.js';

export interface RenderOptions {
  width: number;
  /** 只显示前 N 组（0 = 全部） */
  top: number;
  timestamp: Date;
  intervalSec: number;
  totalProcs: number;
}

type Tier = 'red' | 'yellow' | 'green';

function memTier(bytes: number): Tier {
  if (bytes >= 1024 ** 3) return 'red';
  if (bytes >= 256 * 1024 ** 2) return 'yellow';
  return 'green';
}

function fmtDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const RANK_W = 3;
const PID_W = 6;
const MEM_W = 10;
const PCT_W = 7;
const GAP = '  ';

/** 渲染整帧（纯函数）：返回逐行文本，不含滚动视口逻辑 */
export function renderFrame(allGroups: ProcessGroup[], opts: RenderOptions): string[] {
  const width = Math.max(72, Math.min(300, opts.width));
  const groups = opts.top > 0 ? allGroups.slice(0, opts.top) : allGroups;
  const lines: string[] = [];

  const totalMem = allGroups.reduce((s, g) => s + g.totalBytes, 0);
  const maxTotal = groups[0]?.totalBytes ?? 0;

  // 标题 + 时间
  const time = fmtDateTime(opts.timestamp);
  const title = 'taskmon · 内存监控';
  lines.push(chalk.bold.cyan(padEnd(title, width - displayWidth(time))) + chalk.dim(time));

  // 摘要
  const stats =
    `进程 ${chalk.bold(String(opts.totalProcs))}` +
    chalk.dim(' · ') +
    `分组 ${chalk.bold(String(allGroups.length))}` +
    chalk.dim(' · ') +
    `内存合计 ${chalk.bold(formatBytes(totalMem))}` +
    chalk.dim(' · ') +
    `刷新 ${opts.intervalSec}s` +
    (opts.top > 0 ? chalk.dim(` · 前 ${groups.length} 组`) : '');
  lines.push(stats);

  // 分隔线
  lines.push(chalk.dim('-'.repeat(width)));

  if (groups.length === 0) {
    lines.push(chalk.yellow('未捕获到任何进程'));
    return lines;
  }

  // 列宽计算
  const nameW = Math.max(
    18,
    Math.min(40, ...groups.map((g) => displayWidth(g.name) + (g.processes.length > 1 ? ` (${g.processes.length})`.length : 0))),
  );
  const barW = Math.max(8, Math.min(40, width - (RANK_W + PID_W + MEM_W + PCT_W + GAP.length * 5 + nameW)));

  // 列头
  lines.push(
    chalk.bold(
      padStart('#', RANK_W) + GAP + padEnd('进程 / 组', nameW) + GAP + padStart('PID', PID_W) + GAP +
        padStart('内存', MEM_W) + GAP + padStart('组内%', PCT_W) + GAP + padEnd('分布', barW),
    ),
  );

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]!;
    const multi = g.processes.length > 1;
    const tier = memTier(g.totalBytes);
    const label = multi ? `${g.name} (${g.processes.length})` : g.name;
    const nameCell = padEnd(truncate(label, nameW), nameW);

    // 组行：排名 + 名称(×N) + [单例时 PID] + 总内存 + 条形图
    const ratio = maxTotal > 0 ? g.totalBytes / maxTotal : 0;
    const filled = Math.round(Math.max(0, Math.min(1, ratio)) * barW);
    const barCell =
      (filled > 0 ? chalk[tier]('█'.repeat(filled)) : '') + chalk.dim('░'.repeat(Math.max(0, barW - filled)));

    lines.push(
      chalk.dim(padStart(String(i + 1), RANK_W)) + GAP +
        (multi ? chalk.bold(nameCell) : nameCell) + GAP +
        (multi ? ' '.repeat(PID_W) : chalk.dim(padStart(String(g.processes[0]!.pid), PID_W))) + GAP +
        chalk.bold(chalk[tier](padStart(formatBytes(g.totalBytes), MEM_W))) + GAP +
        ' '.repeat(PCT_W) + GAP +
        barCell,
    );

    // 组内成员行：PID + 单进程内存 + 组内占比
    if (multi) {
      for (const p of g.processes) {
        const pct = g.totalBytes > 0 ? (p.memBytes / g.totalBytes) * 100 : 0;
        lines.push(
          ' '.repeat(RANK_W) + GAP + ' '.repeat(nameW) + GAP +
            chalk.dim(padStart(String(p.pid), PID_W)) + GAP +
            padStart(formatBytes(p.memBytes), MEM_W) + GAP +
            chalk.dim(padStart(`${pct.toFixed(1)}%`, PCT_W)),
        );
      }
    }

    if (i < groups.length - 1) lines.push('');
  }

  return lines;
}
