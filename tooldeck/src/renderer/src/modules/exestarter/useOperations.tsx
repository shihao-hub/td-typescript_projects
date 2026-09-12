import type { Entry } from '@renderer/common/types'
import type { useToast } from '@renderer/common/toast'
import type { useConfirm } from '@renderer/common/confirm'
import { client } from './client'

interface OpsDeps {
  toast: ReturnType<typeof useToast>
  confirm: ReturnType<typeof useConfirm>
  refresh: () => Promise<void>
}

export interface Operations {
  addFlow: () => Promise<void>
  scanPreviewFlow: () => Promise<{ dir: string; exes: string[] } | null>
  scanApply: (exes: string[]) => Promise<void>
  tagFlow: (entry: Entry, systag: string, usertag: string) => Promise<void>
  updatePathFlow: (entry: Entry) => Promise<void>
  launchFlow: (entry: Entry) => Promise<void>
  locateFlow: (entry: Entry) => Promise<void>
  terminalFlow: (entry: Entry) => Promise<void>
  removeFlow: (entry: Entry) => Promise<void>
  pruneFlow: (invalidCount: number) => Promise<void>
}

// 八条操作流：添加 / 扫描导入 / 打标 / 改路径 / 启动 / 定位 / 开终端 / 删除 / 清理失效。
// 统一错误处理：toast 展示 code + message；所有写操作完成后刷新列表。
export function useOperations({ toast, confirm, refresh }: OpsDeps): Operations {
  const ok = (msg: string): void => toast('success', msg)
  const err = (code?: string, message?: string): void =>
    toast('error', message ? `${code}: ${message}` : '操作失败')
  const done = async (
    r: { ok: boolean; error?: { code: string; message: string } },
    successMsg: string
  ): Promise<boolean> => {
    if (r.ok) {
      ok(successMsg)
      await refresh()
      return true
    }
    err(r.error?.code, r.error?.message)
    return false
  }

  return {
    // 添加：exe 文件选择框 → add → 刷新
    async addFlow(): Promise<void> {
      const path = await client.pickExePath()
      if (!path) return
      const r = await client.add(path)
      await done(r, `已添加 ${r.data?.name ?? path}`)
    },

    // 扫描导入：目录选择 → 预览列表（返回给页面渲染勾选对话框）
    async scanPreviewFlow(): Promise<{ dir: string; exes: string[] } | null> {
      const dir = await client.pickDirPath()
      if (!dir) return null
      const r = await client.scanPreview(dir)
      if (!r.ok) {
        err(r.error?.code, r.error?.message)
        return null
      }
      const data = r.data!
      if (data.count === 0) {
        toast('info', `目录下未发现 exe: ${data.dir}`)
        return null
      }
      return { dir: data.dir, exes: data.exes }
    },

    // 扫描导入确认：逐条串行注册（client.add 内部过写队列）→ 汇总
    async scanApply(exes: string[]): Promise<void> {
      let success = 0
      let skipped = 0
      for (const p of exes) {
        const r = await client.add(p)
        if (r.ok) success++
        else skipped++ // 路径已注册等非致命错误按跳过计
      }
      toast('success', `扫描导入完成：成功 ${success}，跳过 ${skipped}`)
      await refresh()
    },

    // 打标：对话框全量提交（空串 = 清除）
    async tagFlow(entry: Entry, systag: string, usertag: string): Promise<void> {
      const r = await client.tag(entry.name, systag, usertag)
      await done(r, `已打标 ${r.data?.name ?? entry.name}`)
    },

    // 改路径：文件选择框（默认定位旧路径目录）→ update
    async updatePathFlow(entry: Entry): Promise<void> {
      const path = await client.pickExePath(entry.path)
      if (!path) return
      const r = await client.updatePath(entry.name, path)
      await done(r, `路径已更新: ${r.data?.name ?? entry.name}`)
    },

    // 启动：valid 预检 → detached 后台启动 → toast
    async launchFlow(entry: Entry): Promise<void> {
      if (!entry.valid) {
        toast('error', `条目已失效，请清理或改路径: ${entry.name}`)
        return
      }
      const r = await client.run(entry.name)
      if (r.ok) ok(`已启动 ${entry.name}`)
      else err('spawn_error', r.message)
    },

    // 定位 / 开终端：直接执行 → toast
    async locateFlow(entry: Entry): Promise<void> {
      const r = await client.open(entry.name)
      if (r.ok) ok(`已在资源管理器定位 ${entry.name}`)
      else err(r.error?.code, r.error?.message)
    },
    async terminalFlow(entry: Entry): Promise<void> {
      const r = await client.shell(entry.name)
      if (r.ok) ok(`已在该目录打开 PowerShell: ${r.data?.dir ?? ''}`)
      else err(r.error?.code, r.error?.message)
    },

    // 删除：确认框 → remove → 刷新
    async removeFlow(entry: Entry): Promise<void> {
      const yes = await confirm({
        title: '删除条目',
        body: (
          <span>
            确定删除 <b>{entry.name}</b>？
            <br />
            <span className="settings-hint">{entry.path}</span>
            <br />
            <span className="settings-hint">（只删除注册记录，不删除文件）</span>
          </span>
        ),
        confirmText: '删除',
        danger: true
      })
      if (!yes) return
      const r = await client.remove(entry.name)
      await done(r, `已删除 ${r.data?.removed ?? entry.name}`)
    },

    // 清理失效：确认框（显示失效数）→ prune → toast 移除数
    async pruneFlow(invalidCount: number): Promise<void> {
      if (invalidCount === 0) {
        toast('info', '没有失效条目')
        return
      }
      const yes = await confirm({
        title: '清理失效条目',
        body: (
          <span>
            共 <b>{invalidCount}</b> 个条目指向的文件已不存在，确定全部清理？
          </span>
        ),
        confirmText: '清理',
        danger: true
      })
      if (!yes) return
      const r = await client.prune()
      if (r.ok) {
        ok(`已清理 ${r.data?.removed ?? 0} 个失效条目`)
        await refresh()
      } else {
        err(r.error?.code, r.error?.message)
      }
    }
  }
}
