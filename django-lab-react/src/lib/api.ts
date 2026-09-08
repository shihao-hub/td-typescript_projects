// fetch 封装：统一 /api 前缀、JSON 序列化、CSRF 头与错误归一

const BASE = '/api'

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

export class ApiError extends Error {
  status: number
  detail: unknown

  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : `API error ${status}`)
    this.status = status
    this.detail = detail
  }
}

/** 把后端错误（字符串或字段错误字典）压成一句可展示的中文提示 */
export function firstError(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') {
    const values = Object.values(detail as Record<string, unknown>)
    for (const value of values.flat()) {
      if (typeof value === 'string') return value
    }
  }
  return '请求失败，请稍后重试。'
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const headers = new Headers(options.headers)
  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('Content-Type', 'application/json')
    headers.set('X-CSRFToken', csrfToken())
  }
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    method,
    headers,
    credentials: 'same-origin',
  })
  if (response.status === 204) {
    return undefined as T
  }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail ?? data
    throw new ApiError(response.status, detail)
  }
  return data as T
}

export const get = <T>(path: string) => request<T>(path)

export const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
