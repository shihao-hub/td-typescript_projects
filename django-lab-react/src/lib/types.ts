// 与后端 api/serializers.py 的字段一一对应（模型即唯一事实，前端只做镜像类型）

export interface Paged<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface Book {
  id: number
  page_url: string
  title: string
  slug: string
  author: string
  author_id: number
  genres: string[]
  summary: string
  isbn: string
  price: string
  price_with_tax: string
  status: string
  status_display: string
  is_borrowable: boolean
  created_at: string
}

export interface Author {
  id: number
  full_name: string
  about: string
  book_count: number
}

export interface Loan {
  id: number
  book: string
  book_id: number
  borrower: string
  borrowed_at: string
  due_date: string
  returned_at: string | null
  is_active: boolean
  is_overdue: boolean
}

export interface Stats {
  total: number
  available: number
  borrowed: number
  draft: number
  retired: number
}

export interface Me {
  authenticated: boolean
  id?: number
  username?: string
  is_staff?: boolean
}
