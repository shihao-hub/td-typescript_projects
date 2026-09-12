/* eslint-disable react-refresh/only-export-components -- Provider 与配套 hook 同文件是惯用模式 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

export type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  text: string
}

interface ToastApi {
  toast: (kind: ToastKind, text: string) => void
}

const ToastCtx = createContext<ToastApi | null>(null)

// 直接返回 toast 函数，用法：const toast = useToast(); toast('success', '...')
export function useToast(): (kind: ToastKind, text: string) => void {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用')
  return ctx.toast
}

const TOAST_MS = 3500

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const toast = useCallback((kind: ToastKind, text: string) => {
    const id = nextId.current++
    setItems((prev) => [...prev, { id, kind, text }])
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, TOAST_MS)
  }, [])

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="toast-area">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
