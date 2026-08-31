import chalk from 'chalk';
import type { ProcessGroup } from './types.js';
import type { SysMem } from './sysmem.js';
import { bar, displayWidth, formatBytes, padEnd, padStart, truncate } from './format.js';

export interface RenderOptions {
  width: number;
  /** 只显示前 N 组（0 = 全部） */
  top: number;
  timestamp: Date;
  intervalSec: number;
  totalProcs: number;
  /** 物理内存读数：驱动摘要行与组行「占比」（占物理总量） */
  sysMem?: SysMem;
  /** 已展开的组名集合（多实例组默认折叠） */
  expanded?: ReadonlySet<string>;
  /** 无视 expanded 集合，直接展开全部 */
  expandAll?: boolean;
  /** 光标所在组序号（top 过滤后的可见组列表内），用于高亮该组行 */
  cursorIndex?: number;
}

export interface Frame {
  lines: string[];
  /** 每个可见组的"组行"在 lines 中的行号（与可见组一一对应） */
  groupRows: number[];
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
/** 展开指示符占位（▸ / ▾ + 空格） */
const IND_W = 2;

/** 渲染整帧（纯函数）：默认仅展示分组行，展开的组追加成员行 */
export function renderFrame(allGroups: ProcessGroup[], opts: RenderOptions): Frame {
  const width = Math.max(72, Math.min(300, opts.width));
  const groups = opts.top > 0 ? allGroups.slice(0, opts.top) : allGroups;
  const lines: string[] = [];
  const groupRows: number[] = [];

  const totalMem = allGroups.reduce((s, g) => s + g.totalBytes, 0);
  const maxTotal = groups[0]?.totalBytes ?? 0;

  // 标题 + 时间（右侧留 2 列余量：部分字体把 · 等歧义宽度字符按 2 渲染，恰好占满会换行截尾）
  const time = fmtDateTime(opts.timestamp);
  const title = 'taskmon · 内存监控';
  lines.push(chalk.bold.cyan(padEnd(title, width - displayWidth(time) - 2)) + chalk.dim(time));

  // 摘要
  const sep = chalk.dim(' · ');
  const statsParts = [
    `进程 ${chalk.bold(String(opts.totalProcs))}`,
    `分组 ${chalk.bold(String(allGroups.length))}`,
  ];
  if (opts.sysMem) {
    statsParts.push(
      `物理内存 ${chalk.bold(`${(opts.sysMem.usedPct * 100).toFixed(1)}%`)} 已用` +
        chalk.dim(`(${formatBytes(opts.sysMem.used)}/${formatBytes(opts.sysMem.total)})`),
    );
  }
  statsParts.push(`工作集合计 ${chalk.bold(formatBytes(totalMem))}`, `刷新 ${opts.intervalSec}s`);
  if (opts.top > 0) statsParts.push(chalk.dim(`前 ${groups.length} 组`));
  lines.push(statsParts.join(sep));

  // 分隔线
  lines.push(chalk.dim('-'.repeat(width)));

  if (groups.length === 0) {
    lines.push(chalk.yellow('未捕获到任何进程'));
    return { lines, groupRows };
  }

  // 列宽计算
  const nameW = Math.max(
    18,
    Math.min(40, ...groups.map((g) => displayWidth(g.name) + (g.processes.length > 1 ? ` (${g.processes.length})`.length : 0))),
  );
  const nameColW = nameW + IND_W;
  const barW = Math.max(8, Math.min(40, width - (RANK_W + PID_W + MEM_W + PCT_W + GAP.length * 5 + nameColW)));

  // 列头
  lines.push(
    chalk.bold(
      padStart('#', RANK_W) + GAP + padEnd('  进程 / 组', nameColW) + GAP + padStart('PID', PID_W) + GAP +
        padStart('内存', MEM_W) + GAP + padStart('占比', PCT_W) + GAP + padEnd('分布', barW),
    ),
  );

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]!;
    const multi = g.processes.length > 1;
    const isOpen = opts.expandAll === true || opts.expanded?.has(g.name) === true;
    const tier = memTier(g.totalBytes);
    const label = multi ? `${g.name} (${g.processes.length})` : g.name;
    const ind = multi ? (isOpen ? '▾ ' : '▸ ') : '  ';
    const nameCell = padEnd(ind + truncate(label, nameW), nameColW);

    // 组行：排名 + 名称(×N + 展开指示) + [单例时 PID] + 总内存 + 占物理总量% + 条形图
    const ratio = maxTotal > 0 ? g.totalBytes / maxTotal : 0;
    const filled = Math.round(Math.max(0, Math.min(1, ratio)) * barW);
    const barCell =
      (filled > 0 ? chalk[tier]('█'.repeat(filled)) : '') + chalk.dim('░'.repeat(Math.max(0, barW - filled)));
    const pctCell =
      opts.sysMem && opts.sysMem.total > 0
        ? chalk[tier](padStart(`${((g.totalBytes / opts.sysMem.total) * 100).toFixed(1)}%`, PCT_W))
        : ' '.repeat(PCT_W);

    // 行首文本单元格（选中行整体反色；条形图不参与反色，否则嵌套 ANSI 复位码会把彩色块渲成黑块）
    const head =
      chalk.dim(padStart(String(i + 1), RANK_W)) + GAP +
      (multi ? chalk.bold(nameCell) : nameCell) + GAP +
      (multi ? ' '.repeat(PID_W) : chalk.dim(padStart(String(g.processes[0]!.pid), PID_W))) + GAP +
      chalk.bold(chalk[tier](padStart(formatBytes(g.totalBytes), MEM_W))) + GAP +
      pctCell;
    lines.push((opts.cursorIndex === i ? chalk.inverse(head) : head) + GAP + barCell);
    groupRows.push(lines.length - 1);

    // 组内成员行（仅展开时）：PID + 单进程内存 + 组内占比
    if (multi && isOpen) {
      for (const p of g.processes) {
        const pct = g.totalBytes > 0 ? (p.memBytes / g.totalBytes) * 100 : 0;
        lines.push(
          ' '.repeat(RANK_W) + GAP + ' '.repeat(nameColW) + GAP +
            chalk.dim(padStart(String(p.pid), PID_W)) + GAP +
            padStart(formatBytes(p.memBytes), MEM_W) + GAP +
            chalk.dim(padStart(`${pct.toFixed(1)}%`, PCT_W)),
        );
      }
    }

    if (i < groups.length - 1) lines.push('');
  }

  return { lines, groupRows };
}
