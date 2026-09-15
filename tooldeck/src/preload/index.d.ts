// 渲染层可见的 window.api 类型声明（与 preload/index.ts 的白名单一一对应；
// 具体类型以 preload 导出的 TooldeckApi 为准）
export type { TooldeckApi, McpServerStatusPayload } from './index'

declare global {
  interface Window {
    api: import('./index').TooldeckApi
  }
}
