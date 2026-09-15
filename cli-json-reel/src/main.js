// main.js —— 编排入口：window.__renderFrame(t) 纯函数帧接口
// 渲染脚本（scripts/render.mjs）按 t = frame / FPS 显式驱动，不依赖任何时钟。

import { THEME } from "./core.js";
import { WIDTH, HEIGHT, DURATION, FPS, sceneAt } from "./time.js";
import {
  drawTitle,
  drawPain,
  drawEnvelope,
  drawStreams,
  drawOutro,
} from "./scenes.js";

const DRAW = {
  title: drawTitle,
  pain: drawPain,
  envelope: drawEnvelope,
  streams: drawStreams,
  outro: drawOutro,
};

const canvas = document.getElementById("c");
canvas.width = WIDTH;
canvas.height = HEIGHT;
const ctx = canvas.getContext("2d");

// 渲染一帧：同一 t 必然得到同一像素（确定性核心）
export function renderFrame(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const { scene, local } = sceneAt(t);
  if (scene && DRAW[scene.name]) {
    DRAW[scene.name](ctx, local);
  }
}

// 供 Playwright 调用：同步绘制完成后返回
window.__renderFrame = (t) => {
  renderFrame(t);
  return true;
};

window.__duration = DURATION;
window.__fps = FPS;
window.__ready = true;

// 预览模式：index.html?play=1 时用 RAF 循环播放（仅供人眼预览，不参与出片）
if (new URLSearchParams(location.search).has("play")) {
  const start = performance.now();
  const loop = (now) => {
    renderFrame(((now - start) / 1000) % DURATION);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
