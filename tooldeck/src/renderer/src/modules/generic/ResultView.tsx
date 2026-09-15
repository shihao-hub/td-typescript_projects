import { useState } from 'react'
import type { CallOutcome } from '@renderer/common/types'
import { JsonTree } from './JsonTree'

// 动态结果渲染：智能默认 + 手动切换。
//   非空对象数组（或单键对象包裹的对象数组，如 { tools: [...] }）→ 默认表格；
//   其余 → 默认树形（JsonTree）；原始 JSON 始终保留一个入口兜底调试。
//   structuredContent 缺失时退回 content 文本（此场景无切换条）。

type ViewKind = 'table' | 'tree' | 'raw'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isObjectArray(v: unknown): v is Record<string, unknown>[] {
  return Array.isArray(v) && v.length > 0 && v.every(isPlainObject)
}

// 表格行提取：顶层对象数组，或单键对象包裹的对象数组（如 clictl.list 的 { tools: [...] }）
function extractTableRows(data: unknown): Record<string, unknown>[] | null {
  if (isObjectArray(data)) return data
  if (isPlainObject(data) && Object.keys(data).length === 1) {
    const only = Object.values(data)[0]
    if (isObjectArray(only)) return only
  }
  return null
}

function renderScalar(v: unknown): string {
  if (v === null) return 'null'
  if (v === undefined) return '(缺失)'
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

function renderCell(v: unknown): React.JSX.Element {
  if (v === null || v === undefined) return <span className="cell-empty">—</span>
  if (Array.isArray(v) || isPlainObject(v)) {
    // 嵌套值内联紧凑树（默认全收起），不再是 details + 纯文本 JSON
    return <JsonTree data={v} compact />
  }
  return <span className="cell-scalar">{renderScalar(v)}</span>
}

function TableView({ rows }: { rows: Record<string, unknown>[] }): React.JSX.Element {
  // 列 = 全部行 key 的并集（首个出现的顺序优先）
  const cols: string[] = []
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!cols.includes(k)) cols.push(k)
    }
  }
  return (
    <table className="result-table">
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {cols.map((c) => (
              <td key={c}>{renderCell(row[c])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// 结构化结果主体（含视图切换条）。切换状态在组件内，
// 新一次调用时 ResultView 会卸载重挂（ToolPanel 先 setOutcome(null)），智能默认重新判定。
function StructuredResult({ outcome }: { outcome: CallOutcome }): React.JSX.Element {
  const data = outcome.structuredContent
  const tableRows = extractTableRows(data)
  const canTable = tableRows !== null
  const [view, setView] = useState<ViewKind>(() => (canTable ? 'table' : 'tree'))

  const errorText = outcome.isError
    ? (outcome.content?.find((c) => c.type === 'text' && c.text)?.text ?? '工具执行失败')
    : null

  return (
    <div className="result">
      {errorText && <div className="result-iserror">{errorText}</div>}
      <div className="view-switch">
        <button
          type="button"
          className={view === 'table' ? 'active' : ''}
          disabled={!canTable}
          onClick={() => setView('table')}
        >
          表格
        </button>
        <button
          type="button"
          className={view === 'tree' ? 'active' : ''}
          onClick={() => setView('tree')}
        >
          树形
        </button>
        <button
          type="button"
          className={view === 'raw' ? 'active' : ''}
          onClick={() => setView('raw')}
        >
          原始 JSON
        </button>
      </div>
      {view === 'table' && tableRows && <TableView rows={tableRows} />}
      {view === 'tree' && <JsonTree data={data} />}
      {view === 'raw' && <pre className="result-text">{JSON.stringify(outcome, null, 2)}</pre>}
    </div>
  )
}

export function ResultView({ outcome }: { outcome: CallOutcome }): React.JSX.Element {
  // 协议级/传输级失败：无任何结果可展示
  if (!outcome.ok) {
    return <div className="result result-error">{outcome.error?.message ?? '调用失败'}</div>
  }

  if (outcome.structuredContent === undefined) {
    const text = outcome.content
      ?.filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text)
      .join('\n')
    return (
      <div className="result">
        {outcome.isError && (
          <div className="result-iserror">
            {outcome.content?.find((c) => c.type === 'text' && c.text)?.text ?? '工具执行失败'}
          </div>
        )}
        {text && <pre className="result-text">{text}</pre>}
      </div>
    )
  }

  return <StructuredResult outcome={outcome} />
}
