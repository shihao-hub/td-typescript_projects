import { useEffect, useState } from 'react'

interface ScanImportDialogProps {
  dir: string
  exes: string[]
  onCancel: () => void
  onConfirm: (selected: string[]) => void
}

function baseName(p: string): string {
  const i = p.lastIndexOf('\\')
  return i >= 0 ? p.slice(i + 1) : p
}

// 扫描导入：预览列表 + 勾选 → 串行注册（注册动作由父组件执行）
export function ScanImportDialog(p: ScanImportDialogProps): React.JSX.Element {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(p.exes))
  const allOn = checked.size === p.exes.length

  const toggle = (path: string): void => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') p.onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="modal-mask" onClick={p.onCancel}>
      <div className="modal" style={{ minWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">扫描导入 — {p.exes.length} 个 exe</div>
        <div className="modal-body">
          <div className="settings-hint" style={{ marginBottom: 8 }}>
            目录: {p.dir}（已存在的路径注册时会自动跳过）
          </div>
          <div className="field">
            <label>
              <a
                role="button"
                style={{ color: '#1f6feb', cursor: 'pointer' }}
                onClick={() => setChecked(allOn ? new Set() : new Set(p.exes))}
              >
                {allOn ? '全不选' : '全选'}
              </a>
            </label>
            <div className="check-list">
              {p.exes.map((path) => (
                <label key={path} className="check-item">
                  <input
                    type="checkbox"
                    checked={checked.has(path)}
                    onChange={() => toggle(path)}
                  />
                  <span>{baseName(path)}</span>
                  <span className="p" title={path}>
                    {path}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <span style={{ marginRight: 'auto', color: '#57606a' }}>已选 {checked.size} 项</span>
          <button className="btn" onClick={p.onCancel}>
            取消
          </button>
          <button
            className="btn btn-primary"
            disabled={checked.size === 0}
            onClick={() => p.onConfirm([...checked])}
          >
            导入所选
          </button>
        </div>
      </div>
    </div>
  )
}
