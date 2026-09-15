import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

// 应用设置：MCP server 连接配置列表。
// 落盘于 %APPDATA%\language_projects\tooldeck\settings.json（与各 CLI 数据同根不同目录；
// GUI 不读写 CLI 的自有数据文件，这是架构红线）。
export interface McpServerConfig {
  id: string // 连接标识（稳定，导航与配置关联用）
  label: string // 展示名
  exePath: string // server 可执行文件路径
  args: string[] // 启动参数（如 clictl 的 ["mcp"]）
  cwd?: string
  enabled: boolean
}

export interface Settings {
  servers: McpServerConfig[]
}

export function defaultSettings(): Settings {
  return { servers: [] }
}

function settingsDir(): string {
  if (process.env.APPDATA) {
    return join(process.env.APPDATA, 'language_projects', 'tooldeck')
  }
  return join(os.homedir(), '.language_projects', 'tooldeck')
}

function settingsPath(): string {
  return join(settingsDir(), 'settings.json')
}

// loadSettings 读取设置；兼容旧版（exePath 单字段时代）与损坏文件，
// 读不出有效 servers 一律回退默认值
export function loadSettings(): Settings {
  try {
    const raw = readFileSync(settingsPath(), 'utf8')
    const s = JSON.parse(raw) as { servers?: unknown }
    if (Array.isArray(s.servers)) {
      const servers: McpServerConfig[] = []
      for (const item of s.servers) {
        const c = item as Partial<McpServerConfig>
        if (
          typeof c.id === 'string' &&
          typeof c.label === 'string' &&
          typeof c.exePath === 'string' &&
          Array.isArray(c.args) &&
          c.args.every((a) => typeof a === 'string') &&
          typeof c.enabled === 'boolean'
        ) {
          servers.push({
            id: c.id,
            label: c.label,
            exePath: c.exePath,
            args: c.args as string[],
            cwd: typeof c.cwd === 'string' ? c.cwd : undefined,
            enabled: c.enabled
          })
        }
      }
      return { servers }
    }
    return defaultSettings()
  } catch {
    return defaultSettings()
  }
}

export function saveSettings(s: Settings): void {
  mkdirSync(settingsDir(), { recursive: true })
  writeFileSync(settingsPath(), JSON.stringify(s, null, 2), 'utf8')
}
