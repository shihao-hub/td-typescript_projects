# text-extractor

Chrome 扩展（MV3，基于 WXT + TypeScript + Shadow DOM）：在任意网页点选元素，提取其文本到弹窗中编辑并一键复制。

## 功能

- 右键菜单「提取此页面元素文本」或快捷键 `Ctrl+Shift+E` 进入点选模式
- 悬停高亮（蓝色虚线框，不破坏元素原有 outline 样式），点击选中
- `Esc` 随时退出点选模式或关闭弹窗
- Shadow DOM 隔离弹窗：可编辑文本、重新选择、复制
- 复制双通道：`navigator.clipboard` 失败时自动回退 `execCommand('copy')`，http 页面也可用

## 开发

```bash
pnpm install
pnpm dev        # 自动拉起 Chrome（独立 profile）并加载扩展，支持热更新
```

> `pnpm dev` 的自动开浏览器依赖 `web-ext`（已列入 devDependencies）。若未安装，WXT 会退化为手动模式并在日志提示 `Load ".output\chrome-mv3-dev" as an unpacked extension manually`，此时按下方「构建与手动加载」操作一次即可。

## 一键脚本加载（scripts/load-into-chrome.mjs）

```bash
pnpm load              # 生产构建 + 自动注入（Chrome 可调试时），否则降级为半自动
pnpm load:dev          # 注入 dev 构建（配合运行中的 pnpm dev，热更新可用）
```

- **自动注入**：走 CDP `Extensions.loadUnpacked`，要求 Chrome 带 `--remote-debugging-port` 运行。
  注意 Chrome 安全限制：**默认用户数据目录（日常 profile）会忽略该参数**；仅当使用非默认 `--user-data-dir`，
  或注册表策略 `HKCU\Software\Policies\Google\Chrome\DevToolsRemoteDebuggingAllowed=1` 时生效（该键常被公司域控锁定）。
- **半自动降级**（本机日常 Chrome 的默认路径）：脚本自动 `pnpm build` + 复制扩展目录路径到剪贴板 + 打开
  `chrome://extensions/`，剩余 3 步：开「开发者模式」→「加载已解压的扩展程序」→ 文件名框粘贴路径回车。
- **更新扩展**：重跑 `pnpm load` 后到 `chrome://extensions/` 点扩展卡片上的刷新按钮（Chrome 通常也会显示 Reload 提示条）。

## 构建与手动加载

```bash
pnpm build      # 产物在 .output/chrome-mv3/
pnpm compile    # tsc --noEmit 类型检查
```

1. 打开 `chrome://extensions/`，开启右上角「开发者模式」
2. 「加载已解压的扩展程序」→ 选择 `.output/chrome-mv3` 文件夹

> 在自己日常使用的 Chrome 中使用扩展：加载生产构建 `.output/chrome-mv3`，代码更新后重新 build 并在扩展卡片点刷新。开发时也可将 `.output/chrome-mv3-dev` 手动加载进自己的浏览器，只要 `pnpm dev` 保持运行，热更新照常生效（自动弹出的 dev 浏览器窗口可关闭）。Chrome 启动时可能提示「请停用开发者模式扩展」，忽略即可。

## 使用

1. 在目标网页右键 →「提取此页面元素文本」（或按 `Ctrl+Shift+E`）
2. 鼠标悬停出现蓝色虚线框，点击目标元素
3. 弹窗中编辑文本 → 「复制文本」，或「重新选择」重选元素

> 若 `Ctrl+Shift+E` 被其他扩展占用，可在 `chrome://extensions/shortcuts` 中修改。

## 自测清单

- [ ] https 页面：右键 → 悬停高亮 → 点击弹窗 → 修改 → 复制粘贴验证内容一致
- [ ] `Ctrl+Shift+E` 触发同样流程
- [ ] 点选模式按 `Esc` 退出，高亮恢复，无残留监听（再次触发正常）
- [ ] 弹窗按 `Esc` / 点遮罩空白 / 取消按钮关闭
- [ ] 「重新选择」：关弹窗并回到点选模式
- [ ] `chrome://` 页面右键不报错（后台静默忽略）
- [ ] http（非 https）页面复制走回退通道仍成功
- [ ] 元素自带 inline outline 时，选完后原样式还原

## 目录结构

```
entrypoints/background.ts   # 右键菜单 + 快捷键 → 向当前 tab 发 START_PICKER
entrypoints/content.ts      # 点选模式 + Shadow DOM 编辑弹窗 + 复制
types.ts                    # background ↔ content 消息类型
wxt.config.ts               # manifest：permissions / commands
```
