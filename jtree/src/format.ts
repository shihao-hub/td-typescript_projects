/**
 * 显示宽度工具：ANSI 剥离 + CJK 双宽感知的截断/补齐。
 * 思路移植自 taskmon/src/format.ts，保持 jtree 既有的 `…` 截断风格。
 */

/** 匹配 SGR 颜色转义序列；导出供测试 strip 使用 */
export const ANSI_RE = /\x1b\[[0-9;]*m/g;

/** 东亚宽字符（CJK/谚文/全角区段）按 2 列计 */
const WIDE_CHAR_RE =
  /[ᄀ-ᅟ〈-〉⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏ꥠ-꥿가-힣豈-﫿︐-︙︰-﹯＀-｠￠-￦]/;

const ELLIPSIS = '…';

/** 单个码点的显示列数（宽字符 2 列，其余 1 列） */
function codePointWidth(ch: string): number {
  return WIDE_CHAR_RE.test(ch) ? 2 : 1;
}

/** 剥离 ANSI 颜色码后按 CJK 双宽估算的显示宽度 */
export function displayWidth(s: string): number {
  const plain = s.replace(ANSI_RE, '');
  let width = 0;
  for (const ch of plain) width += codePointWidth(ch);
  return width;
}

/** 超出 budget 显示宽度时截断，尾部以 … 结尾（… 按 1 列计） */
export function clipToWidth(s: string, budget: number): string {
  if (budget <= 0) return '';
  if (displayWidth(s) <= budget) return s;
  const limit = budget - ELLIPSIS.length;
  let width = 0;
  let out = '';
  for (const ch of s) {
    const w = codePointWidth(ch);
    if (width + w > limit) break;
    out += ch;
    width += w;
  }
  return out + ELLIPSIS;
}

/** 按显示宽度右侧补空格至 w 列；已达或超宽时原样返回 */
export function padEndWidth(s: string, w: number): string {
  const width = displayWidth(s);
  if (width >= w) return s;
  return s + ' '.repeat(w - width);
}
