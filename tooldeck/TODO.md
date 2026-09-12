# tooldeck TODO（探索项，暂不实施）

## CLI 契约 schema 化

让 `help` 输出每条命令的参数 JSON Schema，GUI 动态渲染界面——相当于 CLI 界的 OpenAPI 自描述：

- 四个 CLI（exestarter / filesync / quickask / zreadmanager）统一 help schema 格式
- tooldeck 新模块接入时零硬编码：读 schema 自动生成参数表单 / 校验
- 需要先在 `docs/go_projects/clictl/Go CLI JSON 输出模式参考.md` 里补 schema 约定

## MCP 化

四个 CLI 各包一层 MCP server（stdio JSON-RPC），可被 LLM 客户端直接当工具调用：

- quickask 最适合先行（问答型、无状态）
- 复用现有 JSON 包络纪律，MCP tool schema 从命令定义生成
- 可与 schema 化共用同一份命令元数据

## 其他

- exestarter 模块：列表排序（名称 / 添加时间 / 标签）、列宽自定义
- 模块接入 filesync / quickask / zreadmanager（各自出计划）
- 便携目录分发脚本：自动把 exestarter.exe 复制到 bin\ 并一起打包
