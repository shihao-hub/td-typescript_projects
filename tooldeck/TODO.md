# tooldeck TODO

## 已移除方向

- CRUD 声明式配置层（CrudPanel / crudConfigs）已删除，tooldeck 定位对齐 MCP Inspector（工具面板 + 填参执行 + 结果查看）；未来如需资源表格再评估。

## 其余 CLI 的 MCP 化接入

按父仓 `docs/go_projects/clictl/MCP 接口文档.md` 迁移矩阵逐个接入（各自出计划）：

- exestarter：补 `mcp` 子命令（复用 clictl 的 internal/mcp 模式）后零前端接入
- filesync：run 是长任务（同步可能跑数分钟），MCP 化时需要进度事件（tools/call 进度通知或 task 流）
- quickask：流式问答，需要 MCP task / 流式结果（`callToolStream`）
- zreadmanager：进程生命周期管理，start/stop/status 直接映射

## 通用能力增强

- 工具参数记忆：同工具上次填写值持久化（localStorage / settings），常用命令免重填
- 结果导出：表格导出 CSV / JSON
- server 日志查看：stderr 转发已有，补一个日志面板
- 多 server 并发状态总览（导航徽标已有连接点，补错误重试按钮）

## 打包分发

- 便携目录分发脚本：自动把 clictl.exe 复制到 bin\ 并一起打包
