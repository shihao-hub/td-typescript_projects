/* eslint-disable @typescript-eslint/no-explicit-any -- RJSF 的 formData/onChange 泛型以 any 传递 */
import { useMemo, useState } from 'react'
import Form from '@rjsf/core/lib/components/Form.js'
import validator from '@rjsf/validator-cfworker'
import { bridge, newCallId } from '@renderer/common/bridge'
import type { CallOutcome, McpTool } from '@renderer/common/types'
import { ResultView } from './ResultView'

// 工具面板：按 inputSchema 动态生成参数表单（RJSF + cfworker 校验器，
// 无 eval、兼容 CSP），执行 → 取消 → 结果区。
// CRUD 动作复用本面板：initialFormData 预填行绑定字段，lockedFields 锁只读，
// schemaOverride 收敛编辑表单。

interface ToolPanelProps {
  serverId: string
  tool: McpTool
  schemaOverride?: Record<string, unknown>
  initialFormData?: Record<string, unknown>
  lockedFields?: string[]
  onDone?: (outcome: CallOutcome) => void
}

export function ToolPanel({
  serverId,
  tool,
  schemaOverride,
  initialFormData,
  lockedFields,
  onDone
}: ToolPanelProps): React.JSX.Element {
  const schema = useMemo(() => {
    const base = (schemaOverride ?? tool.inputSchema ?? { type: 'object' }) as Record<
      string,
      unknown
    >
    return base
  }, [schemaOverride, tool.inputSchema])

  const uiSchema = useMemo(() => {
    if (!lockedFields || lockedFields.length === 0) return undefined
    const ui: Record<string, unknown> = {}
    for (const f of lockedFields) ui[f] = { 'ui:disabled': true }
    return ui
  }, [lockedFields])

  const [formData, setFormData] = useState<Record<string, unknown> | undefined>(initialFormData)
  const [running, setRunning] = useState<string | null>(null) // 运行中的 callId
  const [outcome, setOutcome] = useState<CallOutcome | null>(null)

  async function run(): Promise<void> {
    const callId = newCallId()
    setRunning(callId)
    setOutcome(null)
    const result = await bridge.mcpCall(callId, serverId, tool.name, formData ?? {})
    setRunning(null)
    // 取消后不覆盖面板（onDone 用于 CrudPanel 关弹窗；取消不触发）
    if (result.ok === false && result.error?.message === '已取消') {
      setOutcome(result)
      return
    }
    setOutcome(result)
    onDone?.(result)
  }

  async function cancel(): Promise<void> {
    if (running) await bridge.mcpCancel(running)
  }

  return (
    <div className="tool-panel">
      <div className="tool-panel-head">
        <h3>{tool.name}</h3>
        {tool.description && <p className="tool-desc">{tool.description}</p>}
      </div>
      <Form
        schema={schema as never}
        uiSchema={uiSchema as never}
        validator={validator}
        formData={formData as never}
        onChange={(e: { formData?: any }) => setFormData(e.formData ?? undefined)}
        onSubmit={() => void run()}
        disabled={running !== null}
      >
        <div className="form-actions">
          {running ? (
            <>
              <button type="button" className="btn" onClick={() => void cancel()}>
                取消
              </button>
              <span className="form-running">执行中…</span>
            </>
          ) : (
            <button type="submit" className="btn btn-primary">
              执行
            </button>
          )}
        </div>
      </Form>
      {outcome && <ResultView outcome={outcome} />}
    </div>
  )
}
