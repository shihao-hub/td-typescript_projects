# tooldeck

**Inspector 式 MCP 工具面板**（Electron + React + TS）：工具发现 → Schema 表单 → 执行 → 树形结果渲染。任何支持 MCP stdio 协议的本地 CLI server 接入即用，前端零代码。

核心架构原则：**GUI 是 MCP client，一切数据操作走标准 MCP 协议（stdio）**——工具发现（`tools/list`）、参数校验（inputSchema / JSON Schema 2020-12）、调用与取消（`tools/call` / cancellation）全部由协议自描述驱动，新增工具自动出现在界面里。

## 通用能力分层

| 接入条件 | 界面能力 |
|---|---|
| MCP server，工具带 inputSchema | 自动发现 + 动态参数表单（RJSF + cfworker 校验器，无 eval、兼容 CSP）+ 点击执行 + 取消 |
| 工具返回 structuredContent | 动态结果渲染：对象数组默认表格、其余默认树形（展开/收起、类型着色、计数摘要、长文本截断、复制 JSON），可手动切换 表格/树形/原始 JSON |

首个接入样本：**clictl**（`clictl.exe mcp`，注册/启动/记账，10 个 MCP 工具）；exestarter 等其余 CLI 待各自 MCP 化后接入（见父仓 `docs/projects/go_projects/clictl/MCP 接口文档.md` 迁移矩阵）。

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

## server 接入

- **dev**：自动探测（app 路径向上找 `go_projects/clictl/clictl.exe`）> PATH
- **打包后**：tooldeck.exe 同级 `bin\clictl.exe` > PATH
- 首启无配置时自动探测并写入默认 clictl 连接；也可在设置页手动配置任意 MCP server（exe 路径 + 启动参数）

portable 分发时把 `clictl.exe` 放进 exe 同级 `bin\` 目录即可自动探测。

## 关键实现

- 单实例：Electron 原生 `requestSingleInstanceLock`，第二实例退出并聚焦首实例窗口
- 安全基线：`contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`，preload 仅暴露白名单 API（`mcp:*` / `dialog:*` / `settings:*`）
- MCP 连接管理：主进程持有连接与子进程（`src/main/mcp/manager.ts`），server stderr 转发主进程日志不泄漏控制台；应用退出 `before-quit` 终止全部 server 子进程
- 调用可取消：每次调用带 callId（AbortController），渲染层「取消」→ MCP cancellation → server 侧终止工作
- 表单校验：`@rjsf/validator-cfworker`（JSON Schema 2020-12，无动态代码执行，兼容 CSP `script-src 'self'`）
- 样式：手写 CSS，紧凑工具风，不引 UI 库
