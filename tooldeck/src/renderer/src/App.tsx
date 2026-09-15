import { useCallback, useEffect, useState } from 'react'
import { ToastProvider } from './common/toast'
import { ConfirmProvider } from './common/confirm'
import { bridge } from './common/bridge'
import type { ServerEntry } from './common/types'
import { GenericModule } from './modules/generic/GenericModule'
import { SettingsModule } from './modules/settings/SettingsModule'

// 应用壳：左侧导航 = 已启用的 MCP server + 设置。
// server 列表来自设置（动态），每个 server 进入通用模块（工具面板 / CRUD）。

export function App(): React.JSX.Element {
  const [servers, setServers] = useState<ServerEntry[]>([])
  const [active, setActive] = useState<string>('')

  const loadServers = useCallback(async () => {
    const list = await bridge.mcpServers()
    setServers(list)
    // 当前选中被禁用时回退到第一个可用 server
    setActive((cur) => {
      const stillOk = list.some((s) => s.id === cur && s.enabled)
      if (stillOk) return cur
      return list.find((s) => s.enabled)?.id ?? ''
    })
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时异步拉取 server 列表（setState 均在 await 之后）
    void loadServers()
    return bridge.onMcpStatus(() => void loadServers())
  }, [loadServers])

  const enabled = servers.filter((s) => s.enabled)
  const activeServer = enabled.find((s) => s.id === active)

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="app">
          <nav className="nav">
            <div className="nav-title">tooldeck</div>
            {enabled.map((s) => (
              <button
                key={s.id}
                className={`nav-item ${active === s.id ? 'active' : ''}`}
                onClick={() => setActive(s.id)}
              >
                {s.label}
                <span
                  className={`conn-dot inline ${s.state.state}`}
                  title={s.state.message ?? ''}
                />
              </button>
            ))}
            {enabled.length === 0 && (
              <button className="nav-item pending" onClick={() => setActive('settings')}>
                暂无 server
                <span className="nav-badge">去设置</span>
              </button>
            )}
            <div className="nav-spacer" />
            <button
              className={`nav-item ${active === 'settings' ? 'active' : ''}`}
              onClick={() => setActive('settings')}
            >
              设置
            </button>
          </nav>
          <main className="main">
            {active === 'settings' || !activeServer ? (
              <SettingsModule />
            ) : (
              <GenericModule key={activeServer.id} server={activeServer} />
            )}
          </main>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  )
}

export default App
