# tooldeck

CLI 工具的统一桌面 GUI 壳（Electron + React + TS），单应用多模块形态：左侧导航切换模块。

核心架构原则：**GUI 是 CLI 的前端壳，一切数据操作走 CLI 子命令 + JSON 包络，GUI 不直接读写 CLI 的 config.json**。

## 当前模块

| 模块 | 状态 | 说明 |
|---|---|---|
| exestarter | 可用 | exe 收藏架：列表 / 添加 / 扫描导入 / 打标 / 改路径 / 启动 / 定位 / 开终端 / 删除 / 清理失效 |
| filesync / quickask / zreadmanager | 待接入 | 后续计划 |

CLI 接口契约见父仓 `docs/go_projects/exestarter/接口文档.md`；开发计划见父仓 `docs/typescript_projects/tooldeck/PLAN.md`。

## 命令

```powershell
pnpm install
pnpm dev         # 开发（中文日志需 UTF-8 控制台，见下方首次配置）
pnpm typecheck   # 类型检查
pnpm lint        # eslint
pnpm dist        # 构建并打包 portable（产物在 dist/）
```

首次配置（修中文日志乱码）：`.\scripts\add-utf8-profile.ps1` 向 PowerShell profile 写入
`[Console]::OutputEncoding = UTF8`（幂等，可用 `.\scripts\remove-utf8-profile.ps1` 移除），
新开会话生效——PS 5.1 下 `chcp 65001` 刷不动该设置，必须走 profile。

## CLI 探测（exestarter.exe）

每步打印主进程日志（dev 下打到 electron-vite 终端）：

- **dev**：显式配置（设置页保存）> 开发目录（app 路径向上找 `go_projects/exestarter/exestarter.exe`）> PATH
- **打包后**：显式配置 > `tooldeck.exe` 同级 `bin\exestarter.exe` > PATH
- 全部失败：日志报错 + 界面引导到设置页手动配置

portable 分发时把 `exestarter.exe` 放进 exe 同级 `bin\` 目录即可自动探测。

## 关键实现

- 单实例：Electron 原生 `requestSingleInstanceLock`，第二实例退出并聚焦首实例窗口
- 安全基线：`contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`，preload 仅暴露白名单 API（`cli:exec` / `cli:detect` / `dialog:*` / `settings:*`）
- 写命令串行：CLI 进程级读写 config.json 无锁，bridge 层 Promise 链队列强制串行，防并发丢写
- `run` 透传豁免：detached 启动不等退出码，启动前 valid 预检
- 样式：手写 CSS，紧凑工具风，不引 UI 库
