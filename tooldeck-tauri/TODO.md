# tooldeck-tauri（占位）

Tauri 2 复刻 tooldeck 的探索目录，**当前无任何代码**。等 Electron 版功能稳定、模块全部接入后再评估启动。

## 复刻要点

- **spawn 替代**：主进程 child_process spawn → `tauri-plugin-shell`（Command API），CLI bridge 层的包络解析 / 超时 / 串行队列逻辑可平移
- **单实例**：`tauri-plugin-single-instance`（官方插件），第二实例事件里聚焦已有窗口，语义与 Electron 原生锁一致
- **fs 直读 vs CLI 壳**：维持架构红线——数据操作仍走 CLI 子命令 + JSON 包络，Tauri 的 fs 插件只用于读写 tooldeck 自身设置（settings.json），不碰 CLI 的 config.json
- **体积对比**：预期 Tauri ~10MB vs Electron portable ~150MB+，这是迁移的核心动机；代价是 Rust 工具链与 WebView2 依赖（Win10 需装 WebView2 Runtime）
- **前端复用**：renderer 层（React + 手写 CSS + bridge 抽象）原样复用，只换 `window.api` 实现层

## 启动条件

- tooldeck Electron 版四模块全部接入且稳定
- CLI 契约 schema 化（见 `../tooldeck/TODO.md`）落地，新壳接入成本足够低
