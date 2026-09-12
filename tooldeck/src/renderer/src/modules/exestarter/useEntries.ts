import { useCallback, useEffect, useMemo, useState } from 'react'
import { client } from './client'
import type { Entry } from '@renderer/common/types'

export type StatusFilter = 'all' | 'valid' | 'invalid'
export type SysTagFilter = 'all' | 'todo' | 'verify' | 'broken' | 'stable'

export interface EntriesStats {
  total: number
  valid: number
  invalid: number
  byTag: Record<string, number>
}

export interface EntriesState {
  entries: Entry[] | null
  loadError: string | null
  refresh: () => Promise<void>
  selected: Entry | null
  selectedName: string | null
  setSelectedName: (name: string) => void
  filtered: Entry[]
  statusFilter: StatusFilter
  setStatusFilter: (f: StatusFilter) => void
  sysTagFilter: SysTagFilter
  setSysTagFilter: (f: SysTagFilter) => void
  stats: EntriesStats
}

// exestarter 模块状态：条目 + 选中 + 筛选。
// 刷新时机：模块加载、窗口聚焦、每次写操作后（由调用方触发 refresh）。
export function useEntries(): EntriesState {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sysTagFilter, setSysTagFilter] = useState<SysTagFilter>('all')

  const refresh = useCallback(async (): Promise<void> => {
    const r = await client.list()
    if (r.ok) {
      setEntries(r.data ?? [])
      setLoadError(null)
      // 选中条目可能已被删除/改名，校验一次
      setSelectedName((prev) => {
        if (prev && !(r.data ?? []).some((e) => e.name === prev)) return null
        return prev
      })
    } else {
      setEntries([])
      setLoadError(r.error ? `${r.error.code}: ${r.error.message}` : '加载失败')
    }
  }, [])

  useEffect(() => {
    // 首次加载走异步 IPC，setState 均在 await 之后，不属于同步级联渲染
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
    const onFocus = (): void => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const selected = useMemo(
    () => entries?.find((e) => e.name === selectedName) ?? null,
    [entries, selectedName]
  )

  const filtered = useMemo(() => {
    if (!entries) return []
    return entries.filter((e) => {
      if (statusFilter === 'valid' && !e.valid) return false
      if (statusFilter === 'invalid' && e.valid) return false
      if (sysTagFilter !== 'all' && e.sys_tag !== sysTagFilter) return false
      return true
    })
  }, [entries, statusFilter, sysTagFilter])

  const stats = useMemo<EntriesStats>(() => {
    const list = entries ?? []
    const byTag: Record<string, number> = {}
    for (const e of list) {
      if (e.sys_tag) byTag[e.sys_tag] = (byTag[e.sys_tag] ?? 0) + 1
    }
    return {
      total: list.length,
      valid: list.filter((e) => e.valid).length,
      invalid: list.filter((e) => !e.valid).length,
      byTag
    }
  }, [entries])

  return {
    entries,
    loadError,
    refresh,
    selected,
    selectedName,
    setSelectedName,
    filtered,
    statusFilter,
    setStatusFilter,
    sysTagFilter,
    setSysTagFilter,
    stats
  }
}
