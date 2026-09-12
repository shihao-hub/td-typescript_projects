import { useCallback, useEffect, useState } from 'react'
import { bridge } from '@renderer/common/bridge'
import { useToast } from '@renderer/common/toast'
import { client, detectCli, setCliPath } from '../exestarter/client'

// 设置面板：exestarter.exe 路径输入 + 自动探测 + 当前 CLI 版本回显
export function SettingsModule(): React.JSX.Element {
  const toast = useToast()
  const [exePath, setExePath] = useState('')
  const [version, setVersion] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    bridge.getSettings().then((s) => setExePath(s.exePath))
  }, [])

  const refreshVersion = useCallback(async (path: string): Promise<void> => {
    setVersion(null)
    if (!path) return
    setCliPath(path)
    const r = await client.version()
    setVersion(r.ok ? (r.data?.version ?? '?') : `${r.error?.code}: ${r.error?.message}`)
  }, [])

  const detect = async (): Promise<void> => {
    setBusy(true)
    try {
      const found = await detectCli()
      if (found) {
        setExePath(found)
        await refreshVersion(found)
        toast('success', `已探测到: ${found}`)
      } else {
        toast('error', '自动探测未找到 exestarter.exe')
      }
    } finally {
      setBusy(false)
    }
  }

  const save = async (): Promise<void> => {
    setBusy(true)
    try {
      const trimmed = exePath.trim()
      await bridge.setSettings(trimmed)
      setCliPath(trimmed || null)
      await refreshVersion(trimmed)
      toast('success', '设置已保存')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-card">
        <h3>exestarter CLI</h3>
        <div className="settings-row">
          <input
            className="input"
            value={exePath}
            onChange={(e) => setExePath(e.target.value)}
            placeholder="C:\path\to\exestarter.exe"
            spellCheck={false}
          />
          <button className="btn" disabled={busy} onClick={() => void detect()}>
            自动探测
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => bridge.pickExe().then((p) => p && setExePath(p))}
          >
            浏览…
          </button>
        </div>
        <div className="settings-hint">
          探测顺序（dev）：显式配置 &gt; 开发目录（go_projects/exestarter）&gt; PATH；
          <br />
          探测顺序（打包后）：显式配置 &gt; tooldeck.exe 同级 bin 目录 &gt; PATH。
          <br />
          portable 分发时把 exestarter.exe 放进 bin\ 即可自动探测。
        </div>
        <div className="settings-row">
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            保存
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => void refreshVersion(exePath.trim())}
          >
            查询版本
          </button>
          <span className="settings-hint">{version ? `CLI 版本: ${version}` : '版本未查询'}</span>
        </div>
      </div>
    </div>
  )
}
