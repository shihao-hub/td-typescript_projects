import { app, BrowserWindow } from 'electron'

// 单实例：Electron 原生 requestSingleInstanceLock（Windows 上为 named mutex，零残留）。
// 拿不到锁 = 已有实例，本进程应退出；持锁实例收到 second-instance 事件时聚焦窗口。
export function setupSingleInstance(): boolean {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    return false
  }
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
  return true
}
