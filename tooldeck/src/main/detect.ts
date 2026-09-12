import { existsSync } from 'node:fs'
import { join, dirname, isAbsolute } from 'node:path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { loadSettings } from './settings'

// 探测日志：主进程 console，dev 下直接打到 electron-vite 终端
function log(msg: string): void {
  console.log(`[tooldeck][cli-detect] ${msg}`)
}

// fromPath：直接扫描 PATH 环境变量找 exestarter.exe。
// 不用 where.exe 子进程——它的中文失败消息是 GBK 编码，会以乱码泄漏到开发控制台。
function fromPath(): string | null {
  const pathVar = process.env.PATH ?? ''
  for (const dir of pathVar.split(';')) {
    const d = dir.trim().replace(/^"|"$/g, '')
    if (!d || !isAbsolute(d)) continue
    const candidate = join(d, 'exestarter.exe')
    if (existsSync(candidate)) return candidate
  }
  return null
}

// fromDevCandidates：仅 dev 环境。从 app 路径逐级向上找 go_projects/exestarter/exestarter.exe
function fromDevCandidates(): string | null {
  let dir = app.getAppPath()
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'go_projects', 'exestarter', 'exestarter.exe')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

// fromAppBin：仅生产环境。tooldeck.exe 所在目录的 bin 子目录。
// portable 打包形态运行时自解压到临时目录，app.getPath('exe') 指向解压目录，
// 必须用 electron-builder 注入的 PORTABLE_EXECUTABLE_DIR 才能拿到用户手里的原始位置；
// 非 portable（unpack / 安装版）两者一致，退回 getPath('exe') 即可。
function fromAppBin(): string | null {
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || dirname(app.getPath('exe'))
  const candidate = join(exeDir, 'bin', 'exestarter.exe')
  return existsSync(candidate) ? candidate : null
}

// detectCliPath 探测顺序（按环境分流，每步打印日志）：
//   dev：  显式配置 > 开发目录（向上找 go_projects）> PATH
//   prod： 显式配置 > exe 同级 bin 目录 > PATH
// 全部失败返回 null（渲染层会显示引导卡片，让用户去设置页手配）。
export function detectCliPath(explicit?: string): string | null {
  const dev = is.dev
  log(`开始探测（模式=${dev ? 'dev' : '生产'}）`)

  // ① 显式配置：调用参数 > 已保存设置
  const saved = loadSettings().exePath || null
  const explicitPath = explicit?.trim() || null
  if (explicitPath && existsSync(explicitPath)) {
    log(`显式配置命中 -> ${explicitPath}`)
    return explicitPath
  }
  if (saved && existsSync(saved)) {
    log(`已保存设置命中 -> ${saved}`)
    return saved
  }
  log(`显式配置未命中（参数=${explicitPath ?? '无'}，已保存=${saved ?? '无'}）`)

  // ② 环境专属分支
  if (dev) {
    const devHit = fromDevCandidates()
    if (devHit) {
      log(`开发目录命中 -> ${devHit}`)
      return devHit
    }
    log('开发目录未命中（app 路径向上未找到 go_projects/exestarter/exestarter.exe）')
  } else {
    const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || dirname(app.getPath('exe'))
    const binHit = fromAppBin()
    if (binHit) {
      log(`exe 同级 bin 目录命中 -> ${binHit}`)
      return binHit
    }
    log(`exe 同级 bin 目录未命中（${join(exeDir, 'bin')} 不存在 exestarter.exe）`)
  }

  // ③ PATH 兜底
  const pathHit = fromPath()
  if (pathHit) {
    log(`PATH 命中 -> ${pathHit}`)
    return pathHit
  }
  log('PATH 未命中')

  log('探测失败：所有来源均未找到 exestarter.exe，请到设置页手动配置路径')
  return null
}
