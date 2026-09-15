import { ipcMain, dialog, BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { McpManager } from './mcp/manager'
import type { McpServerConfig } from './settings'
import { loadSettings, saveSettings } from './settings'
import { detectServerExe } from './detect'

// IPC 通道白名单：mcp:* / dialog:* / settings:*
// 入参一律做形状校验，坏参数返回结构化错误而非异常。
// 一切调用失败都折叠为 {ok:false, error:{message}}，渲染层统一展示。

const manager = new McpManager()

// 连接状态变化 → 广播到所有窗口（渲染层据此刷新 UI）
manager.onStatus((status) => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('mcp:status', status)
  }
})

interface Fail {
  ok: false
  error: { message: string }
}

function fail(message: string): Fail {
  return { ok: false, error: { message } }
}

// findServer：按 id 取已启用的配置
function findServer(id: unknown): McpServerConfig | null {
  if (typeof id !== 'string') return null
  return loadSettings().servers.find((s) => s.id === id && s.enabled) ?? null
}

export function registerIpc(): void {
  // 配置 + 当前状态列表。首启（无任何配置）时自动探测 clictl 写入默认连接，
  // 开箱即用；探测不到则保持空列表（UI 引导设置页）。
  ipcMain.handle('mcp:servers', () => {
    let settings = loadSettings()
    if (settings.servers.length === 0) {
      const hit = detectServerExe('clictl', 'clictl.exe')
      if (hit) {
        settings = {
          servers: [{ id: 'clictl', label: 'clictl', exePath: hit, args: ['mcp'], enabled: true }]
        }
        saveSettings(settings)
      }
    }
    const servers = settings.servers
    return servers.map((s) => ({ ...s, state: manager.status(s.id) }))
  })

  // 手动重连（也用于设置修改后生效）
  ipcMain.handle('mcp:reconnect', async (_e, payload: unknown) => {
    const p = payload as { id?: unknown }
    const config = findServer(p?.id)
    if (!config || !existsSync(config.exePath)) {
      return fail('server 配置无效或 exe 不存在')
    }
    await manager.disconnect(config.id)
    try {
      await manager.listTools(config)
      return { ok: true }
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  })

  ipcMain.handle('mcp:disconnect', async (_e, payload: unknown) => {
    const p = payload as { id?: unknown }
    if (typeof p?.id !== 'string') return fail('参数不合法')
    await manager.disconnect(p.id)
    return { ok: true }
  })

  // 工具发现（懒连接：首次调用时启动 server 进程）
  ipcMain.handle('mcp:list-tools', async (_e, payload: unknown) => {
    const p = payload as { id?: unknown }
    const config = findServer(p?.id)
    if (!config) return fail('未知或未启用的 server')
    if (!existsSync(config.exePath)) return fail(`exe 不存在: ${config.exePath}`)
    try {
      const tools = await manager.listTools(config)
      return { ok: true, tools }
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  })

  // 工具调用：callId 由渲染层生成（uuid），用于取消；完成前 Promise 一直 pending
  ipcMain.handle('mcp:call', async (_e, payload: unknown): Promise<unknown> => {
    const p = payload as {
      callId?: unknown
      id?: unknown
      tool?: unknown
      args?: unknown
    }
    const config = findServer(p?.id)
    if (
      !config ||
      typeof p?.callId !== 'string' ||
      typeof p?.tool !== 'string' ||
      typeof p?.args !== 'object' ||
      p.args === null
    ) {
      return fail('参数不合法')
    }
    return manager.call(config, p.callId, p.tool, p.args as Record<string, unknown>)
  })

  ipcMain.handle('mcp:cancel', (_e, payload: unknown) => {
    const p = payload as { callId?: unknown }
    if (typeof p?.callId !== 'string') return { ok: false }
    return { ok: manager.cancel(p.callId) }
  })

  // server exe 探测（设置页「自动探测」按钮）
  ipcMain.handle('mcp:detect', (_e, payload: unknown) => {
    const p = payload as { projectDir?: unknown; exeName?: unknown }
    if (typeof p?.projectDir !== 'string' || typeof p?.exeName !== 'string') {
      return null
    }
    return detectServerExe(p.projectDir, p.exeName)
  })

  ipcMain.handle('dialog:pickExe', async (_e, payload: unknown) => {
    const p = payload as { defaultPath?: unknown } | undefined
    const r = await dialog.showOpenDialog({
      title: '选择可执行文件',
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
    const p = payload as { servers?: unknown }
    const failShape = fail('settings:set 参数不合法')
    if (typeof p?.servers !== 'object' || p.servers === null || !Array.isArray(p.servers)) {
      return failShape
    }
    for (const item of p.servers) {
      const c = item as Partial<McpServerConfig>
      if (
        typeof c.id !== 'string' ||
        typeof c.label !== 'string' ||
        typeof c.exePath !== 'string' ||
        !Array.isArray(c.args) ||
        typeof c.enabled !== 'boolean'
      ) {
        return failShape
      }
    }
    // 配置变更后：断开全部旧连接（新配置懒重连）
    manager.shutdown().then(() => undefined)
    saveSettings({ servers: p.servers as McpServerConfig[] })
    return { ok: true }
  })
}

// app 退出前清理全部 server 子进程（main/index.ts 的 before-quit 调用）
export function shutdownMcp(): void {
  void manager.shutdown()
}
