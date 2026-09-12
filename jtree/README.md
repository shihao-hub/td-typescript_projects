# jtree

通用 JSON → 终端树形渲染器：从 stdin 读取任意 JSON，渲染成方便阅读的树形结构。

## 用法

```powershell
clictl -h --pretty | jtree
```

渲染规则（taskmon 风格：每层 2 空格缩进 + `├─/└─`）：

- 对象：每个键一行，原始值同行显示；空对象/空数组显示 `{}` / `[]`
- 数组：键名附 `(N)` 计数，元素以 `[i]` 为节点，对象元素展开全部字段
- 颜色：树符号/`(N)`/`[i]`/bool/null 灰、字符串绿、数字黄；`NO_COLOR` 或重定向自动无色
- 单行超出终端宽度自动截断加 `…`

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
pnpm build        # 产物 dist/main.js
pnpm add --global .   # 全局安装 jtree 命令（链接到本目录，改源码后 pnpm build 生效）
```
