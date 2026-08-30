# taskmon

Windows 任务管理器·内存版：控制台实时查看进程内存占用，同名进程分组展示。

- 组间按**总内存**从大到小排序
- 组内按**单进程内存**从大到小排序（显示 PID、组内占比）
- 多实例组：组头行（名称 ×N、总内存、条形图）+ 成员行；单实例组折叠为一行
- 原地刷新无闪烁，支持滚动浏览

## 使用

```bash
pnpm install
pnpm dev            # 开发运行（tsx 直跑）
pnpm build && pnpm start
```

## 参数

| 参数 | 说明 | 默认 |
|---|---|---|
| `-i, --interval <seconds>` | 刷新间隔（秒），最小 1 | 2 |
| `-t, --top <n>` | 只显示内存最大的前 n 组，0 为全部 | 0 |
| `--once` | 输出一帧快照后退出（管道/调试友好） | - |

## 按键

- `↑ / ↓`：滚动，`PgUp / PgDn`：翻页，`Home / End`：首尾
- `空格 / r`：立即刷新
- `q / Ctrl+C`：退出

## 已知限制

- 数据源为 Windows 内置命令 `tasklist`（Win11 24H2 移除 wmic 后依然可用），仅支持 Windows。
- `tasklist` 输出为 OEM 编码，非 ASCII 进程名（如中文命名的 exe）可能显示乱码。
- 建议在 Windows Terminal 中运行以获得最佳颜色与字符渲染。
