import { useState } from 'react'
import { useToast } from '@renderer/common/toast'

// JSON 树：递归渲染任意结构化结果（Inspector 式结果查看）。
// 只做基础能力：展开/收起、类型着色、计数摘要、复制 JSON、长文本截断。
// 折叠状态提升到树根（Map<JSON Pointer 路径, open>），默认展开 2 层，
// 提升是为了让工具栏「全部展开/全部收起」能触达每个节点。

const DEFAULT_OPEN_DEPTH = 2
const STR_TRUNCATE = 500

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isContainer(v: unknown): boolean {
  return Array.isArray(v) || isPlainObject(v)
}

// key 转义为 JSON Pointer 片段（RFC 6901：~ → ~0，/ → ~1），保证路径唯一
function escapeKey(k: string): string {
  return k.replace(/~/g, '~0').replace(/\//g, '~1')
}

// 递归收集全部容器节点的路径（根为空串），供全部展开/收起使用
function collectContainerPaths(v: unknown, base: string, out: string[]): void {
  if (Array.isArray(v)) {
    out.push(base)
    v.forEach((item, i) => collectContainerPaths(item, `${base}/${i}`, out))
  } else if (isPlainObject(v)) {
    out.push(base)
    for (const [k, val] of Object.entries(v)) {
      collectContainerPaths(val, `${base}/${escapeKey(k)}`, out)
    }
  }
}

// 长字符串：超长截断显示，点击本节点展开全文
function StringValue({ s }: { s: string }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  if (s.length <= STR_TRUNCATE) {
    return <span className="jt-string">{`"${s}"`}</span>
  }
  return (
    <span
      className={`jt-string jt-str-long ${expanded ? 'on' : ''}`}
      title={expanded ? '点击收起' : `点击展开（共 ${s.length} 字符）`}
      onClick={() => setExpanded(!expanded)}
    >
      {expanded ? `"${s}"` : `"${s.slice(0, STR_TRUNCATE)}"…`}
    </span>
  )
}

function ScalarValue({ v }: { v: unknown }): React.JSX.Element {
  if (v === null) return <span className="jt-null">null</span>
  if (v === undefined) return <span className="jt-null">undefined</span>
  if (typeof v === 'boolean') return <span className="jt-bool">{String(v)}</span>
  if (typeof v === 'number') return <span className="jt-number">{String(v)}</span>
  return <StringValue s={String(v)} />
}

// label：对象 key / 数组索引 / null（根节点）；asIndex 标记数组索引（样式更淡）
interface NodeProps {
  label: string | null
  asIndex?: boolean
  value: unknown
  path: string
  depth: number
  collapsed: ReadonlyMap<string, boolean>
  defaultDepth: number
  onToggle: (path: string, depth: number) => void
}

function JsonNode({
  label,
  asIndex,
  value,
  path,
  depth,
  collapsed,
  defaultDepth,
  onToggle
}: NodeProps): React.JSX.Element {
  const open = collapsed.get(path) ?? depth < defaultDepth
  const labelHtml = label !== null && (
    <span className={`jt-key ${asIndex ? 'jt-idx' : ''}`}>
      {label}
      <span className="jt-colon">: </span>
    </span>
  )

  if (!isContainer(value)) {
    return (
      <div className="jt-row jt-row-leaf">
        <span className="jt-arrow-sp" aria-hidden />
        {labelHtml}
        <span className="jt-value">
          <ScalarValue v={value} />
        </span>
      </div>
    )
  }

  const isArr = Array.isArray(value)
  const entries: Array<[string, unknown]> = isArr
    ? (value as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value as Record<string, unknown>)

  // 空容器：单行 {}/[]，不给折叠箭头
  if (entries.length === 0) {
    return (
      <div className="jt-row jt-row-leaf">
        <span className="jt-arrow-sp" aria-hidden />
        {labelHtml}
        <span className="jt-brace">{isArr ? '[]' : '{}'}</span>
      </div>
    )
  }

  return (
    <div className="jt-node">
      <div className="jt-row jt-row-branch" onClick={() => onToggle(path, depth)}>
        <span className={`jt-arrow ${open ? 'open' : ''}`} aria-hidden>
          ▶
        </span>
        {labelHtml}
        <span className="jt-brace">{isArr ? '[' : '{'}</span>
        {!open && (
          <>
            <span className="jt-dots">…</span>
            <span className="jt-brace">{isArr ? ']' : '}'}</span>
            <span className="jt-summary">
              {isArr ? `${entries.length} 项` : `${entries.length} 键`}
            </span>
          </>
        )}
      </div>
      {open && (
        <div className="jt-children">
          {entries.map(([k, v]) => (
            <JsonNode
              key={k}
              label={k}
              asIndex={isArr}
              value={v}
              path={isArr ? `${path}/${k}` : `${path}/${escapeKey(k)}`}
              depth={depth + 1}
              collapsed={collapsed}
              defaultDepth={defaultDepth}
              onToggle={onToggle}
            />
          ))}
          <div className="jt-row jt-close">
            <span className="jt-arrow-sp" aria-hidden />
            <span className="jt-brace">{isArr ? ']' : '}'}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// compact：表格单元格内嵌套值用——默认全收起、无工具栏、字号更小
export function JsonTree({
  data,
  compact = false
}: {
  data: unknown
  compact?: boolean
}): React.JSX.Element {
  const toast = useToast()
  const defaultDepth = compact ? 0 : DEFAULT_OPEN_DEPTH
  const [collapsed, setCollapsed] = useState<ReadonlyMap<string, boolean>>(() => new Map())

  function onToggle(path: string, depth: number): void {
    setCollapsed((prev) => {
      const next = new Map(prev)
      next.set(path, !(prev.get(path) ?? depth < defaultDepth))
      return next
    })
  }

  function setAll(open: boolean): void {
    const paths: string[] = []
    collectContainerPaths(data, '', paths)
    setCollapsed(new Map(paths.map((p) => [p, open])))
  }

  async function copyJson(): Promise<void> {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      toast('success', '已复制 JSON')
    } catch {
      toast('error', '复制失败（剪贴板不可用）')
    }
  }

  return (
    <div className={`jt-root ${compact ? 'jt-compact' : ''}`}>
      {!compact && (
        <div className="jt-toolbar">
          <button type="button" className="btn-link" onClick={() => setAll(true)}>
            全部展开
          </button>
          <button type="button" className="btn-link" onClick={() => setAll(false)}>
            全部收起
          </button>
          <button type="button" className="btn-link" onClick={() => void copyJson()}>
            复制 JSON
          </button>
        </div>
      )}
      <JsonNode
        label={null}
        value={data}
        path=""
        depth={0}
        collapsed={collapsed}
        defaultDepth={defaultDepth}
        onToggle={onToggle}
      />
    </div>
  )
}
