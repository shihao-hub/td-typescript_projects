# jtree

通用 JSON → 终端树形渲染器：把任意 JSON 渲染成带颜色的树形结构，不绑定任何特定 CLI。

## 用法

```powershell
# ① exec 模式（推荐）：直接 spawn 子进程读原始字节，PowerShell 下中文不乱码
jtree exec -- clictl -h --pretty

# ② stdin 管道
clictl -h --pretty | jtree

# ③ 文件
jtree help.json
```

渲染规则：

- 对象：键为节点，原始值同行显示；空对象 / 空数组显示 `{}` / `[]`
- 数组：元素以 `[i]` 为节点；原始值同行显示
- 数组对象元素：优先取 `cmd` / `command` / `name` / `flag` / `title` / `id` 等常见键的值做标题，字段仍全部展开
- 单行超出终端宽度（CJK 按双宽计）自动截断加 `…`

## PowerShell 5.1 编码注意

`exe | exe` 管道中 PowerShell 会按控制台编码转码，中文 JSON 会损坏（甚至无法解析）。
两种规避方式：

- 用 exec 模式（推荐，见上）；
- 管道前设置全链路 UTF-8：

```powershell
$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8
```

## 颜色

- 默认：TTY 下启用 ANSI 颜色；重定向或非 TTY 自动关闭
- `--no-color` 显式关闭；设置环境变量 `NO_COLOR` 同样关闭

## 退出码

- `0` 成功渲染
- `1` 输入为空 / JSON 解析失败（stderr 含行列位置）/ 文件不可读
- exec 模式下子进程失败且无 stdout 可解析时，透传子进程退出码与 stderr

## 开发

```powershell
npm run dev        # tsx 直跑
npm test           # vitest
npm run typecheck  # tsc --noEmit（主代码 + 测试）
npm run build      # 产物 dist/main.js
npm link           # 全局安装 jtree 命令
```
