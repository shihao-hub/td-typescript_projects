import type { Entry } from '@renderer/common/types'

interface ToolbarProps {
  selected: Entry | null
  invalidCount: number
  onAdd: () => void
  onScan: () => void
  onTag: () => void
  onUpdatePath: () => void
  onLaunch: () => void
  onLocate: () => void
  onTerminal: () => void
  onRemove: () => void
  onPrune: () => void
}

// 工具栏：添加/扫描导入/打标/改路径 | 启动/定位/开终端 | 删除/清理失效
// 选中态驱动可用性（添加/扫描/清理除外）
export function Toolbar(p: ToolbarProps): React.JSX.Element {
  const has = p.selected !== null
  return (
    <div className="toolbar">
      <button className="btn" onClick={p.onAdd}>
        添加
      </button>
      <button className="btn" onClick={p.onScan}>
        扫描导入
      </button>
      <button className="btn" disabled={!has} onClick={p.onTag}>
        打标
      </button>
      <button className="btn" disabled={!has} onClick={p.onUpdatePath}>
        改路径
      </button>
      <span className="toolbar-sep" />
      <button className="btn" disabled={!has} onClick={p.onLaunch}>
        启动
      </button>
      <button className="btn" disabled={!has} onClick={p.onLocate}>
        定位
      </button>
      <button className="btn" disabled={!has} onClick={p.onTerminal}>
        开终端
      </button>
      <span className="toolbar-sep" />
      <button className="btn btn-danger" disabled={!has} onClick={p.onRemove}>
        删除
      </button>
      <button className="btn" onClick={p.onPrune}>
        清理失效{p.invalidCount > 0 ? ` (${p.invalidCount})` : ''}
      </button>
    </div>
  )
}
