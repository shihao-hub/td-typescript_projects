// MCP 相关共享类型（渲染层；主进程侧定义见 src/main/settings.ts 与 src/main/mcp/manager.ts）

export interface McpServerConfig {
  id: string
  label: string
  exePath: string
  args: string[]
  cwd?: string
  enabled: boolean
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ServerStatus {
  id: string
  state: ConnectionState
  message?: string
}

export interface ServerEntry extends McpServerConfig {
  state: ServerStatus
}

export interface McpTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  annotations?: Record<string, unknown>
}

// 工具调用结果（主进程 manager.call 的返回形状）
export interface CallOutcome {
  ok: boolean
  isError?: boolean // 工具级失败（IsError，结果可能仍含 structuredContent）
  structuredContent?: unknown
  content?: Array<{ type: string; text?: string }>
  error?: { message: string } // 协议级/传输级失败
}

export function errText(err: { message?: string } | undefined): string {
  return err?.message ?? '未知错误'
}
