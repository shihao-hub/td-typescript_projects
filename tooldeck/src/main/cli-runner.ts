import { spawn } from 'node:child_process'

export interface CliErrorShape {
  code: string
  message: string
}

// 与渲染层 common/types.ts 的 CliExecResult 对应：ok=true 时带 data，否则带 error
export interface CliExecResult<T = unknown> {
  ok: boolean
  data?: T
  error?: CliErrorShape
  exitCode: number
}

const DEFAULT_TIMEOUT_MS = 15000

function fail(code: string, message: string, exitCode = -1): CliExecResult {
  return { ok: false, error: { code, message }, exitCode }
}

// runCli：spawn CLI 子进程，收集 stdout 并按 JSON 包络解析。
// 任何失败（spawn 失败 / 超时 / stdout 非法 JSON）都返回结构化错误，绝不 reject。
export function runCli(
  exePath: string,
  args: string[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<CliExecResult> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(exePath, args, { windowsHide: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      resolve(fail('spawn_error', `启动 CLI 失败: ${message}`))
      return
    }

    let stdout = ''
    let stderr = ''
    let settled = false

    const settle = (result: CliExecResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    const timer = setTimeout(() => {
      child.kill()
      settle(fail('timeout', `CLI 执行超时（${timeoutMs}ms）: ${exePath}`))
    }, timeoutMs)

    child.on('error', (err) => {
      settle(fail('spawn_error', `CLI 无法启动: ${err.message}`))
    })
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('close', (code) => {
      const exitCode = code ?? -1
      let parsed: unknown
      try {
        parsed = JSON.parse(stdout.trim())
      } catch {
        const hint = stderr.trim() || stdout.trim().slice(0, 200) || '(空输出)'
        settle(fail('bad_envelope', `CLI 输出不是合法 JSON: ${hint}`, exitCode))
        return
      }
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'ok' in parsed &&
        (parsed as { ok: unknown }).ok === true &&
        'data' in parsed
      ) {
        settle({ ok: true, data: (parsed as { data: unknown }).data, exitCode })
        return
      }
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'ok' in parsed &&
        (parsed as { ok: unknown }).ok === false &&
        'error' in parsed
      ) {
        const e = (parsed as { error: { code?: unknown; message?: unknown } }).error
        settle(
          fail(
            typeof e?.code === 'string' ? e.code : 'internal',
            typeof e?.message === 'string' ? e.message : 'CLI 返回未知错误',
            exitCode
          )
        )
        return
      }
      settle(fail('bad_envelope', 'CLI 输出不是合法包络 JSON', exitCode))
    })
  })
}

// spawnDetached：run 等透传命令用——detached 启动、不等退出码、立即返回。
export function spawnDetached(exePath: string, args: string[]): boolean {
  try {
    const child = spawn(exePath, args, { detached: true, stdio: 'ignore', windowsHide: false })
    child.unref()
    return true
  } catch {
    return false
  }
}
