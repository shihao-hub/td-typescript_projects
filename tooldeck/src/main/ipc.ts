import { ipcMain, dialog } from 'electron'
import { runCli, spawnDetached } from './cli-runner'
import { detectCliPath } from './detect'
import { loadSettings, saveSettings } from './settings'

// IPC 通道白名单：cli:exec / cli:exec-detached / cli:detect / dialog:* / settings:*
// 入参一律做形状校验，坏参数返回结构化错误而非异常。
export function registerIpc(): void {
  ipcMain.handle('cli:exec', (_e, payload: unknown) => {
    const p = payload as { exePath?: unknown; args?: unknown; timeoutMs?: unknown }
    if (typeof p?.exePath !== 'string' || !Array.isArray(p.args)) {
      return {
        ok: false,
        error: { code: 'bad_args', message: 'cli:exec 参数不合法' },
        exitCode: -1
      }
    }
    const timeoutMs = typeof p.timeoutMs === 'number' && p.timeoutMs > 0 ? p.timeoutMs : undefined
    return runCli(p.exePath, p.args as string[], timeoutMs)
  })

  ipcMain.handle('cli:exec-detached', (_e, payload: unknown) => {
    const p = payload as { exePath?: unknown; args?: unknown }
    if (typeof p?.exePath !== 'string' || !Array.isArray(p.args)) {
      return { ok: false }
    }
    return { ok: spawnDetached(p.exePath, p.args as string[]) }
  })

  ipcMain.handle('cli:detect', (_e, payload: unknown) => {
    const p = payload as { explicit?: unknown } | undefined
    const explicit = typeof p?.explicit === 'string' ? p.explicit : undefined
    return detectCliPath(explicit)
  })

  ipcMain.handle('dialog:pickExe', async (_e, payload: unknown) => {
    const p = payload as { defaultPath?: unknown } | undefined
    const r = await dialog.showOpenDialog({
      title: '选择 exe 文件',
      properties: ['openFile'],
      filters: [{ name: '可执行文件', extensions: ['exe'] }],
      defaultPath: typeof p?.defaultPath === 'string' ? p.defaultPath : undefined
    })
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
  })

  ipcMain.handle('dialog:pickDir', async (_e, payload: unknown) => {
    const p = payload as { defaultPath?: unknown } | undefined
    const r = await dialog.showOpenDialog({
      title: '选择目录',
      properties: ['openDirectory'],
      defaultPath: typeof p?.defaultPath === 'string' ? p.defaultPath : undefined
    })
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
  })

  ipcMain.handle('settings:get', () => loadSettings())

  ipcMain.handle('settings:set', (_e, payload: unknown) => {
    const p = payload as { exePath?: unknown }
    if (typeof p?.exePath !== 'string') {
      return { ok: false, error: { code: 'bad_args', message: 'settings:set 参数不合法' } }
    }
    saveSettings({ exePath: p.exePath })
    return { ok: true }
  })
}
