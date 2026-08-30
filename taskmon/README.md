# taskmon

Windows 任务管理器·内存版：控制台实时查看进程内存占用，同名进程分组展示。

- 组间按**总内存**从大到小排序
- 组内按**单进程内存**从大到小排序（展开后显示 PID、组内占比）
- **默认只显示分组**（折叠），交互中可按 Enter 展开/收起单个组，`a` 全部展开/收起
- 原地刷新无闪烁，光标选中 + 视口跟随滚动

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
| `-e, --expand` | 展开全部分组（默认全部折叠） | 关 |
| `--once` | 输出一帧快照后退出（管道/调试友好），配合 `-e` 输出全量快照 | - |

## 按键

- `↑ / ↓`：移动光标选择组，`PgUp / PgDn`：翻页，`Home / End`：首尾
- `Enter`：展开/收起当前组（`→` / `+` 展开，`←` / `-` 收起）
- `a`：全部展开 / 全部收起
- `空格 / r`：立即刷新
- `q / Ctrl+C`：退出

## 二期规划（已选型：Bun）

二期目标：产出两个 exe —— **CLI 控制台版** + **GUI 图形版**，打包方案选定 **Bun**。

- CLI exe：`bun build --compile src/main.ts --outfile taskmon.exe`，单文件免安装，约 90MB
- 建议结构：重构为 `src/core`（tasklist 解析 + 分组排序）+ `src/cli` + `src/gui`，两个入口共享 core
- 落选备选：Node SEA（官方、~80MB，但步骤多且不支持 ESM 入口）；Electron portable（GUI 逻辑复用最省、~100MB）；Tauri v2（体积最小 5-10MB，但需移植 Rust 或捆绑 sidecar）

## 已知限制

- 数据源为 Windows 内置命令 `tasklist`（Win11 24H2 移除 wmic 后依然可用），仅支持 Windows。
- `tasklist` 输出为 OEM 编码，非 ASCII 进程名（如中文命名的 exe）可能显示乱码。
- 建议在 Windows Terminal 中运行以获得最佳颜色与字符渲染。
