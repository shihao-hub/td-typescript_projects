// time.js —— 唯一时间真相：全片规格 + 镜头窗口表
// 渲染脚本按 t = frame / FPS 驱动，DURATION * FPS = 总帧数。

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 60;
export const DURATION = 30; // 秒

// 镜头窗口表：name 对应 scenes.js 中 DRAW 的绘制函数
export const SCENES = [
  { name: "title", start: 0, end: 5 }, // 标题
  { name: "pain", start: 5, end: 10 }, // 痛点：文本即接口
  { name: "envelope", start: 10, end: 18 }, // JSON 包络（成功/失败）
  { name: "streams", start: 18, end: 24 }, // stdout / stderr 纪律
  { name: "outro", start: 24, end: 30 }, // 退出码 + 收尾标题卡
];

// 返回 t 所在镜头及其局部时间；t 越界时夹到首尾镜头
export function sceneAt(t) {
  const tc = clampNum(t, 0, DURATION - 1e-6);
  for (const s of SCENES) {
    if (tc >= s.start && tc < s.end) {
      return { scene: s, local: tc - s.start };
    }
  }
  const last = SCENES[SCENES.length - 1];
  return { scene: last, local: last.end - last.start - 1e-6 };
}

function clampNum(v, a, b) {
  return Math.min(b, Math.max(a, v));
}
