import { existsSync } from 'node:fs'
import { join, dirname, isAbsolute } from 'node:path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

// 探测日志：主进程 console，dev 下直接打到 electron-vite 终端
function log(msg: string): void {
  console.log(`[tooldeck][detect] ${msg}`)
}

// fromPath：直接扫描 PATH 环境变量找目标 exe。
// 不用 where.exe 子进程——它的中文失败消息是 GBK 编码，会以乱码泄漏到开发控制台。
function fromPath(exeName: string): string | null {
  const pathVar = process.env.PATH ?? ''
  for (const dir of pathVar.split(';')) {
    const d = dir.trim().replace(/^"|"$/g, '')
    if (!d || !isAbsolute(d)) continue
    const candidate = join(d, exeName)
    if (existsSync(candidate)) return candidate
  }
  return null
}

// fromDevCandidates：仅 dev 环境。从 app 路径逐级向上找 go_projects/<project>/<exeName>
function fromDevCandidates(projectDir: string, exeName: string): string | null {
  let dir = app.getAppPath()
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'go_projects', projectDir, exeName)
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
function fromAppBin(exeName: string): string | null {
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || dirname(app.getPath('exe'))
  const candidate = join(exeDir, 'bin', exeName)
  return existsSync(candidate) ? candidate : null
}

// detectServerExe 探测 MCP server 可执行文件（每步打印日志）：
//   dev：  开发目录（向上找 go_projects/<project>）> PATH
//   prod： exe 同级 bin 目录 > PATH
// 找不到返回 null（UI 引导用户到设置页手动配置）。
export function detectServerExe(projectDir: string, exeName: string): string | null {
  const dev = is.dev
  log(`探测 ${exeName}（模式=${dev ? 'dev' : '生产'}）`)

  if (dev) {
    const devHit = fromDevCandidates(projectDir, exeName)
    if (devHit) {
      log(`开发目录命中 -> ${devHit}`)
      return devHit
    }
    log(`开发目录未命中（app 路径向上未找到 go_projects/${projectDir}/${exeName}）`)
  } else {
    const binHit = fromAppBin(exeName)
    if (binHit) {
      log(`exe 同级 bin 目录命中 -> ${binHit}`)
      return binHit
    }
    const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || dirname(app.getPath('exe'))
    log(`exe 同级 bin 目录未命中（${join(exeDir, 'bin')} 不存在 ${exeName}）`)
  }

  const pathHit = fromPath(exeName)
  if (pathHit) {
    log(`PATH 命中 -> ${pathHit}`)
    return pathHit
  }
  log('PATH 未命中')

  log(`探测失败：所有来源均未找到 ${exeName}，请到设置页手动配置`)
  return null
}
