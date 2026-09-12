import type { CliExecResult } from './types'

// 渲染层到主进程的唯一通道包装：所有 IPC 都走这里，类型收窄在此集中
export const bridge = {
  cliExec<T>(exePath: string, args: string[], timeoutMs?: number): Promise<CliExecResult<T>> {
    return window.api.cliExec(exePath, args, timeoutMs) as Promise<CliExecResult<T>>
  },
  cliExecDetached(exePath: string, args: string[]): Promise<{ ok: boolean }> {
    return window.api.cliExecDetached(exePath, args)
  },
  async cliDetect(explicit?: string): Promise<string | null> {
    return window.api.cliDetect(explicit)
  },
  pickExe(defaultPath?: string): Promise<string | null> {
    return window.api.pickExe(defaultPath)
  },
  pickDir(defaultPath?: string): Promise<string | null> {
    return window.api.pickDir(defaultPath)
  },
  getSettings(): Promise<{ exePath: string }> {
    return window.api.getSettings()
  },
  setSettings(exePath: string): Promise<{ ok: boolean }> {
    return window.api.setSettings(exePath)
  }
}
