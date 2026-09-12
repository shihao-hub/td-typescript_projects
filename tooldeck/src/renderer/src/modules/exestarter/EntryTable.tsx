import { useEffect, useRef, useState } from 'react'
import { sysTagMeta, type Entry } from '@renderer/common/types'

interface TableCommands {
  launch: (e: Entry) => void
  locate: (e: Entry) => void
  terminal: (e: Entry) => void
  tag: (e: Entry) => void
  updatePath: (e: Entry) => void
  remove: (e: Entry) => void
}

interface EntryTableProps {
  entries: Entry[] | null
  filtered: Entry[]
  loadError: string | null
  selectedName: string | null
  onSelect: (name: string) => void
  onDoubleClick: (e: Entry) => void
  commands: TableCommands
}

interface CtxMenuState {
  x: number
  y: number
  entry: Entry
}

// 条目表格：双击 = 启动；右键菜单与工具栏共用命令；失效行红字
export function EntryTable(p: EntryTableProps): React.JSX.Element {
  const [menu, setMenu] = useState<CtxMenuState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  const run = (fn: (e: Entry) => void): void => {
    if (menu) fn(menu.entry)
    setMenu(null)
  }

  let body: React.JSX.Element
  if (p.entries === null) {
    body = (
      <tbody>
        <tr>
          <td colSpan={4} className="empty-hint">
            加载中…
          </td>
        </tr>
      </tbody>
    )
  } else if (p.loadError) {
    body = (
      <tbody>
        <tr>
          <td colSpan={4} className="empty-hint">
            加载失败: {p.loadError}
          </td>
        </tr>
      </tbody>
    )
  } else if (p.filtered.length === 0) {
    body = (
      <tbody>
        <tr>
          <td colSpan={4} className="empty-hint">
            {p.entries.length === 0
              ? '暂无条目，点击「添加」或「扫描导入」注册 exe'
              : '无符合筛选条件的条目'}
          </td>
        </tr>
      </tbody>
    )
  } else {
    body = (
      <tbody>
        {p.filtered.map((e) => {
          const meta = sysTagMeta(e.sys_tag)
          return (
            <tr
              key={e.path}
              className={`${e.valid ? '' : 'invalid'} ${e.name === p.selectedName ? 'selected' : ''}`}
              onClick={() => p.onSelect(e.name)}
              onDoubleClick={() => p.onDoubleClick(e)}
              onContextMenu={(ev) => {
                ev.preventDefault()
                p.onSelect(e.name)
                setMenu({ x: ev.clientX, y: ev.clientY, entry: e })
              }}
            >
              <td className="col-name">{e.name}</td>
              <td className="col-path" title={`${e.valid ? '' : '已失效: '}${e.path}`}>
                {e.path}
              </td>
              <td className="col-tags">
                {meta && (
                  <>
                    <span className="tag-dot" style={{ background: meta.color }} />
                    {meta.label}
                  </>
                )}
                {e.user_tag && <span className="tag-user">{e.user_tag}</span>}
              </td>
              <td className="col-added">
                {e.added_at}
                {e.valid ? '' : ' · 已失效'}
              </td>
            </tr>
          )
        })}
      </tbody>
    )
  }

  return (
    <>
      <div className="table-wrap">
        <table className="entries">
          <thead>
            <tr>
              <th style={{ width: '22%' }}>名称</th>
              <th>路径</th>
              <th style={{ width: '18%' }}>标签</th>
              <th style={{ width: '15%' }}>添加时间</th>
            </tr>
          </thead>
          {body}
        </table>
      </div>
      {menu && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} ref={menuRef}>
          <button className="ctx-item" onClick={() => run(p.commands.launch)}>
            启动
          </button>
          <button className="ctx-item" onClick={() => run(p.commands.locate)}>
            资源管理器定位
          </button>
          <button className="ctx-item" onClick={() => run(p.commands.terminal)}>
            在此目录开 PowerShell
          </button>
          <div className="ctx-sep" />
          <button className="ctx-item" onClick={() => run(p.commands.tag)}>
            设置标签…
          </button>
          <button className="ctx-item" onClick={() => run(p.commands.updatePath)}>
            改路径…
          </button>
          <div className="ctx-sep" />
          <button className="ctx-item danger" onClick={() => run(p.commands.remove)}>
            删除…
          </button>
        </div>
      )}
    </>
  )
}
