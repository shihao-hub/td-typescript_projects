import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { McpServerConfig } from '../settings'

// MCP 连接管理器：为每个配置的 server 维护一条 stdio 连接
// （spawn 子进程 + 官方 TS SDK Client）。渲染层经 IPC 白名单访问，
// 不直接接触进程与协议。

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ServerStatus {
  id: string
  state: ConnectionState
  message?: string // error / connecting 阶段的人类可读说明
}

export interface McpToolInfo {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  annotations?: Record<string, unknown>
}

export interface CallOutcome {
  ok: boolean
  isError?: boolean // 工具级失败（IsError，结果仍可能含 structuredContent）
  structuredContent?: unknown
  content?: Array<{ type: string; text?: string }>
  error?: { message: string } // 协议级/传输级失败
}

interface Connection {
  client: Client
  transport: StdioClientTransport
}

interface PendingCall {
  controller: AbortController
}

type StatusListener = (status: ServerStatus) => void

export class McpManager {
  private connections = new Map<string, Connection>()
  private states = new Map<string, ServerStatus>()
  private pending = new Map<string, PendingCall>()
  private listeners = new Set<StatusListener>()

  onStatus(fn: StatusListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private setStatus(id: string, state: ConnectionState, message?: string): void {
    const status: ServerStatus = { id, state, message }
    this.states.set(id, status)
    for (const fn of this.listeners) fn(status)
  }

  status(id: string): ServerStatus {
    return this.states.get(id) ?? { id, state: 'disconnected' }
  }

  // ensureConnected：懒连接（首次 listTools/call 时启动 server 进程）
  async ensureConnected(config: McpServerConfig): Promise<Connection> {
    const existing = this.connections.get(config.id)
    if (existing) return existing

    this.setStatus(config.id, 'connecting', `正在启动 ${config.exePath}`)
    const client = new Client({ name: 'tooldeck', version: '0.2.0' })
    const transport = new StdioClientTransport({
      command: config.exePath,
      args: config.args,
      cwd: config.cwd,
      stderr: 'pipe' // server 日志收进管道转发到 tooldeck 主进程日志，不泄漏到控制台
    })
    transport.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString('utf8').trim()
      if (line) console.log(`[mcp:${config.id}] ${line}`)
    })

    try {
      await client.connect(transport)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.setStatus(config.id, 'error', `连接失败: ${message}`)
      throw err
    }

    const conn: Connection = { client, transport }
    this.connections.set(config.id, conn)
    transport.onclose = () => {
      // server 退出（崩溃/被外部杀死）：清理并通知渲染层
      this.connections.delete(config.id)
      this.setStatus(config.id, 'disconnected', 'server 已退出')
    }
    this.setStatus(config.id, 'connected')
    return conn
  }

  async disconnect(id: string): Promise<void> {
    const conn = this.connections.get(id)
    if (!conn) return
    this.connections.delete(id)
    try {
      await conn.client.close()
    } catch {
      // close 失败不阻塞：transport 断开即子进程退出
    }
    this.setStatus(id, 'disconnected')
  }

  async listTools(config: McpServerConfig): Promise<McpToolInfo[]> {
    const { client } = await this.ensureConnected(config)
    try {
      const res = await client.listTools()
      this.setStatus(config.id, 'connected')
      return res.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown> | undefined,
        outputSchema: (t as { outputSchema?: unknown }).outputSchema as
          Record<string, unknown> | undefined,
        annotations: t.annotations as Record<string, unknown> | undefined
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.setStatus(config.id, 'error', `tools/list 失败: ${message}`)
      // 连接可能已坏：丢弃待重连
      await this.disconnect(config.id)
      throw err
    }
  }

  // call：调用工具。callId 由渲染层生成，用于取消。
  // 绝不 reject——一切失败都折叠为 CallOutcome，渲染层统一展示。
  async call(
    config: McpServerConfig,
    callId: string,
    tool: string,
    args: Record<string, unknown>
  ): Promise<CallOutcome> {
    let conn: Connection
    try {
      conn = await this.ensureConnected(config)
    } catch (err) {
      return {
        ok: false,
        error: { message: err instanceof Error ? err.message : String(err) }
      }
    }

    const controller = new AbortController()
    this.pending.set(callId, { controller })
    try {
      const res = await conn.client.callTool({ name: tool, arguments: args }, undefined, {
        signal: controller.signal
      })
      return {
        ok: true,
        isError: res.isError === true,
        structuredContent: res.structuredContent,
        content: res.content as Array<{ type: string; text?: string }>
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const cancelled = controller.signal.aborted
      if (!cancelled) {
        // 传输级失败大概率是连接坏了：标记并丢弃待重连
        this.setStatus(config.id, 'error', `调用失败: ${message}`)
        await this.disconnect(config.id)
      }
      return {
        ok: false,
        error: { message: cancelled ? '已取消' : message }
      }
    } finally {
      this.pending.delete(callId)
    }
  }

  cancel(callId: string): boolean {
    const p = this.pending.get(callId)
    if (!p) return false
    p.controller.abort()
    return true
  }

  // shutdown：应用退出时清理全部子进程
  async shutdown(): Promise<void> {
    await Promise.allSettled([...this.connections.keys()].map((id) => this.disconnect(id)))
  }
}
