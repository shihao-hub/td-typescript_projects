# TODO

## 拓扑采集优化：常驻 PowerShell worker 流式快照

**现状**（001 进程树功能，2026-09-03 落地）：每次拓扑采集 spawn 一次性 `powershell.exe` 跑
`Get-CimInstance Win32_Process`（`src/cim.ts`），实测单次约 2-4s，其中 powershell 冷启动约 1s。

**改进方案**：启动一个长驻 powershell 子进程，循环输出 JSON 行流（NDJSON），
taskmon 逐行消费"最近一次快照"——`src/main.ts` 的 overlap-skip 循环天然适配。

**收益**：
- 省掉每轮 ~1s 的 powershell 启动开销，采集周期可压到 1-2s；
- 单一数据源一步到位：CIM 快照本就含 WorkingSetSize，可整体替代 tasklist
  （消灭"内存来自 tasklist、拓扑来自 CIM"的双源按 PID 合并逻辑，以及 tasklist 0.2~8s 的耗时波动）。

**注意**：
- worker 崩溃要能自动重启（复用现有降级路径）；
- 子进程要挂到 taskmon 生命周期上（父进程退出时 worker 必须跟着退，避免自己变成孤儿泄漏）；
- 编码陷阱同现状：worker 脚本内必须先 `[Console]::OutputEncoding=UTF8`；
- Bun `--compile` 兼容性：仅用 `node:child_process` + stdout 行流，无新依赖。
