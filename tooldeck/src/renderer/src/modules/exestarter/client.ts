import { bridge } from '@renderer/common/bridge'
import type { CliExecResult, Entry } from '@renderer/common/types'

// 串行队列：CLI 每次进程级读写 config.json，并发写会互相覆盖，
// 所有写类命令强制串行（读命令不走队列）。
class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve()

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.tail.then(fn, fn)
    this.tail = p.catch(() => undefined)
    return p
  }
}

const writeQueue = new SerialQueue()

// CLI 路径状态：模块加载时 detect 一次，设置页保存后更新
let exePath: string | null = null

export function cliPath(): string | null {
  return exePath
}

export async function detectCli(explicit?: string): Promise<string | null> {
  exePath = await bridge.cliDetect(explicit)
  return exePath
}

export function setCliPath(p: string | null): void {
  exePath = p
}

function noCli(): CliExecResult<never> {
  return {
    ok: false,
    error: { code: 'no_cli', message: '未找到 exestarter.exe，请到设置页配置路径' },
    exitCode: -1
  }
}

async function exec<T>(args: string[], timeoutMs?: number): Promise<CliExecResult<T>> {
  if (!exePath) return noCli()
  return bridge.cliExec<T>(exePath, args, timeoutMs)
}

function write<T>(args: string[]): Promise<CliExecResult<T>> {
  if (!exePath) return Promise.resolve(noCli())
  return writeQueue.enqueue(() => exec<T>(args))
}

export interface ScanPreview {
  dir: string
  count: number
  exes: string[]
}

export type EntryResult = CliExecResult<Entry>

// exestarterClient：类型化命令封装
export const client = {
  async list(): Promise<CliExecResult<Entry[]>> {
    return exec<Entry[]>(['list'])
  },
  version(): Promise<CliExecResult<{ version: string }>> {
    return exec<{ version: string }>(['version'], 5000)
  },
  add(path: string): Promise<EntryResult> {
    return write<Entry>(['add', path])
  },
  remove(name: string): Promise<CliExecResult<{ removed: string; path: string }>> {
    return write<{ removed: string; path: string }>(['remove', name])
  },
  prune(): Promise<CliExecResult<{ removed: number; remaining: number }>> {
    return write<{ removed: number; remaining: number }>(['prune'])
  },
  scanPreview(dir: string, timeoutMs = 30000): Promise<CliExecResult<ScanPreview>> {
    return exec<ScanPreview>(['scan', '--dir', dir], timeoutMs)
  },
  tag(name: string, systag: string, usertag: string): Promise<EntryResult> {
    // 打标对话框确定时全量提交：空串 = 清除（Node spawn 可正常传空参）
    return write<Entry>(['tag', name, '--systag', systag, '--usertag', usertag])
  },
  updatePath(name: string, path: string): Promise<EntryResult> {
    return write<Entry>(['update', name, '--path', path])
  },
  open(name: string): Promise<CliExecResult<{ opened: string; selected: string }>> {
    return exec<{ opened: string; selected: string }>(['open', name], 8000)
  },
  shell(name: string): Promise<CliExecResult<{ shell: string; dir: string }>> {
    return exec<{ shell: string; dir: string }>(['shell', name], 8000)
  },
  // run 是前台透传命令，必须 detached 调用、不等退出码；
  // 调用前应先做 valid 预检降低 127 概率
  async run(name: string): Promise<{ ok: boolean; message?: string }> {
    if (!exePath) return { ok: false, message: noCli().error!.message }
    const r = await bridge.cliExecDetached(exePath, ['run', name])
    return r.ok ? { ok: true } : { ok: false, message: '启动 CLI 失败' }
  },
  pickExePath(defaultPath?: string): Promise<string | null> {
    return bridge.pickExe(defaultPath)
  },
  pickDirPath(defaultPath?: string): Promise<string | null> {
    return bridge.pickDir(defaultPath)
  }
}
