import { contextBridge, ipcRenderer } from 'electron'

// 白名单 API：渲染层唯一的能力出口，只有这几个方法，不暴露 ipcRenderer 本体

export interface McpServerStatusPayload {
  id: string
  state: 'disconnected' | 'connecting' | 'connected' | 'error'
  message?: string
}

const api = {
  mcpServers: (): Promise<unknown> => ipcRenderer.invoke('mcp:servers'),
  mcpReconnect: (id: string): Promise<{ ok: boolean; error?: { message: string } }> =>
    ipcRenderer.invoke('mcp:reconnect', { id }),
  mcpDisconnect: (id: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('mcp:disconnect', { id }),
  mcpListTools: (
    id: string
  ): Promise<{ ok: boolean; tools?: unknown[]; error?: { message: string } }> =>
    ipcRenderer.invoke('mcp:list-tools', { id }),
  mcpCall: (
    callId: string,
    id: string,
    tool: string,
    args: Record<string, unknown>
  ): Promise<unknown> => ipcRenderer.invoke('mcp:call', { callId, id, tool, args }),
  mcpCancel: (callId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('mcp:cancel', { callId }),
  mcpDetect: (projectDir: string, exeName: string): Promise<string | null> =>
    ipcRenderer.invoke('mcp:detect', { projectDir, exeName }),
  onMcpStatus: (cb: (status: McpServerStatusPayload) => void): (() => void) => {
    const listener = (_e: unknown, status: McpServerStatusPayload): void => cb(status)
    ipcRenderer.on('mcp:status', listener)
    return () => ipcRenderer.removeListener('mcp:status', listener)
  },
  pickExe: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pickExe', { defaultPath }),
  pickDir: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pickDir', { defaultPath }),
  getSettings: (): Promise<unknown> => ipcRenderer.invoke('settings:get'),
  setSettings: (servers: unknown): Promise<{ ok: boolean; error?: { message: string } }> =>
    ipcRenderer.invoke('settings:set', { servers })
}

export type TooldeckApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // contextIsolation 关闭时不暴露任何能力（本应用强制开启，此分支仅为兜底）
  console.error('contextIsolation 未开启，拒绝暴露 API')
}
