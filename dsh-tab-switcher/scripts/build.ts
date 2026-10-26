import { copyFileSync, existsSync, mkdirSync, cpSync } from "fs";
import { resolve, dirname } from "path";

const rootDir = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const srcDir = resolve(rootDir, "src");
const assetsDir = resolve(rootDir, "assets");
const distDir = resolve(rootDir, "dist");
const iconsDistDir = resolve(distDir, "icons");

if (!existsSync(iconsDistDir)) {
  mkdirSync(iconsDistDir, { recursive: true });
}

console.log("[Build] 开始构建 DSH Tab Switcher...");

// 1. 使用 Bun 极速打包 background.ts
const result = await Bun.build({
  entrypoints: [resolve(srcDir, "background.ts")],
  outdir: distDir,
  target: "browser",
  minify: false,
  format: "esm",
});

if (!result.success) {
  console.error("[Build] 打包失败:", result.logs);
  process.exit(1);
}

// 2. 复制 manifest.json
copyFileSync(resolve(srcDir, "manifest.json"), resolve(distDir, "manifest.json"));
console.log("[Build] manifest.json 同步完成");

// 3. 复制静态资源 assets/icons 到 dist/icons
if (existsSync(resolve(assetsDir, "icons"))) {
  cpSync(resolve(assetsDir, "icons"), iconsDistDir, { recursive: true });
  console.log("[Build] 图标资源同步完成");
}

console.log("[Build] 构建成功！Chrome 扩展目录: " + distDir);
