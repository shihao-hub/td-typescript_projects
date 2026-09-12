import { SYS_TAGS } from '@renderer/common/types'

interface StatusBarProps {
  total: number
  valid: number
  invalid: number
  byTag: Record<string, number>
}

// 状态栏：总数 / 有效 / 失效 / 各系统标签计数
export function StatusBar(p: StatusBarProps): React.JSX.Element {
  return (
    <div className="statusbar">
      <span>总数 {p.total}</span>
      <span>有效 {p.valid}</span>
      <span>失效 {p.invalid}</span>
      {SYS_TAGS.map((t) =>
        p.byTag[t.key] ? (
          <span key={t.key}>
            <span className="stat-dot" style={{ background: t.color }} />
            {t.label} {p.byTag[t.key]}
          </span>
        ) : null
      )}
    </div>
  )
}
