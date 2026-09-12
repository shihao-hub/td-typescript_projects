import { noopPainter } from './color.js';
import type { Painter } from './color.js';

export interface RenderOptions {
  /** 着色器，默认 noop（纯文本） */
  painter?: Painter;
  /** 终端可视宽度上限，超出截断；默认 120 */
  width?: number;
}

const DEFAULT_WIDTH = 120;
const ELLIPSIS = '…';

/** 树形连接符 */
const TEE = '├─ ';
const ELBOW = '└─ ';
const PIPE = '│  ';
const SPACE = '   ';

/** 摘要标签优先使用的键名（命中即用其值做数组对象元素的标题） */
const PREFERRED_KEYS = ['cmd', 'command', 'name', 'flag', 'title', 'id', 'type', 'key', 'path', 'url', 'method'];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** CJK 等宽字符按 2 列计的简易可视宽度 */
function visualWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    w += c >= 0x1100 && (c <= 0x115f || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6)) ? 2 : 1;
  }
  return w;
}

/** 按可视宽度截断，尾部以 … 结尾 */
function truncate(s: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (visualWidth(s) <= maxWidth) return s;
  const budget = maxWidth - visualWidth(ELLIPSIS);
  let w = 0;
  let out = '';
  for (const ch of s) {
    const cw = visualWidth(ch);
    if (w + cw > budget) break;
    out += ch;
    w += cw;
  }
  return out + ELLIPSIS;
}

/** 原始值的纯文本形态：字符串带引号（保持 JSON 语感） */
function primitivePlain(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return String(v);
  return 'null';
}

function primitivePainted(v: unknown, p: Painter): string {
  if (typeof v === 'string') return p.string(JSON.stringify(v));
  if (typeof v === 'number') return p.number(String(v));
  if (typeof v === 'boolean') return p.bool(String(v));
  return p.nullish('null');
}

/**
 * 原始值单行显示，超预算时截断（字符串截断后补闭引号，保持视觉完整）
 * budget 为该值可占用的可视列数；painter 参与着色
 */
function primitiveLine(v: unknown, p: Painter, budget: number): string {
  let plain = primitivePlain(v);
  const isStr = typeof v === 'string';
  if (visualWidth(plain) > budget) {
    // 字符串预留闭引号宽度，截断后补上保持视觉完整
    plain = truncate(plain, isStr ? budget - 1 : budget);
    if (isStr && !plain.endsWith('"')) plain += '"';
  }
  return primitivePaintedLike(v, plain, p);
}

/** 按值类型把已构造好的 plain 文本交给对应着色函数 */
function primitivePaintedLike(v: unknown, plain: string, p: Painter): string {
  if (typeof v === 'string') return p.string(plain);
  if (typeof v === 'number') return p.number(plain);
  if (typeof v === 'boolean') return p.bool(plain);
  return p.nullish(plain);
}

/** 数组对象元素的摘要：优先常见键名，否则取第一个 string 字段 */
function summarizeObject(obj: Record<string, unknown>): string | undefined {
  for (const k of PREFERRED_KEYS) {
    if (typeof obj[k] === 'string') return obj[k] as string;
  }
  for (const v of Object.values(obj)) {
    if (typeof v === 'string') return v;
  }
  return undefined;
}

/**
 * 通用 JSON → 树形文本。纯函数：相同输入与 painter 得到相同输出。
 * 形态约定：
 * - 对象：键为节点，原始值同行显示；空对象/空数组显示 {} / []
 * - 数组：元素以 [i] 为节点；原始值同行，对象元素以摘要做标题后仍展开全部字段
 * - 单行超出 width（按 CJK 双宽计）截断加 …
 */
export function render(value: unknown, opts: RenderOptions = {}): string[] {
  const painter = opts.painter ?? noopPainter;
  const width = opts.width ?? DEFAULT_WIDTH;
  const out: string[] = [];

  // 顶层原始值：单行直接显示
  if (!isPlainObject(value) && !Array.isArray(value)) {
    out.push(primitiveLine(value, painter, width));
    return out;
  }

  const emitEntry = (key: string, v: unknown, prefix: string, isLast: boolean): void => {
    const branch = isLast ? ELBOW : TEE;
    const head = prefix + branch;
    const childPrefix = prefix + (isLast ? SPACE : PIPE);
    const label = painter.key(key) + painter.empty(':');
    const budget = width - visualWidth(head) - visualWidth(key) - 2;

    if (isPlainObject(v)) {
      const keys = Object.keys(v);
      if (keys.length === 0) {
        out.push(head + label + ' ' + painter.empty('{}'));
        return;
      }
      out.push(head + label);
      emitChildren(keys, v, childPrefix);
    } else if (Array.isArray(v)) {
      if (v.length === 0) {
        out.push(head + label + ' ' + painter.empty('[]'));
        return;
      }
      out.push(head + label);
      emitElements(v, childPrefix);
    } else {
      out.push(head + label + ' ' + primitiveLine(v, painter, budget));
    }
  };

  const emitChildren = (keys: string[], obj: Record<string, unknown>, prefix: string): void => {
    keys.forEach((k, i) => {
      emitEntry(k, obj[k], prefix, i === keys.length - 1);
    });
  };

  const emitElement = (i: number, v: unknown, prefix: string, isLast: boolean): void => {
    const branch = isLast ? ELBOW : TEE;
    const head = prefix + branch;
    const childPrefix = prefix + (isLast ? SPACE : PIPE);
    const index = painter.index(`[${i}]`);
    const budget = width - visualWidth(head) - String(i).length - 3;

    if (isPlainObject(v)) {
      const keys = Object.keys(v);
      if (keys.length === 0) {
        out.push(head + index + ' ' + painter.empty('{}'));
        return;
      }
      const summary = summarizeObject(v);
      if (summary !== undefined) {
        out.push(head + index + ' ' + painter.summary(truncate(summary, budget)));
      } else {
        out.push(head + index);
      }
      emitChildren(keys, v, childPrefix);
    } else if (Array.isArray(v)) {
      if (v.length === 0) {
        out.push(head + index + ' ' + painter.empty('[]'));
        return;
      }
      out.push(head + index);
      emitElements(v, childPrefix);
    } else {
      out.push(head + index + ' ' + primitiveLine(v, painter, budget));
    }
  };

  const emitElements = (arr: unknown[], prefix: string): void => {
    arr.forEach((v, i) => {
      emitElement(i, v, prefix, i === arr.length - 1);
    });
  };

  if (isPlainObject(value)) {
    emitChildren(Object.keys(value), value, '');
  } else {
    emitElements(value, '');
  }
  return out;
}
