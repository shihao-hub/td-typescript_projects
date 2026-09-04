# taskmon

Windows 任务管理器·内存版：控制台实时查看进程内存占用，同名进程分组展示。

- 组间按**总内存**从大到小排序
- 组内按**单进程内存**从大到小排序（展开后显示 PID、组内占比、**↖ 父进程 / † 孤儿 / 命令行**）
- **进程树视图**（`T` 切换）：按"谁拉起了谁"展示父子孙树，行内显示自身内存与**子树合计**，一眼看出某 App 整棵进程树吃掉多少
- 摘要行显示**物理内存使用率**（口径 ≈ 任务管理器「使用中/总量」）与工作集合计
- **默认只显示分组**（折叠），交互中可按 Enter 展开/收起单个组，`a` 全部展开/收起
- **`k` 结束进程**：分组视图结束整组（按 PID 快照 + 硬保护名单 + 二次确认）；树视图只结束**选中子树**（单 PID `taskkill /T`），见「结束进程与安全设计」
- 原地刷新无闪烁，光标选中 + 视口跟随滚动，**表头固定**（标题/摘要/列头不随滚动移出视口）

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
| `-t, --top <n>` | 只显示内存最大的前 n 组（树视图为前 n 个根），0 为全部 | 0 |
| `-e, --expand` | 展开全部分组/树节点（默认全部折叠） | 关 |
| `--tree` | 进程树视图（交互模式为初始视图，T 键随时切换；`--once` 输出树快照） | 关 |
| `--once` | 输出一帧快照后退出（管道/调试友好），配合 `-e` 输出全量快照 | - |
| `--multi` | 跳过全局单例锁，允许多实例并行 | 关 |

## 按键

- `↑ / ↓`：移动光标选择组/树节点，`PgUp / PgDn`：翻页，`Home / End`：首尾
- `Enter`：展开/收起当前组或树节点（`→` / `+` 展开，`←` / `-` 收起）
- `a`：全部展开 / 全部收起
- `T`：分组视图 ↔ 进程树视图切换
- `/`：按名称子串查找（Enter 跳首个匹配，Esc 取消），`n`：下一个匹配——树视图会**自动展开祖先链**直达目标行（进程从开始菜单/资源管理器启动时会挂在 explorer 等大树深处，查找是定位它们的主要手段）
- `k`：结束当前组的全部进程（树视图为**选中节点的整棵子树**，需二次确认，见下方安全设计）
- `空格 / r`：立即刷新
- `q / Ctrl+C`：退出

## 单实例锁（按版本隔离）

交互 TUI 模式下**同一版本只允许一个实例**（同机同用户）：同版本再次启动会打印 `taskmon 已在运行：exe v0.2.0 · PID 1234`（dev 实例显示 `dev`），唤起原实例的控制台窗口（还原最小化 + 前置）后以退出码 0 退出。**不同版本互不干扰可并行**（dev 与 exe、v0.2.2 与 v0.3.0 各算一个版本）。

- 锁文件：`%LOCALAPPDATA%\taskmon\singleton-v<version>.lock`（dev 为 `singleton-vdev.lock`），内容为 JSON：`pid`、`mode`（exe/dev）、`version`、`startedAt`、`hostname`。exe/dev 判定同日志模块（`TASKMON_VERSION` 编译期注入）；不带版本的旧全局锁（`singleton.lock`）会被新版自动清掉
- **不受锁约束**：`--once`、管道/重定向输出（脚本可并发取快照）、`--version`/`--help`；逃生开关 `--multi`
- **陈锁自愈**：实例被 `taskkill /F` 等强杀来不及清理时，该版本下次启动会验证锁——`pid` 已死、或 PID 被**其他进程复用**（Win32_Process 的 `CreationDate` 与锁内 `startedAt` 比对 ±5s，白名单 `taskmon.exe`/`node.exe`/`bun.exe`）即删锁接管，无需手工清理；不再使用的旧版本锁文件会残留（百余字节，无害）
- **唤起原理**：控制台窗口属 conhost / WindowsTerminal 所有，按 PID 找不到窗口；由第二实例拉起一个 PowerShell 子进程，在其内部 `FreeConsole → AttachConsole(目标pid) → GetConsoleWindow` 拿到对方控制台顶层窗口后 `SetForegroundWindow`（最小化先 `SW_RESTORE`；被前台权限拒绝时回退 `SwitchToThisWindow`）
- 已知限制：
  - Windows Terminal 多标签时只前置 WT 窗口，**不保证切到 taskmon 所在标签页**——首实例会把标签标题设为 `taskmon` 便于辨识
  - PowerShell 不可用时进程验证降级为 tasklist 名字匹配（无法防 PID 复用，极端情况可能提示误报）
  - 单例检查异常（锁目录不可写等）会降级为**无单例保护**直接启动，绝不因此阻塞

## 进程树与父子拓扑

"这 500 MB 的 node 是谁拉起来的？"——按名字分组回答不了这个问题，因此 v0.3 起引入父子拓扑：

- **数据源**：`Get-CimInstance Win32_Process`（一次性 PowerShell 子进程，拿 PPID / 创建时间 / 命令行），与 `tasklist`（内存数字）按 PID 合并
- **双节奏采集**：tasklist 按刷新间隔驱动主界面；CIM 拓扑独立异步轮询 + **overlap-skip**（上一次没跑完不发起下一次）。CIM 单次约 2-4s（含 powershell 启动 ~1s），拓扑天然滞后内存数字几秒——父子关系变化慢，无感
- **PID 复用防线**：父进程创建时间晚于子进程 → PPID 已被无关进程复用 → 断链（子进程判为根）
- **环防护**：快照竞态可能出现的互相引用环会断链提升为根，保证求和/渲染必然终止
- **孤儿标记 `†`**：曾有父但父已退出（`ppid>0` 且查无此人）。分组视图展开行显示 `† 父已退出`——典型遗留/泄漏进程信号（如编辑器重启后残留的 LSP/agent 子进程）；`ppid<=0` 或自引用（System Idle/System）视为"从未有父"，不标
- **树视图**：根 = 无有效父的进程，按**子树合计内存**降序；树视图不在根上标 `†`（Windows 顶层进程父退出是常态，全标是噪音）
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

- **默认模式版本来源是 `package.json` 的 `version`；`--tag` / `--release` 模式下 git tag（`taskmon/v*`）是唯一版本来源**，`package.json` 无需再手动维护。无论哪种模式，版本号都由 `bun --define process.env.TASKMON_VERSION=<version>` 编译期内联注入，程序内 `--version` 显示该值；`pnpm dev` 直跑时显示 `dev`。不要在 `src/` 里手写版本号。
- **exe 是构建产物，不入 git**（根 `.gitignore` 已有 `*.exe`）：版本追溯靠「产物文件名 + git tag」。

### 打包（三种模式）

```bash
pnpm exe                    # 默认：版本取 package.json 的 version
pnpm exe --tag              # 版本取 git tag（taskmon/v*），自动带可排序后缀
pnpm exe --release          # 发版一条龙（等价 --release=patch），见下节
pnpm exe --release=minor    # minor / major 同理
# 底层执行：bun build --compile --define "process.env.TASKMON_VERSION=<version>" \
#           --outfile release/taskmon-v<version>.exe src/main.ts
```

三种模式都产出 `release/taskmon-v<version>.exe`（单文件免安装，约 85MB，需安装 [Bun](https://bun.sh)），并打印体积与 sha256。验证版本：`./release/taskmon-v0.2.0.exe --version`。

`--tag` 模式的版本号规则——后缀距 tag 的提交数**零填充 4 位，字典序 = 构建先后**，按文件名排序即可区分新旧：

| git 状态 | 版本号示例 |
|---|---|
| 正好在 tag 上、树干净 | `0.2.0` |
| 领先 tag N 个提交 | `0.2.0+0002.gff02b24`（N=2，g 后是该提交短哈希） |
| 工作树有未提交/未跟踪文件 | 上述基础上再追加 `.dirty` |

### 发版（一条命令）

```bash
pnpm exe --release          # patch 自增；minor / major 用 --release=minor / --release=major
```

脚本依次完成（任一步失败即中止）：

1. 校验工作树必须干净（exe 内嵌的是**工作区**源码，脏树打 tag 会导致 tag 与产物对不上），不干净直接报错退出；
2. 基于最新可达的 `taskmon/v*` tag 自增一级（无历史 tag 时以 `package.json` 为基底）；目标 tag 已存在则报错；
3. 打 annotated tag（monorepo 多项目共用仓库，统一带 `taskmon/` 前缀防撞名）；
4. 推送 tag 到第一个 git 远程：未配置远程则提示跳过，失败仅警告（可手动 `git push origin taskmon/vX.Y.Z`）；
5. 按 `--tag` 模式构建，此时正好在 tag 上且干净，产物即无后缀的正式版本。

tag 常用命令（在仓库根目录执行）：

```bash
git tag -l "taskmon/*"        # 列出 taskmon 全部版本
git show taskmon/v0.2.0       # 查看某 tag 指向的提交与说明
git checkout taskmon/v0.2.0   # 检出该版本源码（进入 detached HEAD，看完 git switch master 回来）
git tag -d taskmon/v0.2.0     # 删除本地 tag（打错时；已推送的话还要 git push origin :refs/tags/taskmon/v0.2.0）
```

## 二期规划（已选型：Bun）

二期目标：产出两个 exe —— **CLI 控制台版** + **GUI 图形版**，打包方案选定 **Bun**。

- CLI exe：已落地（v0.2.0 起），由 `pnpm exe` 封装，见「版本与打包（exe）」
- 建议结构：重构为 `src/core`（tasklist 解析 + 分组排序）+ `src/cli` + `src/gui`，两个入口共享 core
- 落选备选：Node SEA（官方、~80MB，但步骤多且不支持 ESM 入口）；Electron portable（GUI 逻辑复用最省、~100MB）；Tauri v2（体积最小 5-10MB，但需移植 Rust 或捆绑 sidecar）

## 数据口径

- **进程内存 = 工作集（working set）**，来自 `tasklist`。工作集会**重复计算共享内存**（同一份 DLL 计入每个映射它的进程），因此「工作集合计」可大于物理内存总量，属正常现象。
- **父子拓扑（PPID / 创建时间 / 命令行）**来自 PowerShell `Get-CimInstance Win32_Process`，独立低频采集（见「进程树与父子拓扑」），比内存数字滞后数秒属正常现象。
- **物理内存**来自 `os.totalmem()` / `os.freemem()`（Windows 对应 `GlobalMemoryStatusEx`），摘要行的「物理内存 X% 已用」≈ 任务管理器的「使用中 / 总量」。
- **占比列**：组行/树行 = 组总内存或子树合计 / 物理总量（因工作集虚高，各占比之和可能 >100%）；成员行 = 单进程 / 组总量。

## 已知限制

- 数据源为 Windows 内置命令 `tasklist`（Win11 24H2 移除 wmic 后依然可用），仅支持 Windows。
- `tasklist` 输出为 OEM 编码，非 ASCII 进程名（如中文命名的 exe）可能显示乱码。
- 建议在 Windows Terminal 中运行以获得最佳颜色与字符渲染。
