// core.js —— 数学 / 缓动 / 确定性随机 / Canvas2D 绘制小工具
// 所有函数均为纯函数：同一输入必然得到同一输出，保证 renderFrame(t) 确定性。

// ---------- 基础数学 ----------

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const lerp = (a, b, p) => a + (b - a) * p;

// 把 t 从区间 [a, b] 归一化到 [0, 1]，越界截断
export const remap = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

// ---------- 缓动 ----------

export const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
export const easeInOutCubic = (p) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
export const easeOutQuart = (p) => 1 - Math.pow(1 - p, 4);

// 取 [a, b] 区间内的缓动进度（未到 a 为 0，过了 b 为 1）
export const seg = (t, a, b, ease = easeOutCubic) => ease(remap(t, a, b));

// 元素出现动画：delay 后用 dur 时间淡入，返回 0..1
export const appear = (t, delay, dur = 0.5, ease = easeOutCubic) =>
  seg(t, delay, delay + dur, ease);

// 元素消失动画：tEnd 前用 dur 时间淡出，返回 1..0
export const disappear = (t, tEnd, dur = 0.6, ease = easeInOutCubic) =>
  1 - seg(t, tEnd - dur, tEnd, ease);

// ---------- 确定性随机（固定种子，逐位可复现） ----------

export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 主题（浅底文档风） ----------

export const THEME = {
  bg: "#faf8f5", // 暖米白底
  ink: "#17171a", // 主文字
  sub: "#75757d", // 次要灰
  faint: "#a9a9b0", // 更浅灰
  line: "#e4e1dc", // 分隔线
  blockBg: "#f2efea", // 代码块浅底
  green: "#177245", // ok
  red: "#b3372f", // error
  orange: "#b0641e", // stderr
  bandDark: "#23232a", // stdout 深墨带
  bandDarkText: "#ededf0",
  bandDarkSub: "#b9b9c2",
  bandOrangeBg: "#f6e8d9", // stderr 淡橙带
};

// 字体栈（系统字体，同机渲染确定性成立）
export const SANS = '"Microsoft YaHei", "Segoe UI", sans-serif';
export const MONO = '"Cascadia Mono", Consolas, "Courier New", monospace';

// ---------- Canvas2D 绘制 ----------

/**
 * 画一行文字，返回文字宽度。
 * opts: { x, y, size, family, weight, color, align, baseline, alpha, spacing }
 */
export function drawText(ctx, text, opts) {
  const {
    x,
    y,
    size = 32,
    family = SANS,
    weight = 400,
    color = THEME.ink,
    align = "left",
    baseline = "alphabetic",
    alpha = 1,
    spacing = 0,
  } = opts;
  if (alpha <= 0) return 0;
  let width = 0;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.font = `${weight} ${size}px ${family}`;
  if (spacing > 0) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(text, x, y);
  width = ctx.measureText(text).width;
  ctx.restore();
  return width;
}

// 先把字体设进 ctx，保证 measureText 与绘制一致
export function setFont(ctx, size, family = MONO, weight = 500) {
  ctx.font = `${weight} ${size}px ${family}`;
}

// 圆角矩形
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 场景左上角的统一小标签：语义色小方块 + 文字
export function drawLabel(ctx, text, opts = {}) {
  const { alpha = 1, dot = THEME.ink, x = 220, y = 150 } = opts;
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = dot;
  ctx.fillRect(x, y - 22, 14, 14);
  ctx.restore();
  drawText(ctx, text, {
    x: x + 34,
    y,
    size: 30,
    weight: 600,
    color: THEME.sub,
    alpha,
  });
}
