# cli-json-reel

用「纯 Canvas2D + 确定性离线渲染」制作的极简排版动画短片，主题为 Go CLI 的 **JSON 输出模式**（CLI/GUI 分离思想）：stdout 永远输出合法 JSON、`--pretty` 人机同源、stdout/stderr 纪律、退出码语义。

全片 30 秒 / 1920x1080 / 60fps，无第三方运行时依赖（`playwright-core` 仅用于离线出片）。

## 用法

```powershell
pnpm install              # 安装 dev 依赖（playwright-core，驱动本机 Chrome）

pnpm render               # 全量渲染 1800 帧 + ffmpeg 编码 → output/cli-json-reel.mp4
pnpm verify               # 确定性校验：抽帧渲染两次逐字节比对
pnpm preview              # 起本地服务，浏览器实时预览（?play=1 循环播放）

node scripts/render.mjs --stills "150,450,780"   # 只渲指定帧号供人工检查
node scripts/render.mjs --limit 60 --no-encode   # 试跑前 60 帧不编码
```

## 确定性

- `window.__renderFrame(t)` 是纯函数：同一 `t` 必然得到同一像素（渲染脚本按 `t = frame / fps` 显式驱动，不依赖任何时钟）。
- 所有随机（如有）走固定种子 PRNG；字体使用系统字体栈，同机渲染逐位可复现。
- `pnpm verify` 会抽取若干帧各渲染两次并逐字节比对 PNG。

## 结构

```
index.html            画布入口
src/core.js           数学 / 缓动 / 主题 / Canvas2D 绘制工具
src/time.js           唯一时间真相：规格 + 镜头窗口表
src/scenes.js         五个镜头的绘制函数（纯函数）
src/main.js           renderFrame(t) 编排 + 预览模式
scripts/render.mjs    离线出片：静态服务 + Playwright 逐帧截图 + ffmpeg 编码
output/               成品视频（gitignore）
```

## 数据存放

帧缓存、日志等运行数据只写 `%APPDATA%\language_projects\cli-json-reel\`（取不到 `APPDATA` 时回退 `~/.language_projects/cli-json-reel/`），编码成功后默认自动清理帧缓存。
