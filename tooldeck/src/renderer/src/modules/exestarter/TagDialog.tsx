import { useEffect, useState } from 'react'
import { SYS_TAGS, type Entry } from '@renderer/common/types'

interface TagDialogProps {
  entry: Entry
  onCancel: () => void
  onSubmit: (systag: string, usertag: string) => void
}

// 打标对话框：系统标签四选一（含「无」）+ 用户标签文本 → 确定全量提交（空 = 清除）
export function TagDialog(p: TagDialogProps): React.JSX.Element {
  const [systag, setSystag] = useState(p.entry.sys_tag ?? '')
  const [usertag, setUsertag] = useState(p.entry.user_tag ?? '')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') p.onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="modal-mask" onClick={p.onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">设置标签 — {p.entry.name}</div>
        <div className="modal-body">
          <div className="field">
            <label>系统标签（选「无」= 清除）</label>
            <div className="radio-row">
              <button
                type="button"
                className={`radio-chip ${systag === '' ? 'on' : ''}`}
                onClick={() => setSystag('')}
              >
                无
              </button>
              {SYS_TAGS.map((t) => (
                <button
                  type="button"
                  key={t.key}
                  className={`radio-chip ${systag === t.key ? 'on' : ''}`}
                  onClick={() => setSystag(t.key)}
                >
                  <span className="tag-dot" style={{ background: t.color }} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>用户标签（自由文本，清空 = 清除）</label>
            <input
              className="input"
              value={usertag}
              onChange={(e) => setUsertag(e.target.value)}
              placeholder="如：常用 / 临时 / 客户A"
              autoFocus
            />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={p.onCancel}>
            取消
          </button>
          <button className="btn btn-primary" onClick={() => p.onSubmit(systag, usertag.trim())}>
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
