// render.mjs —— 离线确定性出片流水线
// 流程：起本地静态服务 → Playwright 驱动本机 Chrome → 逐帧 __renderFrame(t) + 截图
//       → ffmpeg 编码 MP4。帧缓存按仓库约束放 %APPDATA%\language_projects\cli-json-reel\。
//
// 用法：
//   node scripts/render.mjs                     # 全量渲染 + 编码
//   node scripts/render.mjs --limit 60          # 只渲前 60 帧（试管线）
//   node scripts/render.mjs --verify            # 确定性校验：抽帧渲染两次比对
//   node scripts/render.mjs --no-encode         # 只出帧不编码
//   node scripts/render.mjs --keep-frames       # 编码后保留帧缓存
//   node scripts/render.mjs --preview           # 起服务并打开浏览器实时预览

import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "output");
const VIDEO_PATH = path.join(OUTPUT_DIR, "cli-json-reel.mp4");

// ---------- 参数解析（--key value / 布尔 flag） ----------
const args = process.argv.slice(2);
const getArg = (name, def = undefined) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
};
const hasFlag = (name) => args.includes(`--${name}`);

const FPS = Number(getArg("fps", 60));
const WIDTH = Number(getArg("width", 1920));
const HEIGHT = Number(getArg("height", 1080));
const LIMIT = Number(getArg("limit", Infinity));
const VERIFY = hasFlag("verify");
const NO_ENCODE = hasFlag("no-encode");
const KEEP_FRAMES = hasFlag("keep-frames");
const PREVIEW = hasFlag("preview");
const STILLS = getArg("stills"); // 如 --stills "150,450,780"：只渲指定帧号供人工检查

// ---------- 运行数据目录（自动创建完整目录链） ----------
const dataDir = process.env.APPDATA
  ? path.join(process.env.APPDATA, "language_projects", "cli-json-reel")
  : path.join(os.homedir(), ".language_projects", "cli-json-reel");
const framesDir = path.join(dataDir, "frames");

// ---------- 静态服务（file:// 下 ES module 会被 CORS 拦，必须走 http） ----------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function serve(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
      let filePath = path.join(root, urlPath === "/" ? "index.html" : urlPath);
      if (!filePath.startsWith(root)) {
        res.writeHead(403).end();
        return;
      }
      try {
        const body = fs.readFileSync(filePath);
        res.writeHead(200, {
          "content-type": MIME[path.extname(filePath)] || "application/octet-stream",
          "cache-control": "no-store",
        });
        res.end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

// ---------- 浏览器启动：本机 Chrome → Edge 兜底 ----------
async function launchBrowser() {
  for (const channel of ["chrome", "msedge"]) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch (e) {
      console.log(`[launch] channel ${channel} 失败：${e.message.split("\n")[0]}`);
    }
  }
  // 最后兜底：让 playwright-core 用它自己能找到的浏览器
  return chromium.launch({ headless: true });
}

const log = (msg) => {
  const d = new Date();
  const ts = `${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  console.log(`[${ts}] ${msg}`);
};

async function main() {
  const server = await serve(ROOT);
  const { port } = server.address();
  const pageUrl = `http://127.0.0.1:${port}/index.html`;

  if (PREVIEW) {
    console.log(`预览地址：${pageUrl}?play=1  （Ctrl+C 退出）`);
    const open =
      process.platform === "win32"
        ? spawnSync("cmd", ["/c", "start", "", `${pageUrl}?play=1`], { shell: false })
        : null;
    void open;
    return; // server 保持进程存活
  }

  fs.mkdirSync(framesDir, { recursive: true });

  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(pageUrl);
  await page.waitForFunction(() => window.__ready === true);

  const duration = await page.evaluate(() => window.__duration);
  const fps = await page.evaluate(() => window.__fps);
  const totalFrames = Math.min(Math.floor(duration * fps), LIMIT);
  log(`规格：${WIDTH}x${HEIGHT} @ ${fps}fps，共 ${totalFrames} 帧（${duration}s）`);

  const renderAt = async (frameIndex) => {
    const t = frameIndex / fps;
    await page.evaluate((tt) => window.__renderFrame(tt), t);
    return page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    });
  };

  // ---------- 确定性校验：抽帧渲染两次，逐字节比对 ----------
  if (VERIFY) {
    const picks = [0, 7, Math.floor(totalFrames / 4), Math.floor(totalFrames / 2), totalFrames - 1]
      .filter((n) => n >= 0 && n < totalFrames);
    let ok = true;
    for (const idx of [...new Set(picks)]) {
      const a = await renderAt(idx);
      const b = await renderAt(idx);
      const same = a.equals(b);
      ok = ok && same;
      log(`verify frame ${String(idx).padStart(6, "0")} → ${same ? "一致 ✓" : "不一致 ✗"}`);
    }
    await browser.close();
    server.close();
    if (!ok) {
      console.error("确定性校验失败：同一 t 两次渲染结果不同。");
      process.exit(1);
    }
    log("确定性校验通过：同一 t 逐位相同。");
    return;
  }

  // ---------- 静帧模式：只渲指定帧号，供人工检查画面 ----------
  if (STILLS) {
    const indices = STILLS.split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n >= 0);
    for (const idx of indices) {
      const buf = await renderAt(Math.min(idx, totalFrames - 1));
      const file = path.join(framesDir, `still_${String(idx).padStart(6, "0")}.png`);
      fs.writeFileSync(file, buf);
      log(`静帧已输出：${file}`);
    }
    await browser.close();
    server.close();
    return;
  }

  // ---------- 逐帧渲染 ----------
  const started = Date.now();
  for (let i = 0; i < totalFrames; i++) {
    const buf = await renderAt(i);
    fs.writeFileSync(path.join(framesDir, `${String(i + 1).padStart(6, "0")}.png`), buf);
    if (i % 120 === 0 || i === totalFrames - 1) {
      const pct = ((i + 1) / totalFrames) * 100;
      const elapsed = (Date.now() - started) / 1000;
      const eta = elapsed / (i + 1) * (totalFrames - i - 1);
      log(`进度 ${i + 1}/${totalFrames}（${pct.toFixed(1)}%），ETA ${eta.toFixed(0)}s`);
    }
  }
  log(`渲染完成，用时 ${((Date.now() - started) / 1000).toFixed(1)}s，帧目录：${framesDir}`);

  await browser.close();
  server.close();

  // ---------- ffmpeg 编码 ----------
  if (!NO_ENCODE) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    log("开始 ffmpeg 编码…");
    const r = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-framerate", String(fps),
        "-i", path.join(framesDir, "%06d.png"),
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "16",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        VIDEO_PATH,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    if (r.status !== 0) {
      console.error(`ffmpeg 编码失败：\n${r.stderr?.toString().slice(-2000)}`);
      process.exit(1);
    }
    const sizeMB = (fs.statSync(VIDEO_PATH).size / 1024 / 1024).toFixed(2);
    log(`编码完成：${VIDEO_PATH}（${sizeMB} MB）`);
    if (!KEEP_FRAMES) {
      fs.rmSync(framesDir, { recursive: true, force: true });
      log("已清理帧缓存。");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
