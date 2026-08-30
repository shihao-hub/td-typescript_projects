const ANSI_RE = /\x1b\[[0-9;]*m/g;
const WIDE_RE =
  /[\u1100-\u115F\u2E80-\uA4CF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;

/** 终端显示宽度：跳过 ANSI 颜色码，CJK 等宽字符按 2 计 */
export function displayWidth(s: string): number {
  const t = s.replace(ANSI_RE, '');
  let w = 0;
  for (const ch of t) {
    w += WIDE_RE.test(ch) ? 2 : 1;
  }
  return w;
}

/** 按显示宽度截断，超出部分以 ".." 结尾 */
export function truncate(s: string, maxW: number): string {
  if (displayWidth(s) <= maxW) return s;
  let w = 0;
  let out = '';
  for (const ch of s.replace(ANSI_RE, '')) {
    const cw = WIDE_RE.test(ch) ? 2 : 1;
    if (w + cw > maxW - 2) break;
    out += ch;
    w += cw;
  }
  return out + '..';
}

export function padEnd(s: string, w: number): string {
  const d = w - displayWidth(s);
  return d > 0 ? s + ' '.repeat(d) : s;
}

export function padStart(s: string, w: number): string {
  const d = w - displayWidth(s);
  return d > 0 ? ' '.repeat(d) + s : s;
}

/** 字节数人性化显示：1024 进制，按量级自适应小数位 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  const dec = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(dec)} ${units[u]}`;
}

/** 生成 `██░░` 内存条 */
export function bar(filled: number, width: number): string {
  const f = Math.max(0, Math.min(width, Math.round(filled)));
  return '█'.repeat(f) + '░'.repeat(Math.max(0, width - f));
}
