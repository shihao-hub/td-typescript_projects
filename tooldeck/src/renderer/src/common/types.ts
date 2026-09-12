// CLI 包络类型（对应 exestarter 输出纪律，见 docs/go_projects/exestarter/接口文档.md）
export interface CliError {
  code: string
  message: string
}

export interface CliExecResult<T = unknown> {
  ok: boolean
  data?: T
  error?: CliError
  exitCode: number
}

// list 输出的条目行
export interface Entry {
  name: string
  path: string
  valid: boolean
  sys_tag?: string
  user_tag?: string
  added_at: string
}

// 系统标签（与 exestarter model/tags.go 对齐）
export const SYS_TAGS = [
  { key: 'todo', label: '待完善', color: '#E08A00' },
  { key: 'verify', label: '待验证', color: '#2070C0' },
  { key: 'broken', label: '有问题', color: '#C03030' },
  { key: 'stable', label: '稳定', color: '#309040' }
] as const

export type SysTagKey = (typeof SYS_TAGS)[number]['key']

export function sysTagMeta(key: string | undefined): { label: string; color: string } | null {
  if (!key) return null
  const hit = SYS_TAGS.find((t) => t.key === key)
  return hit ? { label: hit.label, color: hit.color } : null
}

export function errText(err: CliError | undefined): string {
  if (!err) return '未知错误'
  return `${err.code}: ${err.message}`
}
