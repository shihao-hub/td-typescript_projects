// scenes.js —— 五个镜头的绘制函数（每个都是 (ctx, local) 的纯函数）
// 动画只允许：淡入淡出、打字机、位移、划线——不做任何视觉特效。

import {
  THEME,
  SANS,
  MONO,
  drawText,
  drawLabel,
  roundRect,
  setFont,
  seg,
  appear,
  disappear,
  lerp,
} from "./core.js";
import { WIDTH } from "./time.js";

const W = WIDTH;
const X0 = 220; // 全局左边距

// ============================================================
// 镜头 1：标题（0–5s）
// ============================================================
export function drawTitle(ctx, t) {
  const out = disappear(t, 5.0, 0.6);

  const p1 = appear(t, 0.2, 0.7);
  drawText(ctx, "CLI + JSON 输出模式", {
    x: W / 2,
    y: lerp(500, 476, p1),
    size: 96,
    weight: 700,
    align: "center",
    alpha: p1 * out,
  });

  const p2 = appear(t, 0.9, 0.6);
  drawText(ctx, "一条命令行 = 人用工具 + 机器 API", {
    x: W / 2,
    y: lerp(600, 584, p2),
    size: 38,
    color: THEME.sub,
    align: "center",
    alpha: p2 * out,
  });

  // 细分隔线从中心展开
  const p3 = seg(t, 1.6, 2.2);
  if (p3 > 0) {
    const half = 260 * p3;
    ctx.save();
    ctx.globalAlpha = 0.9 * out;
    ctx.fillStyle = THEME.line;
    ctx.fillRect(W / 2 - half, 656, half * 2, 2);
    ctx.restore();
  }
}

// ============================================================
// 镜头 2：痛点（5–10s，local 0–5）
// ============================================================
const PAIN_LINES = ["$ tool list", "name       status   count", "zedhub     active   12", "fy         active   3"];

const PAIN_FRAGS = [
  { text: 'split("\\n")', x: 220, y: 640 },
  { text: 'indexOf("status")', x: 480, y: 640 },
  { text: "match(/name\\s+(.*)/)", x: 810, y: 640 },
  { text: "slice(9)", x: 220, y: 706 },
  { text: "trim()", x: 380, y: 706 },
];

export function drawPain(ctx, t) {
  const out = disappear(t, 5.0, 0.6);

  const pLabel = appear(t, 0.1, 0.4);
  drawLabel(ctx, "传统 CLI：人类可读文本", { alpha: pLabel * out });

  // 代码块浅底
  const pBlock = appear(t, 0.2, 0.5);
  ctx.save();
  ctx.globalAlpha = pBlock * out;
  ctx.fillStyle = THEME.blockBg;
  roundRect(ctx, X0, 220, 1010, 320, 16);
  ctx.fill();
  // 左侧细竖线
  ctx.fillStyle = "#d8d3cb";
  ctx.fillRect(X0, 220, 4, 320);
  ctx.restore();

  // 代码文本（删除后整体变淡）
  const delP = seg(t, 2.3, 3.1); // 删除线进度
  const dimmed = 1 - 0.6 * delP;
  ctx.save();
  setFont(ctx, 30, MONO, 500);
  for (let i = 0; i < PAIN_LINES.length; i++) {
    drawText(ctx, PAIN_LINES[i], {
      x: X0 + 56,
      y: 300 + i * 58,
      size: 30,
      family: MONO,
      color: i === 0 ? THEME.ink : THEME.sub,
      alpha: pBlock * dimmed * out,
    });
  }
  ctx.restore();

  // 红色删除线从左到右扫过代码块
  if (delP > 0 && delP < 1) {
    ctx.save();
    ctx.globalAlpha = 0.85 * out;
    ctx.fillStyle = THEME.red;
    ctx.fillRect(X0 + 20, 220 + 320 / 2 - 2, (1010 - 40) * delP, 4);
    ctx.restore();
  }

  // 正则碎片逐个浮现
  for (let i = 0; i < PAIN_FRAGS.length; i++) {
    const f = PAIN_FRAGS[i];
    const p = appear(t, 0.9 + i * 0.16, 0.35);
    if (p <= 0) continue;
    drawText(ctx, f.text, {
      x: f.x,
      y: f.y + (1 - p) * 8,
      size: 26,
      family: MONO,
      color: THEME.faint,
      alpha: p * out,
    });
  }

  // 结论行
  const pConc = appear(t, 3.2, 0.6);
  drawText(ctx, "文本即接口 → 解析脆弱", {
    x: W / 2,
    y: 892,
    size: 46,
    weight: 700,
    align: "center",
    alpha: pConc * out,
  });
}

// ============================================================
// 镜头 3：JSON 包络（10–18s，local 0–8）
// ============================================================
const OK_TOKENS = [
  { text: '{"ok": ' },
  { text: "true", color: THEME.green },
  { text: ', "data": ["zedhub", "fy"]}' },
];

const ERR_TOKENS = [
  { text: '{"ok": ' },
  { text: "false", color: THEME.red },
  { text: ',\n  "error": {"code": ' },
  { text: '"not_found"', color: THEME.red },
  { text: ', "message": "未注册"}}' },
];

export function drawEnvelope(ctx, t) {
  const out = disappear(t, 8.0, 0.7);

  const pLabel = appear(t, 0.1, 0.4);
  drawLabel(ctx, "stdout 永远是合法 JSON", { alpha: pLabel * out, dot: THEME.green });

  // ---- 成功包络：打字机 ----
  const okAlpha = appear(t, 0.3, 0.3) * disappear(t, 4.0, 0.5);
  if (okAlpha > 0) {
    const typeDur = 1.6;
    const count = Math.floor(seg(t, 0.4, 0.4 + typeDur, (p) => p) * totalLen(OK_TOKENS));
    const typing = t < 0.4 + typeDur;
    const blink = Math.floor(t * 2.5) % 2 === 0;
    drawJsonBlock(ctx, OK_TOKENS, count, okAlpha, typing && blink, 420);

    const pNote = appear(t, 2.4, 0.5);
    drawText(ctx, "成功 → data 可直接被程序消费", {
      x: W / 2,
      y: 560,
      size: 30,
      color: THEME.sub,
      align: "center",
      alpha: pNote * okAlpha,
    });
  }

  // ---- 失败包络：打字机 ----
  const errAlpha = appear(t, 4.4, 0.3);
  if (errAlpha > 0) {
    const typeDur = 2.2;
    const count = Math.floor(seg(t, 4.5, 4.5 + typeDur, (p) => p) * totalLen(ERR_TOKENS));
    const typing = t < 4.5 + typeDur;
    const blink = Math.floor(t * 2.5) % 2 === 0;
    drawJsonBlock(ctx, ERR_TOKENS, count, errAlpha, typing && blink, 420);

    const pNote = appear(t, 6.6, 0.5);
    drawText(ctx, "错误也是数据 → code 可编程处理", {
      x: W / 2,
      y: 620,
      size: 30,
      color: THEME.sub,
      align: "center",
      alpha: pNote * errAlpha,
    });
  }
}

// 计算 tokens 总字符数
function totalLen(tokens) {
  return tokens.reduce((n, tok) => n + tok.text.length, 0);
}

// 以「块整体居中、行内左对齐」绘制 JSON 代码块（按最终文本定位，打字过程不漂移）
function drawJsonBlock(ctx, tokens, charCount, alpha, cursorVisible, yTop) {
  if (alpha <= 0 || charCount <= 0) return;
  const size = 34;
  const lineHeight = 58;

  // 先按完整文本计算块宽度，块起点固定，打字机不引起左右漂移
  ctx.save();
  setFont(ctx, size, MONO, 500);
  const fullLines = wrapLines(tokens);
  let maxW = 0;
  for (const line of fullLines) {
    maxW = Math.max(maxW, ctx.measureText(line.map((tok) => tok.text).join("")).width);
  }
  ctx.restore();
  const x0 = W / 2 - maxW / 2;

  let remaining = charCount;
  for (let i = 0; i < fullLines.length; i++) {
    if (remaining <= 0) break;
    const line = fullLines[i];
    const lineLen = line.reduce((n, tok) => n + tok.text.length, 0);
    const shown = Math.min(remaining, lineLen);
    const y = yTop + i * lineHeight;

    // 逐 token 绘制本行已打出的部分，记录行末 x
    let cx = x0;
    let left = shown;
    for (const tok of line) {
      if (left <= 0) break;
      const piece = tok.text.slice(0, left);
      cx += drawText(ctx, piece, {
        x: cx,
        y,
        size,
        family: MONO,
        weight: 500,
        color: tok.color || THEME.ink,
        alpha,
      });
      left -= tok.text.length;
    }

    if (shown < lineLen && cursorVisible) {
      // 打字中：光标停在当前行末
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = THEME.sub;
      ctx.fillRect(cx + 4, y - 28, 3, size);
      ctx.restore();
    }
    remaining -= lineLen;
  }
}

// 把 token 流按换行符拆成多行
function wrapLines(tokens) {
  const lines = [[]];
  for (const tok of tokens) {
    const parts = tok.text.split("\n");
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) lines.push([]);
      if (parts[i]) lines[lines.length - 1].push({ text: parts[i], color: tok.color });
    }
  }
  return lines;
}

// ============================================================
// 镜头 4：stdout / stderr 纪律（18–24s，local 0–6）
// ============================================================
function drawBand(ctx, t, { delay, y, dark, title, lines }) {
  const p = appear(t, delay, 0.6);
  if (p <= 0) return;
  const bx = X0 + (1 - p) * -48;
  const bw = 1480;
  const bh = 158;
  ctx.save();
  ctx.globalAlpha = p;
  ctx.fillStyle = dark ? THEME.bandDark : THEME.bandOrangeBg;
  roundRect(ctx, bx, y, bw, bh, 18);
  ctx.fill();
  ctx.restore();

  drawText(ctx, title, {
    x: bx + 56,
    y: y + bh / 2 + 16,
    size: 44,
    family: MONO,
    weight: 700,
    color: dark ? THEME.bandDarkText : THEME.orange,
    alpha: p,
  });

  for (let i = 0; i < lines.length; i++) {
    drawText(ctx, lines[i], {
      x: bx + 430,
      y: y + bh / 2 - 18 + i * 52 + 16,
      size: 30,
      color: dark ? THEME.bandDarkSub : THEME.sub,
      alpha: p,
    });
  }
}

export function drawStreams(ctx, t) {
  const out = disappear(t, 6.0, 0.6);

  const pLabel = appear(t, 0.1, 0.4);
  drawLabel(ctx, "stdout / stderr 纪律", { alpha: pLabel * out });

  drawBand(ctx, t, {
    delay: 0.3,
    y: 320,
    dark: true,
    title: "stdout",
    lines: ["管理命令的错误 JSON 也走 stdout", "消费方只需解析一个流"],
  });
  drawBand(ctx, t, {
    delay: 0.7,
    y: 530,
    dark: false,
    title: "stderr",
    lines: ["透传命令的前置错误走 stderr", "stdout 只属于子进程"],
  });

  const pConc = appear(t, 2.2, 0.6);
  drawText(ctx, "两个流，两种职责", {
    x: W / 2,
    y: 860,
    size: 38,
    weight: 600,
    color: THEME.sub,
    align: "center",
    alpha: pConc * out,
  });
}

// ============================================================
// 镜头 5：退出码 + 收尾（24–30s，local 0–6）
// ============================================================
const CODES = [
  { code: "0", desc: "成功", dx: -380 },
  { code: "1", desc: "失败", dx: 0 },
  { code: "127", desc: "未注册 / 透传", dx: 380 },
];

export function drawOutro(ctx, t) {
  const out = disappear(t, 6.0, 0.8);

  // 三个退出码依次淡入
  for (let i = 0; i < CODES.length; i++) {
    const c = CODES[i];
    const p = appear(t, 0.2 + i * 0.22, 0.45);
    drawText(ctx, c.code, {
      x: W / 2 + c.dx,
      y: 430,
      size: 120,
      family: MONO,
      weight: 700,
      align: "center",
      alpha: p * out,
    });
    drawText(ctx, c.desc, {
      x: W / 2 + c.dx,
      y: 492,
      size: 27,
      color: THEME.sub,
      align: "center",
      alpha: p * out,
    });
  }

  // 分隔线展开
  const pLine = seg(t, 1.6, 2.2);
  if (pLine > 0) {
    const half = 320 * pLine;
    ctx.save();
    ctx.globalAlpha = 0.9 * out;
    ctx.fillStyle = THEME.line;
    ctx.fillRect(W / 2 - half, 600, half * 2, 2);
    ctx.restore();
  }

  // 收尾标题卡
  const pT = appear(t, 2.4, 0.6);
  drawText(ctx, "CLI / GUI 分离", {
    x: W / 2,
    y: 724,
    size: 80,
    weight: 700,
    align: "center",
    alpha: pT * out,
  });

  const pS = appear(t, 3.0, 0.6);
  drawText(ctx, "一条命令行 = 人用工具 + 机器 API", {
    x: W / 2,
    y: 806,
    size: 36,
    color: THEME.sub,
    align: "center",
    alpha: pS * out,
  });
}
