# jtree

通用 JSON → 终端树形渲染器：从 stdin 读取任意 JSON，渲染成方便阅读的树形结构；stdout 为终端时自动进入交互式浏览（taskmon 风格 TUI）。

## 用法

```powershell
clictl -h --pretty | jtree     # 终端下自动进入交互浏览
<命令> | jtree -p              # 强制纯打印（不进交互）
jtree -h / -v                  # 帮助 / 版本
```

触发规则：stdout 为终端且未指定 `-p` → 交互模式；stdout 接管道或重定向（如 `jtree | grep`）→ 自动降级纯打印。

## 交互模式

在备用屏中浏览（退出后恢复原屏幕），默认全展开，底部状态行显示位置与滚动指示：

| 按键 | 动作 |
|---|---|
| `↑`/`↓` 或 `j`/`k` | 上下移动（视口自动跟随） |
| `PgUp`/`PgDn`、`Home`/`End`（`g`/`G`） | 翻页、跳首行/末行 |
| `←`/`-`、`→`/`+` | 收起/展开当前节点（`▾`/`▸` 指示） |
| `Enter`/`空格` | 切换折叠 |
| `a` | 全收起 ↔ 全展开 |
| `q`/`Ctrl+C` | 退出（退出码 0） |

键盘输入来源：stdin 为终端时直接读 stdin；stdin 被管道占用（`命令 | jtree` 主场景）时在 Windows 上直接打开控制台输入设备 `\\.\CONIN$` 读取。当前运行时限制：**Bun 打包的 exe 在管道输入下暂无法进入交互模式**（Bun 的 `tty.ReadStream` 不支持该路径的 raw mode），会自动降级纯打印并提示；Node 运行时（`pnpm dev` / `node dist/main.js`）交互完整可用，待 Bun 上游修复后 exe 自动跟进。

## 渲染规则

taskmon 风格：每层 2 空格缩进 + `├─/└─`，无竖线延续线。

- 对象：每个键一行，原始值同行显示；空对象/空数组显示 `{}` / `[]`
- 数组：键名附 `(N)` 计数，元素以 `[i]` 为节点，对象元素展开全部字段
- 颜色：树符号/`(N)`/`[i]`/bool/null 灰、字符串绿、数字黄；`NO_COLOR` 或重定向自动无色
- 单行超出终端宽度按显示宽度截断加 `…`（中文等宽字符按 2 列计）

## PowerShell 5.1 编码注意

PS 5.1 在两个 exe 之间转发管道数据时会按控制台编码转码，中文 JSON 会损坏（jtree 收到时已坏，无法自救）。解析失败时 jtree 会给出提示。解决方式任选其一：

```powershell
# 方式一：管道前设置全链路 UTF-8
$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8

# 方式二：使用 Git Bash 或 PowerShell 7（管道字节直通，无此问题）
```

## 分发 exe

```powershell
pnpm exe    # → release/jtree-v{版本}.exe（bun compile 单文件，目标机器无需 Node/pnpm/bun）
```

## 开发

```powershell
pnpm install
pnpm dev          # tsx 直跑
pnpm test         # vitest
pnpm typecheck    # tsc --noEmit（主代码 + 测试 + scripts）
pnpm build        # 先清 dist 再 tsc，产物 dist/main.js
pnpm add --global .   # 全局安装 jtree 命令（链接到本目录，改源码后 pnpm build 生效）
```

版本号有两处需同步修改：`package.json` 的 `version` 与 `src/main.ts` 的 `VERSION` 常量（后者因 rootDir 限制无法 import 前者）。

