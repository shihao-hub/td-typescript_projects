import { useEffect, useState } from 'react'
import { bridge } from '@renderer/common/bridge'
import { useToast } from '@renderer/common/toast'
import type { McpServerConfig } from '@renderer/common/types'

// 设置：MCP server 连接配置（exe 路径 / 启动参数 / 启用开关）。
// 保存后由主进程断开旧连接，新配置在各模块访问时懒重连。

function parseArgs(s: string): string[] {
  return s
    .split(' ')
    .map((a) => a.trim())
    .filter((a) => a.length > 0)
}

export function SettingsModule(): React.JSX.Element {
  const toast = useToast()
  const [servers, setServers] = useState<McpServerConfig[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void (async () => {
      const s = await bridge.getSettings()
      setServers(s.servers)
      setLoaded(true)
    })()
  }, [])

  function update(id: string, patch: Partial<McpServerConfig>): void {
    setServers((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function addServer(template: 'clictl' | 'blank'): void {
    const preset: McpServerConfig =
      template === 'clictl'
        ? { id: 'clictl', label: 'clictl', exePath: '', args: ['mcp'], enabled: true }
        : { id: '', label: '', exePath: '', args: [], enabled: true }
    setServers((prev) => [...prev, preset])
  }

  function removeServer(id: string): void {
    setServers((prev) => prev.filter((s) => s.id !== id))
  }

  async function autoDetect(id: string): Promise<void> {
    const hit = await bridge.mcpDetect(id, `${id}.exe`)
    if (hit) {
      update(id, { exePath: hit })
      toast('success', `探测到 ${hit}`)
    } else {
      toast('error', '未探测到，请手动配置路径')
    }
  }

  async function save(): Promise<void> {
    const ids = new Set<string>()
    for (const s of servers) {
      if (!s.id.trim()) {
        toast('error', 'server id 不能为空')
        return
      }
      if (ids.has(s.id)) {
        toast('error', `server id 重复: ${s.id}`)
        return
      }
      ids.add(s.id)
    }
    const r = await bridge.setSettings(servers)
    if (r.ok) {
      toast('success', '已保存（连接已重置，切回模块页自动重连）')
    } else {
      toast('error', r.error?.message ?? '保存失败')
    }
  }

  if (!loaded) {
    return <div className="settings-module">加载中…</div>
  }

  return (
    <div className="settings-module">
      <h3>MCP server 连接</h3>
      <p className="settings-hint">
        每个 server 是一个支持 MCP stdio 的可执行文件（如 clictl.exe mcp）。
        保存后配置即时生效；新增工具由「重新发现」自动出现，无需改前端。
      </p>

      {servers.map((s) => (
        <fieldset key={s.id || `new-${servers.indexOf(s)}`} className="server-card">
          <div className="server-row">
            <label>
              id
              <input value={s.id} onChange={(e) => update(s.id, { id: e.target.value })} />
            </label>
            <label>
              显示名
              <input value={s.label} onChange={(e) => update(s.id, { label: e.target.value })} />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={(e) => update(s.id, { enabled: e.target.checked })}
              />
              启用
            </label>
          </div>
          <div className="server-row">
            <label className="grow">
              可执行文件
              <input
                value={s.exePath}
                placeholder="C:\path\to\clictl.exe"
                onChange={(e) => update(s.id, { exePath: e.target.value })}
              />
            </label>
            <button
              type="button"
              className="btn"
              onClick={() =>
                void bridge
                  .pickExe(s.exePath || undefined)
                  .then((p) => p && update(s.id, { exePath: p }))
              }
            >
              浏览…
            </button>
            <button type="button" className="btn" onClick={() => void autoDetect(s.id)}>
              自动探测
            </button>
          </div>
          <div className="server-row">
            <label className="grow">
              启动参数
              <input
                value={s.args.join(' ')}
                placeholder="mcp"
                onChange={(e) => update(s.id, { args: parseArgs(e.target.value) })}
              />
            </label>
            <button type="button" className="btn btn-danger" onClick={() => removeServer(s.id)}>
              移除
            </button>
          </div>
        </fieldset>
      ))}

      <div className="settings-actions">
        <button type="button" className="btn" onClick={() => addServer('clictl')}>
          添加 clictl
        </button>
        <button type="button" className="btn" onClick={() => addServer('blank')}>
          添加自定义 server
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void save()}>
          保存
        </button>
      </div>
    </div>
  )
}
