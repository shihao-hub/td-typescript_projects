import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

// 应用设置：目前只有 exestarter.exe 的显式路径。
// 落盘于 userData/settings.json（GUI 不读写 CLI 的 config.json，这是架构红线）。
export interface Settings {
  exePath: string
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): Settings {
  try {
    const raw = readFileSync(settingsPath(), 'utf8')
    const s = JSON.parse(raw) as { exePath?: unknown }
    return { exePath: typeof s.exePath === 'string' ? s.exePath : '' }
  } catch {
    return { exePath: '' }
  }
}

export function saveSettings(s: Settings): void {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  writeFileSync(settingsPath(), JSON.stringify(s, null, 2), 'utf8')
}
