import { contextBridge, ipcRenderer } from 'electron'

// 白名单 API：渲染层唯一的能力出口，只有这几个方法，不暴露 ipcRenderer 本体
const api = {
  cliExec: (exePath: string, args: string[], timeoutMs?: number): Promise<unknown> =>
    ipcRenderer.invoke('cli:exec', { exePath, args, timeoutMs }),
  cliExecDetached: (exePath: string, args: string[]): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('cli:exec-detached', { exePath, args }),
  cliDetect: (explicit?: string): Promise<string | null> =>
    ipcRenderer.invoke('cli:detect', { explicit }),
  pickExe: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pickExe', { defaultPath }),
  pickDir: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pickDir', { defaultPath }),
  getSettings: (): Promise<{ exePath: string }> => ipcRenderer.invoke('settings:get'),
  setSettings: (exePath: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('settings:set', { exePath })
}

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
