// 渲染层可见的 window.api 类型声明（与 preload/index.ts 的白名单一一对应）
export interface TooldeckApi {
  cliExec: (exePath: string, args: string[], timeoutMs?: number) => Promise<unknown>
  cliExecDetached: (exePath: string, args: string[]) => Promise<{ ok: boolean }>
  cliDetect: (explicit?: string) => Promise<string | null>
  pickExe: (defaultPath?: string) => Promise<string | null>
  pickDir: (defaultPath?: string) => Promise<string | null>
  getSettings: () => Promise<{ exePath: string }>
  setSettings: (exePath: string) => Promise<{ ok: boolean }>
}

declare global {
  interface Window {
    api: TooldeckApi
  }
}
