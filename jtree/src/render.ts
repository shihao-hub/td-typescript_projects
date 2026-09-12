import chalk from 'chalk';

export interface RenderOptions {
  /** 终端宽度上限，超出的单行截断；默认 120 */
  width?: number;
}

const DEFAULT_WIDTH = 120;
const ELLIPSIS = '…';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 按字符数截断（不分中英宽度），尾部以 … 结尾 */
function clip(plain: string, budget: number): string {
  if (budget <= 0) return '';
  if (plain.length <= budget) return plain;
  return plain.slice(0, Math.max(0, budget - ELLIPSIS.length)) + ELLIPSIS;
}

/** 原始值同行显示的着色文本；budget 为该值可占用的字符数 */
function primitiveText(v: unknown, budget: number): string {
  if (typeof v === 'string') {
    let s = JSON.stringify(v);
    if (s.length > budget) {
      // 预留闭引号宽度，截断后补上保持视觉完整
      s = clip(s, budget - 1);
      if (!s.endsWith('"')) s += '"';
    }
    return chalk.green(s);
  }
  if (typeof v === 'number') return chalk.yellow(String(v));
  if (typeof v === 'boolean') return chalk.dim(String(v));
  return chalk.dim('null');
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
  const width = opts.width ?? DEFAULT_WIDTH;
  const out: string[] = [];

  const prefix = (depth: number, isLast: boolean): string =>
    '  '.repeat(depth - 1) + (isLast ? '└─ ' : '├─ ');

  const emitEntry = (key: string, v: unknown, depth: number, isLast: boolean): void => {
    const head = prefix(depth, isLast);
    let label = key + ':';
    if (Array.isArray(v) && v.length > 0) label = `${key} (${v.length}):`;

    if (isPlainObject(v)) {
      const keys = Object.keys(v);
      if (keys.length === 0) {
        out.push(head + label + ' ' + chalk.dim('{}'));
        return;
      }
      out.push(head + label);
      keys.forEach((k, i) => emitEntry(k, v[k], depth + 1, i === keys.length - 1));
    } else if (Array.isArray(v)) {
      if (v.length === 0) {
        out.push(head + label + ' ' + chalk.dim('[]'));
        return;
      }
      out.push(head + label);
      v.forEach((el, i) => emitElement(i, el, depth + 1, i === v.length - 1));
    } else {
      const budget = width - head.length - key.length - 2;
      out.push(head + label + ' ' + primitiveText(v, budget));
    }
  };

  const emitElement = (i: number, v: unknown, depth: number, isLast: boolean): void => {
    const head = prefix(depth, isLast);
    const label = chalk.dim(`[${i}]`);

    if (isPlainObject(v)) {
      const keys = Object.keys(v);
      if (keys.length === 0) {
        out.push(head + label + ' ' + chalk.dim('{}'));
        return;
      }
      out.push(head + label + chalk.dim(':'));
      keys.forEach((k, j) => emitEntry(k, v[k], depth + 1, j === keys.length - 1));
    } else if (Array.isArray(v)) {
      if (v.length === 0) {
        out.push(head + label + ' ' + chalk.dim('[]'));
        return;
      }
      out.push(head + label + chalk.dim(':'));
      v.forEach((el, j) => emitElement(j, el, depth + 1, j === v.length - 1));
    } else {
      const budget = width - head.length - String(i).length - 5;
      out.push(head + label + ' ' + primitiveText(v, budget));
    }
  };

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    keys.forEach((k, i) => emitEntry(k, value[k], 1, i === keys.length - 1));
  } else if (Array.isArray(value)) {
    value.forEach((el, i) => emitElement(i, el, 1, i === value.length - 1));
  } else {
    out.push(primitiveText(value, width));
  }
  return out;
}
