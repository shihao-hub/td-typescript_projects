# taskmon

Windows 任务管理器·内存版：控制台实时查看进程内存占用，同名进程分组展示。

- 组间按**总内存**从大到小排序
- 组内按**单进程内存**从大到小排序（展开后显示 PID、组内占比）
- **默认只显示分组**（折叠），交互中可按 Enter 展开/收起单个组，`a` 全部展开/收起
- 原地刷新无闪烁，光标选中 + 视口跟随滚动

## 使用

```bash
pnpm install
pnpm dev            # 开发运行（tsx 直跑，--version 显示 dev）
pnpm build && pnpm start
pnpm exe            # 打包单文件 exe（需 Bun），见下方「版本与打包」
```

## 参数

| 参数 | 说明 | 默认 |
|---|---|---|
| `-i, --interval <seconds>` | 刷新间隔（秒），最小 1 | 2 |
| `-t, --top <n>` | 只显示内存最大的前 n 组，0 为全部 | 0 |
| `-e, --expand` | 展开全部分组（默认全部折叠） | 关 |
| `--once` | 输出一帧快照后退出（管道/调试友好），配合 `-e` 输出全量快照 | - |

## 按键

- `↑ / ↓`：移动光标选择组，`PgUp / PgDn`：翻页，`Home / End`：首尾
- `Enter`：展开/收起当前组（`→` / `+` 展开，`←` / `-` 收起）
- `a`：全部展开 / 全部收起
- `空格 / r`：立即刷新
- `q / Ctrl+C`：退出

## 日志

诊断日志写入文件，控制台完全留给实时表格渲染（`--once` / 管道模式的输出不受影响）。

- 路径：`%LOCALAPPDATA%\taskmon\logs\taskmon.log`（取不到 `LOCALAPPDATA` 时退回系统临时目录）
- 轮转：按 2MB + 每天一次，最多保留 5 份旧文件（`rotating-file-stream`）
- 格式随运行方式自动切换（判定依据：exe 打包时 `bun --define` 注入的 `TASKMON_VERSION` 是否存在，见 `src/logger.ts`）：
  - 开发（`pnpm dev` / `pnpm start`）：**纯文本**（pino-pretty，level=debug）
  - exe 实际使用：**JSON 行**（level=info），可 `grep` / `jq` 分析
- 坑：判定处必须使用**全局 `process`**（`import process from 'node:process'` 会让 Bun 把引用重写为内部绑定名，`--define process.env.TASKMON_VERSION` 的文本替换随之失配，注入悄悄失效——曾导致 exe 误走开发分支输出纯文本）

查看日志（PowerShell 实时跟踪）：

```powershell
Get-Content "$env:LOCALAPPDATA\taskmon\logs\taskmon.log" -Tail 50 -Wait
```

### 为什么不用 pino-roll（以及任何 pino transport）

pino 的 transport 机制（`pino.transport()`、`transport: { targets }` 配置、`pino-roll` 这类 transport 插件）不是进程内的函数调用：它把序列化/落盘工作交给一个**独立 worker 线程**（thread-stream），而 worker 的脚本文件（`pino/lib/worker.js`、`pino-roll` 的模块源码）是在**运行时**按磁盘上 `node_modules` 路径去 `new Worker(...)` 加载的。

taskmon 的 exe 由 `bun build --compile` 打成单文件，只内嵌构建时分析到的模块图，运行机器上没有 `node_modules`：

1. worker 要加载的文件路径在运行环境不存在，transport 初始化直接失败；
2. 即使把相关文件拷到 exe 旁边，thread-stream 依赖的 Node worker 线程语义在 Bun 编译产物里也属于未承诺的兼容行为，不可靠。

因此约束是：**exe 里只能用进程内可用的输出流**。方案落定为：

- 轮转：`rotating-file-stream` 的 `createStream()`（纯 JS `Writable` 流），以 `pino({ level }, stream)` 直接挂载；
- 开发期美化：pino-pretty 以**进程内流**方式挂载（`pretty({ destination: stream })`，不走 transport），该动态 import 只在开发分支执行。

## 版本与打包（exe）

本次改造的目的：**消除双处维护版本号的漂移**（此前 `package.json` 与 `src/main.ts` 各写一份、已经漂移），并把"哪份源码构建出哪个 exe"的关系固化下来。

### 原则

- **版本号唯一来源是 `package.json` 的 `version`**：打包时由 `bun --define process.env.TASKMON_VERSION=<version>` 编译期内联注入，程序内 `--version` 显示该值；`pnpm dev` 直跑时显示 `dev`。不要在 `src/` 里手写版本号。
- **exe 是构建产物，不入 git**（根 `.gitignore` 已有 `*.exe`）：版本追溯靠「产物文件名 + git tag」。

### 打包

```bash
pnpm exe
# 等价于：bun scripts/build-exe.ts
# 底层执行：bun build --compile --define "process.env.TASKMON_VERSION=<version>" \
#           --outfile release/taskmon-v<version>.exe src/main.ts
```

产出 `release/taskmon-v<version>.exe`（单文件免安装，约 85MB，需安装 [Bun](https://bun.sh)），并打印体积与 sha256。

验证版本：`./release/taskmon-v0.2.0.exe --version`

### 发版（打 tag）

```bash
# 1. 改 taskmon/package.json 的 version（如 0.2.1）
# 2. 提交
git add taskmon && git commit -m "chore(taskmon): release v0.2.1"
# 3. 打 tag（monorepo 多项目共用仓库，统一带 taskmon/ 前缀防撞名）
git tag -a taskmon/v0.2.1 -m "taskmon v0.2.1"
# 4. 构建该版本 exe
pnpm exe
```

tag 常用命令（在仓库根目录执行）：

```bash
git tag -l "taskmon/*"        # 列出 taskmon 全部版本
git show taskmon/v0.2.0       # 查看某 tag 指向的提交与说明
git checkout taskmon/v0.2.0   # 检出该版本源码（进入 detached HEAD，看完 git switch master 回来）
git tag -d taskmon/v0.2.0     # 删除本地 tag（打错时）
```

以后若仓库加了远程，`git push origin taskmon/v0.2.1` 推送 tag，或用 Releases 把 exe 挂到 tag 上分发。

## 二期规划（已选型：Bun）

二期目标：产出两个 exe —— **CLI 控制台版** + **GUI 图形版**，打包方案选定 **Bun**。

- CLI exe：已落地（v0.2.0 起），由 `pnpm exe` 封装，见「版本与打包（exe）」
- 建议结构：重构为 `src/core`（tasklist 解析 + 分组排序）+ `src/cli` + `src/gui`，两个入口共享 core
- 落选备选：Node SEA（官方、~80MB，但步骤多且不支持 ESM 入口）；Electron portable（GUI 逻辑复用最省、~100MB）；Tauri v2（体积最小 5-10MB，但需移植 Rust 或捆绑 sidecar）

## 已知限制

- 数据源为 Windows 内置命令 `tasklist`（Win11 24H2 移除 wmic 后依然可用），仅支持 Windows。
- `tasklist` 输出为 OEM 编码，非 ASCII 进程名（如中文命名的 exe）可能显示乱码。
- 建议在 Windows Terminal 中运行以获得最佳颜色与字符渲染。
