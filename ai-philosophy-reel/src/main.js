// src/main.js — 2分钟完整版史诗短视频（9:16，1080x1920，适合抖音/小红书）
// 8大深度电影感分镜，全部由本地 GPU（ComfyUI / SD 1.5）原生渲染
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 30;
export const DURATION = 120; // 2分钟完整篇章

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

// 8 幕分镜配置
const SCENES = [
  {
    id: "scene_1",
    src: "./assets_2min/scene_1.jpg",
    start: 0.0,
    end: 12.32,
    speechStart: 0.6,
    speechEnd: 9.05,
    title: "第一幕 · 幽暗地穴",
    zh: "公元前380年，柏拉图在《理想国》第七卷中，写下了人类思想史上最震撼的寓言：洞穴。",
    en: "380 BCE, Plato wrote humanity's most striking allegory: The Cave."
  },
  {
    id: "scene_2",
    src: "./assets_2min/scene_2.jpg",
    start: 12.32,
    end: 25.90,
    speechStart: 12.8,
    speechEnd: 22.11,
    title: "第二幕 · 火光与皮影",
    zh: "一群人自幼被捆绑在黑暗深处，不能回头。他们唯一能看到的，是身后火光投在石壁上的摇晃影子。",
    en: "Chained in deep darkness, shadows cast by a fire are all they see."
  },
  {
    id: "scene_3",
    src: "./assets_2min/scene_3.jpg",
    start: 25.90,
    end: 41.72,
    speechStart: 26.5,
    speechEnd: 37.35,
    title: "第三幕 · 虚假的共识",
    zh: "影子移动，回声作响。囚徒们为这些幻象命名，并在竞猜影子的游戏中彼此加冕，以为这就是宇宙的全部真相。",
    en: "They named these illusions, mistaking mere reflections for universal truth."
  },
  {
    id: "scene_4",
    src: "./assets_2min/scene_4.jpg",
    start: 41.72,
    end: 58.17,
    speechStart: 42.3,
    speechEnd: 53.58,
    title: "第四幕 · 锁链脱落",
    zh: "直到有一天，一个囚徒的锁链骤然松脱。当他被强迫站起身、转头望向火光时，刺目的光芒让他的双眼剧烈灼痛。",
    en: "Until one breaks free. Turning to face the fire, the light burns his eyes."
  },
  {
    id: "scene_5",
    src: "./assets_2min/scene_5.jpg",
    start: 58.17,
    end: 71.36,
    speechStart: 58.8,
    speechEnd: 67.85,
    title: "第五幕 · 艰难攀登",
    zh: "他被拖拽着，沿着崎岖陡峭的岩石通道一步步向上攀爬，直到被拉出洞口，抛入正午的烈日之中。",
    en: "Dragged up the rugged ascent, he is thrust into the blinding daylight."
  },
  {
    id: "scene_6",
    src: "./assets_2min/scene_6.jpg",
    start: 71.36,
    end: 87.21,
    speechStart: 72.0,
    speechEnd: 82.87,
    title: "第六幕 · 逐渐适应",
    zh: "起初，他什么也看不清。渐渐地，他先从水中的倒影认识世间万物，再到夜间的星斗，最后终于能抬头直视太阳。",
    en: "At first blinded, he slowly observes reflections, then stars, and finally the sun."
  },
  {
    id: "scene_7",
    src: "./assets_2min/scene_7.jpg",
    start: 87.21,
    end: 102.08,
    speechStart: 87.8,
    speechEnd: 98.0,
    title: "第七幕 · 真理之日",
    zh: "他终于顿悟：太阳，才是万物的源泉，是真理与善的化身。洞穴里的火光与影子，不过是苍白的投射与梦呓。",
    en: "The sun is the true source of all reality, truth, and the Good."
  },
  {
    id: "scene_8",
    src: "./assets_2min/scene_8.jpg",
    start: 102.08,
    end: 120.0,
    speechStart: 102.6,
    speechEnd: 114.89,
    title: "第八幕 · 重返洞穴",
    zh: "他选择重返地穴试图唤醒同伴。但习惯了黑暗的人，反倒嘲笑他瞎了双眼。我们每个人，是否也活在某种未曾察觉的洞穴之中？",
    en: "Returning to free them, they mock him. Are we, too, trapped in our own cave?"
  }
];

// 预加载 8 张底图
const sceneImages = [];
let loadedCount = 0;
for (let i = 0; i < SCENES.length; i++) {
  const img = new Image();
  img.src = SCENES[i].src;
  img.onload = () => {
    loadedCount++;
    if (loadedCount === SCENES.length) {
      window.__ready = true;
    }
  };
  sceneImages.push(img);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function pseudoRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function renderFrame(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#070605";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 1. 定位当前镜头与过渡镜头
  let curIdx = 0;
  for (let i = 0; i < SCENES.length; i++) {
    if (t >= SCENES[i].start && t < SCENES[i].end) {
      curIdx = i;
      break;
    }
  }
  if (t >= SCENES[SCENES.length - 1].end) curIdx = SCENES.length - 1;

  const curScene = SCENES[curIdx];
  const nextScene = SCENES[curIdx + 1] || null;

  // 镜头内时间与归一化进度
  const sceneT = t - curScene.start;
  const sceneDur = curScene.end - curScene.start;
  const sceneProg = clamp(sceneT / sceneDur, 0, 1);

  // 2. 绘制当前场景（微缓慢推拉缓动 Ken Burns）
  const curImg = sceneImages[curIdx];
  if (curImg && curImg.complete) {
    const zoom = 1.0 + sceneProg * 0.05;
    const panY = sceneProg * -20;
    ctx.save();
    ctx.translate(WIDTH / 2, HEIGHT / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-WIDTH / 2, -HEIGHT / 2 + panY);
    ctx.drawImage(curImg, 0, 0, WIDTH, HEIGHT);
    ctx.restore();
  }

  // 3. 跨镜头转场混合（末尾 1.2 秒交叉溶解）
  const transTime = 1.2;
  if (nextScene && (curScene.end - t) < transTime) {
    const transProg = clamp((transTime - (curScene.end - t)) / transTime, 0, 1);
    const easeTrans = easeInOutCubic(transProg);
    const nextImg = sceneImages[curIdx + 1];
    if (nextImg && nextImg.complete) {
      const nextProg = (t - (curScene.end - transTime)) / (nextScene.end - curScene.end);
      const nextZoom = 1.05 - nextProg * 0.02;
      ctx.save();
      ctx.globalAlpha = easeTrans;
      ctx.translate(WIDTH / 2, HEIGHT / 2);
      ctx.scale(nextZoom, nextZoom);
      ctx.translate(-WIDTH / 2, -HEIGHT / 2);
      ctx.drawImage(nextImg, 0, 0, WIDTH, HEIGHT);
      ctx.restore();
    }
  }

  // 4. 动态微粒与环境光效
  // 前半部 (0-60s 洞穴): 暖火浮尘微粒
  // 后半部 (60-120s 户外): 太阳光晕与丁达尔神圣光束
  if (t < 65) {
    ctx.save();
    const caveTorch = Math.sin(t * 7) * 0.05 + 1.0;
    for (let i = 0; i < 35; i++) {
      const seed = i * 47.19;
      const speedY = 30 + pseudoRandom(seed + 1) * 40;
      const px = (WIDTH * 0.15 + pseudoRandom(seed + 2) * 750 + Math.sin(t * 1.5 + i) * 20);
      const py = (HEIGHT * 0.75 - ((t * speedY + pseudoRandom(seed + 3) * 700) % 850));
      const pAlpha = (1 - (HEIGHT * 0.75 - py) / 850) * 0.55 * caveTorch;
      const size = 1.5 + pseudoRandom(seed + 4) * 2.5;

      ctx.fillStyle = `rgba(255, 195, 110, ${pAlpha})`;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else {
    // 户外神圣光晕
    ctx.save();
    const sunGlow = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    sunGlow.addColorStop(0, "rgba(255, 240, 200, 0.22)");
    sunGlow.addColorStop(0.5, "rgba(255, 215, 140, 0.10)");
    sunGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = sunGlow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
  }

  // 5. 顶部印记专栏（居中设计）
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "italic 36px 'Songti SC', 'SimSun', 'Noto Serif SC', serif";
  ctx.fillStyle = "rgba(240, 225, 200, 0.95)";
  ctx.fillText("洞穴之喻 · 完整篇", WIDTH / 2, 210);

  ctx.font = "16px sans-serif";
  ctx.fillStyle = "rgba(200, 165, 130, 0.85)";
  ctx.letterSpacing = "2px";
  ctx.fillText(`PLATO'S ALLEGORY OF THE CAVE · ${curScene.title}`, WIDTH / 2, 250);

  ctx.strokeStyle = "rgba(220, 160, 70, 0.85)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - 140, 270);
  ctx.lineTo(WIDTH / 2 + 140, 270);
  ctx.stroke();
  ctx.restore();

  // 6. 底部双语中英字幕（严格对齐语音时间轴，带淡入淡出）
  if (t >= curScene.speechStart - 0.2 && t <= curScene.speechEnd + 1.2) {
    const inT = clamp((t - (curScene.speechStart - 0.2)) / 0.4, 0, 1);
    const outT = clamp(((curScene.speechEnd + 1.2) - t) / 0.5, 0, 1);
    const subAlpha = easeInOutCubic(Math.min(inT, outT));

    ctx.save();
    ctx.globalAlpha = subAlpha;
    ctx.textAlign = "center";

    // 幕次小标签
    ctx.font = "italic 22px 'Songti SC', 'SimSun', serif";
    ctx.fillStyle = "rgba(225, 185, 130, 0.95)";
    ctx.fillText(`— ${curScene.title} —`, WIDTH / 2, HEIGHT - 390);

    // 中文字幕（自动智能两行折行）
    ctx.font = "bold 44px 'Songti SC', 'SimSun', 'Noto Serif SC', serif";
    ctx.fillStyle = "rgba(255, 250, 240, 0.98)";
    ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
    ctx.shadowBlur = 22;

    const zhText = curScene.zh;
    if (zhText.length > 22) {
      const mid = Math.ceil(zhText.length / 2);
      ctx.fillText(zhText.slice(0, mid), WIDTH / 2, HEIGHT - 310);
      ctx.fillText(zhText.slice(mid), WIDTH / 2, HEIGHT - 250);
    } else {
      ctx.fillText(zhText, WIDTH / 2, HEIGHT - 280);
    }

    // 英文字幕
    ctx.font = "italic 22px 'Georgia', serif";
    ctx.fillStyle = "rgba(215, 195, 175, 0.85)";
    ctx.shadowBlur = 14;
    ctx.fillText(curScene.en, WIDTH / 2, HEIGHT - 180);

    ctx.restore();
  }
}

window.__renderFrame = (t) => {
  renderFrame(t);
  return true;
};

window.__duration = DURATION;
window.__fps = FPS;
