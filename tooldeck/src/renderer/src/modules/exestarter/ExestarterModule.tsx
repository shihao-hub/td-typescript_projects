import { useEffect, useState } from 'react'
import { useToast } from '@renderer/common/toast'
import { useConfirm } from '@renderer/common/confirm'
import type { Entry } from '@renderer/common/types'
import { detectCli, cliPath } from './client'
import { useEntries, type StatusFilter, type SysTagFilter } from './useEntries'
import { useOperations } from './useOperations'
import { Toolbar } from './Toolbar'
import { EntryTable } from './EntryTable'
import { StatusBar } from './StatusBar'
import { TagDialog } from './TagDialog'
import { ScanImportDialog } from './ScanImportDialog'

interface ScanState {
  dir: string
  exes: string[]
}

// exestarter 模块页：CLI 探测 → 引导或主界面（工具栏 + 筛选 + 表格 + 状态栏）
export function ExestarterModule({
  onOpenSettings
}: {
  onOpenSettings: () => void
}): React.JSX.Element {
  const toast = useToast()
  const confirm = useConfirm()
  const [ready, setReady] = useState<boolean | null>(null)
  const [tagTarget, setTagTarget] = useState<Entry | null>(null)
  const [scan, setScan] = useState<ScanState | null>(null)

  useEffect(() => {
    detectCli().then((p) => setReady(p !== null))
  }, [])

  if (ready === null) {
    return (
      <div className="page">
        <div className="table-wrap">
          <div className="empty-hint">正在探测 exestarter.exe …</div>
        </div>
      </div>
    )
  }
  if (ready === false || cliPath() === null) {
    return (
      <div className="page" style={{ alignItems: 'center' }}>
        <div className="guide-card">
          <div className="big">未找到 exestarter.exe</div>
          <div className="settings-hint">
            自动探测（已保存配置 &gt; PATH &gt; 开发目录）均未命中。
            <br />
            请到设置页手动配置 CLI 路径。
          </div>
          <button className="btn btn-primary" onClick={onOpenSettings}>
            打开设置
          </button>
        </div>
      </div>
    )
  }

  return (
    <ExestarterMain
      toast={toast}
      confirm={confirm}
      tagTarget={tagTarget}
      setTagTarget={setTagTarget}
      scan={scan}
      setScan={setScan}
    />
  )
}

// 拆出主界面组件：保证 CLI 探测成功后才挂载 useEntries（避免无 CLI 时刷错误）
function ExestarterMain(props: {
  toast: ReturnType<typeof useToast>
  confirm: ReturnType<typeof useConfirm>
  tagTarget: Entry | null
  setTagTarget: (e: Entry | null) => void
  scan: ScanState | null
  setScan: (s: ScanState | null) => void
}): React.JSX.Element {
  const { toast, confirm } = props
  const es = useEntries()
  const ops = useOperations({ toast, confirm, refresh: es.refresh })

  const requireSelected = (fn: (e: Entry) => void): (() => void) => {
    return () => {
      if (!es.selected) {
        toast('info', '请先在表格中选中一个条目')
        return
      }
      fn(es.selected)
    }
  }

  return (
    <div className="page">
      <Toolbar
        selected={es.selected}
        invalidCount={es.stats.invalid}
        onAdd={() => void ops.addFlow()}
        onScan={() => {
          void ops.scanPreviewFlow().then((s) => {
            if (s) props.setScan(s)
          })
        }}
        onTag={requireSelected((e) => props.setTagTarget(e))}
        onUpdatePath={requireSelected((e) => void ops.updatePathFlow(e))}
        onLaunch={requireSelected((e) => void ops.launchFlow(e))}
        onLocate={requireSelected((e) => void ops.locateFlow(e))}
        onTerminal={requireSelected((e) => void ops.terminalFlow(e))}
        onRemove={requireSelected((e) => void ops.removeFlow(e))}
        onPrune={() => void ops.pruneFlow(es.stats.invalid)}
      />

      <div className="filterbar">
        <span>状态</span>
        <select
          className="select"
          value={es.statusFilter}
          onChange={(e) => es.setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="all">全部</option>
          <option value="valid">有效</option>
          <option value="invalid">失效</option>
        </select>
        <span>系统标签</span>
        <select
          className="select"
          value={es.sysTagFilter}
          onChange={(e) => es.setSysTagFilter(e.target.value as SysTagFilter)}
        >
          <option value="all">全部</option>
          <option value="todo">待完善</option>
          <option value="verify">待验证</option>
          <option value="broken">有问题</option>
          <option value="stable">稳定</option>
        </select>
      </div>

      <EntryTable
        entries={es.entries}
        filtered={es.filtered}
        loadError={es.loadError}
        selectedName={es.selectedName}
        onSelect={es.setSelectedName}
        onDoubleClick={(e) => void ops.launchFlow(e)}
        commands={{
          launch: (e) => void ops.launchFlow(e),
          locate: (e) => void ops.locateFlow(e),
          terminal: (e) => void ops.terminalFlow(e),
          tag: (e) => props.setTagTarget(e),
          updatePath: (e) => void ops.updatePathFlow(e),
          remove: (e) => void ops.removeFlow(e)
        }}
      />

      <StatusBar {...es.stats} />

      {props.tagTarget && (
        <TagDialog
          entry={props.tagTarget}
          onCancel={() => props.setTagTarget(null)}
          onSubmit={(systag, usertag) => {
            const target = props.tagTarget!
            props.setTagTarget(null)
            void ops.tagFlow(target, systag, usertag)
          }}
        />
      )}

      {props.scan && (
        <ScanImportDialog
          dir={props.scan.dir}
          exes={props.scan.exes}
          onCancel={() => props.setScan(null)}
          onConfirm={(selected) => {
            props.setScan(null)
            void ops.scanApply(selected)
          }}
        />
      )}
    </div>
  )
}
