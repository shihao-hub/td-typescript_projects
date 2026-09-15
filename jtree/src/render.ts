/**
 * 渲染第二段：FlatRow[] → 着色/截断后的行文本。
 *
 * - render() 对外签名与 v0.2.0 一致：flattenTree（缺省全展开）+ formatRows；
 *   纯 ASCII 输入下逐字节等价（截断预算公式保持历史口径，仅 .length 换成显示宽度）。
 * - formatRow/formatRows 供 TUI 复用：indicators 控制容器行尾 ▾/▸，colored:false 输出零 ANSI
 *   （选中行反色底稿，避免 ANSI 反色嵌套渲坏）。
 */

import chalk from 'chalk';
import { clipToWidth, displayWidth } from './format.js';
import { flattenTree, type FlatRow } from './flatten.js';

export interface RenderOptions {
  /** 终端宽度上限，超出的单行截断；默认 120 */
  width?: number;
}

export interface FormatOptions {
  /** 终端宽度上限，超出的单行截断 */
  width: number;
  /** 容器行尾显示 ▾/▸ 折叠指示（TUI 用）；默认 false（纯打印） */
  indicators?: boolean;
  /** false 时输出零 ANSI（选中行反色底稿用）；默认 true */
  colored?: boolean;
}

const DEFAULT_WIDTH = 120;

/** 着色器抽象：colored:false 时全部直通，产出零 ANSI */
interface Painter {
  dim(t: string): string;
  green(t: string): string;
  yellow(t: string): string;
}

const plainPainter: Painter = {
  dim: (t) => t,
  green: (t) => t,
  yellow: (t) => t,
};

/** 原始值同行显示的着色文本；budget 为该值可占用的显示列数 */
function primitiveText(v: unknown, budget: number, c: Painter): string {
  if (typeof v === 'string') {
    let s = JSON.stringify(v);
    if (displayWidth(s) > budget) {
      // 预留闭引号宽度，截断后补上保持视觉完整
      s = clipToWidth(s, budget - 1);
      if (!s.endsWith('"')) s += '"';
    }
    return c.green(s);
  }
  if (typeof v === 'number') return c.yellow(String(v));
  if (typeof v === 'boolean') return c.dim(String(v));
  return c.dim('null');
}

/** 树形前缀：每层 2 空格缩进 + ├─/└─，无竖线延续线；根原始值行无前缀 */
function headText(row: FlatRow): string {
  if (row.depth === 0) return '';
  return '  '.repeat(row.depth - 1) + (row.isLast ? '└─ ' : '├─ ');
}

/** 单行格式化：前缀 + 标签 + 占位/原始值/折叠指示 */
export function formatRow(row: FlatRow, opts: FormatOptions): string {
  const c = opts.colored === false ? plainPainter : chalk;
  const head = headText(row);
  const label = row.labelDim ? c.dim(row.label) : row.label;

  if (row.placeholder !== undefined) return head + label + ' ' + c.dim(row.placeholder);
  if (row.leafValue !== undefined) {
    // 根原始值行无前缀与标签，直接输出值
    if (row.depth === 0) return primitiveText(row.leafValue, opts.width, c);
    // v0.2.0 历史预算口径：entry 行扣 2（key: + 空格）、element 行扣 5-len(i)（[i] + 空格），
    // 统一为 -1-(labelDim?2:0)，纯 ASCII 下逐字节等价；中文等宽字符按显示列数计
    const budget = opts.width - displayWidth(head + row.label) - 1 - (row.labelDim ? 2 : 0);
    return head + label + ' ' + primitiveText(row.leafValue, budget, c);
  }
  const ind = opts.indicators && row.expandable ? ' ' + c.dim(row.expanded ? '▾' : '▸') : '';
  return head + label + ind;
}

export function formatRows(rows: readonly FlatRow[], opts: FormatOptions): string[] {
  return rows.map((r) => formatRow(r, opts));
}

/**
 * 通用 JSON → 树形文本（taskmon 风格：每层 2 空格缩进 + ├─/└─，无竖线延续线）。
 *
 * 规则：
 * - 对象：每个键一行，原始值同行显示；空对象/空数组显示 {} / []
 * - 数组：键名附 (N) 计数，元素以 [i] 为节点；原始值同行，对象元素展开全部字段
 * - 颜色：树符号/计数/[i]/bool/null 灰，字符串绿，数字黄；非 TTY 或 NO_COLOR 自动无色
 */
export function render(value: unknown, opts: RenderOptions = {}): string[] {
  return formatRows(flattenTree(value), { width: opts.width ?? DEFAULT_WIDTH });
}
