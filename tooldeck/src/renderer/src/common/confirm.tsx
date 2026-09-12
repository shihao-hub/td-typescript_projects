/* eslint-disable react-refresh/only-export-components -- Provider 与配套 hook 同文件是惯用模式 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface ConfirmOptions {
  title: string
  body: ReactNode
  confirmText?: string
  danger?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmCtx = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) throw new Error('useConfirm 必须在 ConfirmProvider 内使用')
  return ctx
}

export function ConfirmProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(
    null
  )
  // 弹窗占用标记：事件处理器中读写（非渲染期），已有弹窗时直接拒绝新请求
  const openRef = useRef(false)

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    if (openRef.current) return Promise.resolve(false)
    openRef.current = true
    return new Promise((resolve) => {
      setState({
        ...opts,
        resolve: (v: boolean) => {
          openRef.current = false
          resolve(v)
        }
      })
    })
  }, [])

  const close = (v: boolean): void => {
    state?.resolve(v)
    setState(null)
  }

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <div className="modal-mask" onClick={() => close(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{state.title}</div>
            <div className="modal-body">{state.body}</div>
            <div className="modal-actions">
              <button className="btn" onClick={() => close(false)}>
                取消
              </button>
              <button
                className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => close(true)}
              >
                {state.confirmText ?? '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  )
}
