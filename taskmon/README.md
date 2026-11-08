# taskmon

Windows 任务管理器·内存与 CPU 版：控制台实时查看进程内存与算力占用，同名进程分组或进程树展示。

- **默认清爽纯内存视图**：默认界面完全保持原始纯内存版样貌，不挤占宽度，条形图与名称列空间充裕
- **按需查看 CPU 占用**：支持启动参数 `--cpu` 或交互中随时按 **`c`** 键一键呼出/隐藏 CPU 占用列与系统 CPU 摘要
- 组间支持按**总内存**或**总 CPU** 从大到小排序（快捷键 `s` 切换，切换至 CPU 排序时自动展开 CPU 列）
- 组内按**单进程内存**或**单进程 CPU** 从大到小排序（展开后显示 PID、CPU%、组内占比、**↖ 父进程 / † 孤儿 / 命令行**）
- **进程树视图**（`T` 切换）：按"谁拉起了谁"展示父子孙树，行内显示自身内存与**子树合计**（开启 CPU 时额外显示自身 CPU 与子树 CPU），一眼看出某 App 整棵进程树吃掉多少算力与内存
- 摘要行显示 **物理内存使用率**（口径 ≈ 任务管理器「使用中/总量」）与工作集合计，开启 `--cpu` 时追加 **CPU 总使用率**
- **默认只显示分组**（折叠），交互中可按 Enter 展开/收起单个组，`a` 全部展开/收起
- **`k` 结束进程**：分组视图结束整组（按 PID 快照 + 硬保护名单 + 二次确认）；树视图只结束**选中子树**（单 PID `taskkill /T`），见「结束进程与安全设计」
- 原地刷新无闪烁，光标选中 + 视口跟随滚动，**表头固定**（标题/摘要/列头不随滚动移出视口）
- **版本说明**：关于可控参数 `--cpu`、默认纯内存设计以及历史版本说明，参见 [README-VERSIONS.md](./README-VERSIONS.md)。

## 使用

```bash
pnpm install
pnpm dev            # 开发运行（tsx 直跑，--version 显示 dev）
pnpm build && pnpm start
pnpm exe            # 打包单文件 exe（需 Bun），见下方「版本与打包」
pnpm use            # 将 release/ 下最新版本的 exe 覆盖到根目录 taskmon.exe
pnpm dev serve      # 启动浏览器工作台（与 GUI 共用同一 WebUI）
pnpm gui            # 开发模式直接开窗（关窗即退，无托盘）
pnpm gui:package    # 打包 GUI → release/gui/win-unpacked/{taskmon.exe,taskmon-tray.exe}
```

## 参数

| 参数 | 说明 | 默认 |
|---|---|---|
| `-i, --interval <seconds>` | 刷新间隔（秒），最小 1 | 2 |
| `-t, --top <n>` | 只显示资源最大的前 n 组（树视图为前 n 个根），0 为全部 | 0 |
| `-s, --sort <type>` | 排序依据：`mem`（按内存）或 `cpu`（按 CPU 占用，会自动开启 CPU 列） | `mem` |
| `--cpu` | 显示 CPU 占用列与系统 CPU 摘要（默认仅展示内存，保持界面清爽） | 关 |
| `-e, --expand` | 展开全部分组/树节点（默认全部折叠） | 关 |
| `--tree` | 进程树视图（交互模式为初始视图，T 键随时切换；`--once` 输出树快照） | 关 |
| `--once` | 输出一帧快照后退出（管道/调试友好），配合 `-e` 输出全量快照 | - |
| `--multi` | 跳过全局单例锁，允许多实例并行 | 关 |

`serve` 是独立子命令（不进入 TUI、不抢 TUI 单例锁）：`pnpm dev serve [--port 0]`，根路径返回完整工作台，`/api/*` 提供快照与结束进程接口。

## GUI 桌面版（轻量托盘 + 按需窗口）

参照 `sh-go-wails-desktop` 的双通道契约，但按「点开才看」的使用习惯拆成两层，避免 Chromium 常驻：

| 层 | 入口 | 常驻内存 | 行为 |
|---|---|---|---|
| 托盘 | `release/gui/win-unpacked/taskmon-tray.exe` | 约 30 MB | 常驻通知区；点击打开面板，关窗不影响托盘 |
| 窗口 | `release/gui/win-unpacked/taskmon.exe` / `pnpm gui` | 约 440 MB（仅打开时） | HTTP 服务 + Electron 窗口；关窗即整体退出 |
| CLI | `release/taskmon-v*.exe` / `pnpm dev` | 仅运行时 | 控制台 TUI，无窗口 |

- **关窗即销毁**：窗口关闭后 Electron 主进程、renderer、GPU、utility 全部退出，内存归零；下次点击托盘重新启动并恢复上次几何。
- **托盘轻量**：托盘是 Windows 自带 `csc` 编译的 C# WinForms sidecar（约 30 MB），业务与界面仍全部是 TS/Electron。
- **单实例**：GUI 与 CLI 各自单实例；dev / release 通道互不唤醒（`Electron userData` 指向通道数据目录）。
- **窗口几何记忆**：`<dataDir>/window.json` 记录尺寸/位置/最大化；最大化只翻标记，不污染还原尺寸；外接屏拔掉后窗口会自动回中。
- **同一 Handler**：GUI 窗口与 `serve` 打开的是同一套 `src/web` 工作台与 `/api/*`，不存在「GUI 有页面、CLI 只有裸 API」的分裂。
- **数据目录**：`%APPDATA%\language_projects\taskmon\{dev,prod}`（日志、锁、窗口状态、Electron 缓存均在其中）。
- **开机自启**：托盘右键菜单可勾选（仅 release 编译的托盘允许写入；dev 托盘置灰）。
- **体积代价**：GUI 目录约 360 MB（Electron runtime）；CLI 仍是约 85 MB 的单文件 exe。

### 目录结构

```text
src/core/     采集与纯逻辑（tasklist / cim / grouping / proctree / kill / sysmem / syscpu / sampler）
src/cli/      控制台 TUI（main / render / singleton）
src/server/   node:http Handler（GUI 与 CLI serve 共用）
src/web/      内嵌工作台（HTML/CSS/JS 字符串，Bun 与 Electron 共用）
src/shared/   通道判定、数据目录、日志
electron/     Electron 窗口宿主（单实例 / 几何记忆）
tray/         轻量托盘 sidecar（C# WinForms，csc 编译）
```

## 按键

- `↑ / ↓`：移动光标选择组/树节点，`PgUp / PgDn`：翻页，`Home / End`：首尾
- `Enter`：展开/收起当前组或树节点（`→` / `+` 展开，`←` / `-` 收起）
- `a`：全部展开 / 全部收起
- `c`：**CPU 显示开关**（在纯内存清爽视图与 CPU 视图间即时切换）
- `s`：在 **按内存排序** 与 **按 CPU 排序** 之间切换（切至 CPU 时会自动开启 CPU 列）
- `T`：分组视图 ↔ 进程树视图切换
- `/`：按名称子串查找（Enter 跳首个匹配，Esc 取消），`n`：下一个匹配——树视图会**自动展开祖先链**直达目标行（进程从开始菜单/资源管理器启动时会挂在 explorer 等大树深处，查找是定位它们的主要手段）
- `k`：结束当前组的全部进程（树视图为**选中节点的整棵子树**，需二次确认，见下方安全设计）
- `空格 / r`：立即刷新
- `q / Ctrl+C`：退出

## 单实例锁（按版本隔离）

交互 TUI 模式下**同一版本只允许一个实例**（同机同用户）：同版本再次启动会打印 `taskmon 已在运行：exe v0.2.0 · PID 1234`（dev 实例显示 `dev`），唤起原实例的控制台窗口（还原最小化 + 前置）后以退出码 0 退出。**不同版本互不干扰可并行**（dev 与 exe、v0.2.2 与 v0.3.0 各算一个版本）。

- 锁文件：`%APPDATA%\language_projects\taskmon\<dev|prod>\singleton-v<version>.lock`（dev 为 `singleton-vdev.lock`；取不到 APPDATA 回退 `~/.language_projects/taskmon/<dev|prod>/`），内容为 JSON：`pid`、`mode`（exe/dev）、`version`、`startedAt`、`hostname`。exe/dev 判定同日志模块（`TASKMON_VERSION` 编译期注入）；不带版本的旧全局锁（`singleton.lock`）会被新版自动清掉
- **不受锁约束**：`--once`、管道/重定向输出（脚本可并发取快照）、`--version`/`--help`；逃生开关 `--multi`
- **陈锁自愈**：实例被 `taskkill /F` 等强杀来不及清理时，该版本下次启动会验证锁——`pid` 已死、或 PID 被**其他进程复用**（Win32_Process 的 `CreationDate` 与锁内 `startedAt` 比对 ±5s，白名单 `taskmon.exe`/`node.exe`/`bun.exe`）即删锁接管，无需手工清理；不再使用的旧版本锁文件会残留（百余字节，无害）
- **唤起原理**：控制台窗口属 conhost / WindowsTerminal 所有，按 PID 找不到窗口；由第二实例拉起一个 PowerShell 子进程，在其内部 `FreeConsole → AttachConsole(目标pid) → GetConsoleWindow` 拿到对方控制台顶层窗口后 `SetForegroundWindow`（最小化先 `SW_RESTORE`；被前台权限拒绝时回退 `SwitchToThisWindow`）
- 已知限制：
  - Windows Terminal 多标签时只前置 WT 窗口，**不保证切到 taskmon 所在标签页**——首实例会把标签标题设为 `taskmon` 便于辨识
  - PowerShell 不可用时进程验证降级为 tasklist 名字匹配（无法防 PID 复用，极端情况可能提示误报）
  - 单例检查异常（锁目录不可写等）会降级为**无单例保护**直接启动，绝不因此阻塞

## 进程树与父子拓扑

"这 500 MB 的 node 是谁拉起来的？"——按名字分组回答不了这个问题，因此 v0.3 起引入父子拓扑：

- **数据源**：`Get-CimInstance Win32_Process`（一次性 PowerShell 子进程，拿 PPID / 创建时间 / 命令行 / CPU 时间片），与 `tasklist`（内存数字）按 PID 合并
- **双节奏采集**：tasklist 按刷新间隔驱动主界面；CIM 拓扑独立异步轮询 + **overlap-skip**（上一次没跑完不发起下一次）。CIM 单次约 2-4s（含 powershell 启动 ~1s），拓扑天然滞后内存数字几秒——父子关系变化慢，无感
- **PID 复用防线**：父进程创建时间晚于子进程 → PPID 已被无关进程复用 → 断链（子进程判为根）
- **环防护**：快照竞态可能出现的互相引用环会断链提升为根，保证求和/渲染必然终止
- **孤儿标记 `†`**：曾有父但父已退出（`ppid>0` 且查无此人）。分组视图展开行显示 `† 父已退出`——典型遗留/泄漏进程信号（如编辑器重启后残留的 LSP/agent 子进程）；`ppid<=0` 或自引用（System Idle/System）视为"从未有父"，不标
- **树视图**：根 = 无有效父的进程，按**子树合计内存或 CPU** 降序；树视图不在根上标 `†`（Windows 顶层进程父退出是常态，全标是噪音）
- **默认展开 explorer 根**：开始菜单/资源管理器启动的 App 都挂在 explorer.exe 下，进树视图第一眼就能看到自己的应用（只影响交互模式初始状态，`--once` 管道输出不受影响；手动收起后不复活）
- **降级**：PowerShell 不可用 / CIM 失败时，分组视图丢父列、树视图提示"拓扑不可用"并把全部进程显示为独立根，主刷新不受任何影响

## 结束进程与安全设计

`k` 对光标所在目标发起结束（分组视图 = 整个名字组；树视图 = **选中节点的整棵子树**，此时只对根 PID 发单个 `taskkill /F /T`，子进程由 `/T` 连带），执行链路刻意做保守：

- **按 PID 快照执行**：确认时冻结自动刷新并捕获目标当前全部 PID，`taskkill /F /T /PID` **串行**逐个结束（`/T` 连带子进程树；单个 PID 树终止超时 15s 时自动回退 `/F` 直接结束，保证目标必死）；快照之后新起的同名进程不会被误伤。串行而非并行：并行 `/T` 会对互相重叠的进程树反复快照互相拖慢，深树场景（如 IDE 带 node 子进程链）曾导致整体超时一刀未落
- **二次确认**：确认条显示目标名（树视图含根 PID）、进程数与合计内存，`y` 执行、`n`/`Esc`/`q` 取消，其他按键忽略；执行中状态条显示进度 `(i/N) · PID`
- **硬保护名单**（拒绝结束，直接提示）：`System`、`System Idle Process`、`Registry`、`Memory Compression`、`smss/csrss/wininit/winlogon/services/lsass/svchost/fontdrvhost` 等致命进程，以及 `dwm/explorer/sihost/taskhostw` 等高破坏进程——真要杀请用系统任务管理器
- **防自杀**：taskmon 自身所在分组（树视图为：自身所在子树）拒绝结束（开发模式下即 `node.exe` 组）
- **逐 PID 汇报结果**：`已结束 X · 已退出 Y · 失败 Z`；快照期间已退出的报「已退出」，非管理员杀提权进程报「失败(无权限)」。成败判定走 taskkill 退出码，不解析其输出文本（OEM 编码会乱码）
- 每次 kill 动作（目标、PID 列表、逐 PID 结果与耗时）写入日志文件留审计痕迹
