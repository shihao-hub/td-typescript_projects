import { useCallback, useEffect, useState } from 'react'
import { bridge } from '@renderer/common/bridge'
import type { McpTool, ServerEntry } from '@renderer/common/types'
import { ToolPanel } from './ToolPanel'

// 通用 server 模块（Inspector 式）：工具发现 → 左栏工具清单 + 右栏参数表单。
// 新 server / 新工具接入零前端代码：表单由 inputSchema 驱动，
// 结果由 structuredContent 结构分派（表格/树形/原始 JSON）。
// 打开过的工具面板保持挂载（hidden 切换可见性，不卸载），
// 切换回来时该工具的表单填写与执行结果原样保留。

const STATE_LABEL: Record<string, string> = {
  disconnected: '未连接',
  connecting: '连接中…',
  connected: '已连接',
  error: '连接异常'
}

export function GenericModule({ server }: { server: ServerEntry }): React.JSX.Element {
  const [tools, setTools] = useState<McpTool[]>([])
  const [toolsError, setToolsError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState('')
  // 打开过的工具名（按首次点击顺序）：每个工具一个独立 ToolPanel 实例
  const [opened, setOpened] = useState<string[]>([])

  function openTool(name: string): void {
    setSelected(name)
    setOpened((prev) => (prev.includes(name) ? prev : [...prev, name]))
  }

  const loadTools = useCallback(async () => {
    setLoading(true)
    setToolsError(null)
    const r = await bridge.mcpListTools(server.id)
    setLoading(false)
    if (!r.ok) {
      setTools([])
      setToolsError(r.error?.message ?? '工具发现失败')
      return
    }
    const sorted = [...(r.tools ?? [])].sort((a, b) => a.name.localeCompare(b.name))
    setTools(sorted)
    // 重新发现后丢弃已不存在的打开面板
    setOpened((prev) => prev.filter((n) => sorted.some((t) => t.name === n)))
  }, [server.id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时异步发现工具（setState 均在 await 之后）
    void loadTools()
  }, [loadTools])

  // 连接状态变化：error / disconnected 时清工具清单（下次视图激活会重连）
  useEffect(() => {
    return bridge.onMcpStatus((status) => {
      if (status.id !== server.id) return
      if (status.state === 'error' || status.state === 'disconnected') {
        setTools([])
        setToolsError(status.message ?? STATE_LABEL[status.state])
      }
      if (status.state === 'connected') {
        setToolsError(null)
      }
    })
  }, [server.id])

  const activeTool = tools.find((t) => t.name === selected)

  return (
    <div className="generic-module">
      <div className="generic-head">
        <span className={`conn-dot ${server.state.state}`} title={server.state.message ?? ''} />
        <span className="conn-text">
          {server.label} · {STATE_LABEL[server.state.state] ?? server.state.state}
          {server.state.message ? ` · ${server.state.message}` : ''}
        </span>
        <button type="button" className="btn" onClick={() => void loadTools()} disabled={loading}>
          重新发现
        </button>
      </div>

      <div className="generic-body">
        <aside className="generic-side">
          <div className="side-group">全部工具</div>
          {tools.map((t) => (
            <button
              key={t.name}
              type="button"
              className={`side-item ${selected === t.name ? 'active' : ''}`}
              title={t.description ?? ''}
              onClick={() => openTool(t.name)}
            >
              {t.name}
            </button>
          ))}
          {loading && <div className="side-hint">加载工具中…</div>}
          {toolsError && <div className="side-hint error">{toolsError}</div>}
          {!loading && !toolsError && tools.length === 0 && (
            <div className="side-hint">无工具（检查 server 是否支持 MCP）</div>
          )}
        </aside>

        <section className="generic-main">
          {opened.map((name) => {
            const tool = tools.find((t) => t.name === name)
            if (!tool) return null
            return (
              <div key={name} className="tool-pane" hidden={name !== selected}>
                <ToolPanel serverId={server.id} tool={tool} />
              </div>
            )
          })}
          {!activeTool && <div className="side-hint">选择左侧工具执行</div>}
        </section>
      </div>
    </div>
  )
}
