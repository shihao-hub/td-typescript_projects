import type { CallOutcome, McpServerConfig, McpTool, ServerEntry, ServerStatus } from './types'

// 渲染层到主进程的唯一通道包装：所有 IPC 都走这里，类型收窄在此集中
export const bridge = {
  mcpServers(): Promise<ServerEntry[]> {
    return window.api.mcpServers() as Promise<ServerEntry[]>
  },
  mcpReconnect(id: string): Promise<{ ok: boolean; error?: { message: string } }> {
    return window.api.mcpReconnect(id)
  },
  mcpDisconnect(id: string): Promise<{ ok: boolean }> {
    return window.api.mcpDisconnect(id)
  },
  mcpListTools(
    id: string
  ): Promise<{ ok: boolean; tools?: McpTool[]; error?: { message: string } }> {
    return window.api.mcpListTools(id) as Promise<{
      ok: boolean
      tools?: McpTool[]
      error?: { message: string }
    }>
  },
  mcpCall(
    callId: string,
    id: string,
    tool: string,
    args: Record<string, unknown>
  ): Promise<CallOutcome> {
    return window.api.mcpCall(callId, id, tool, args) as Promise<CallOutcome>
  },
  mcpCancel(callId: string): Promise<{ ok: boolean }> {
    return window.api.mcpCancel(callId)
  },
  mcpDetect(projectDir: string, exeName: string): Promise<string | null> {
    return window.api.mcpDetect(projectDir, exeName)
  },
  onMcpStatus(cb: (status: ServerStatus) => void): () => void {
    return window.api.onMcpStatus(
      (p: { id: string; state: ServerStatus['state']; message?: string }) => cb(p)
    )
  },
  pickExe(defaultPath?: string): Promise<string | null> {
    return window.api.pickExe(defaultPath)
  },
  pickDir(defaultPath?: string): Promise<string | null> {
    return window.api.pickDir(defaultPath)
  },
  getSettings(): Promise<{ servers: McpServerConfig[] }> {
    return window.api.getSettings() as Promise<{ servers: McpServerConfig[] }>
  },
  setSettings(servers: McpServerConfig[]): Promise<{ ok: boolean; error?: { message: string } }> {
    return window.api.setSettings(servers)
  }
}

// newCallId 每次工具调用的唯一标识（供取消）
export function newCallId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `call-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
