// TanStack Query hooks：服务端状态的唯一出入口，页面只关心渲染
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, post } from './api'
import type { Author, Book, Loan, Me, Paged, Stats } from './types'

// ---------------------------------------------------------------------------
// 认证

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => get<Me>('/auth/me/'),
    staleTime: 5 * 60 * 1000,
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { username: string; password: string }) =>
      post<{ username: string }>('/auth/login/', data),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => post<void>('/auth/logout/'),
    onSuccess: () => qc.invalidateQueries(),
  })
}

// ---------------------------------------------------------------------------
// 图书

export interface BookQuery {
  search?: string
  page?: number
  pageSize?: number
  author?: number
}

export function useBooks(params: BookQuery) {
  const qs = new URLSearchParams()
  if (params.search) qs.set('search', params.search)
  if (params.page) qs.set('page', String(params.page))
  if (params.pageSize) qs.set('page_size', String(params.pageSize))
  if (params.author) qs.set('author', String(params.author))
  const suffix = qs.size > 0 ? `?${qs.toString()}` : ''
  return useQuery({
    queryKey: ['books', params],
    queryFn: () => get<Paged<Book>>(`/books/${suffix}`),
    placeholderData: (prev) => prev,
  })
}

export function useBook(slug: string | undefined) {
  return useQuery({
    queryKey: ['book', slug],
    queryFn: () => get<Book>(`/books/${slug}/`),
    enabled: Boolean(slug),
  })
}

export function useBorrow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ slug, dueDate }: { slug: string; dueDate: string }) =>
      post<Loan>(`/books/${slug}/borrow/`, { due_date: dueDate }),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['book', variables.slug] })
      void qc.invalidateQueries({ queryKey: ['books'] })
      void qc.invalidateQueries({ queryKey: ['loans'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => get<Stats>('/books/stats/'),
  })
}

// ---------------------------------------------------------------------------
// 作者

export function useAuthors() {
  return useQuery({
    queryKey: ['authors'],
    queryFn: () => get<Paged<Author>>('/authors/'),
  })
}

export function useAuthor(id: string | undefined) {
  return useQuery({
    queryKey: ['author', id],
    queryFn: () => get<Author>(`/authors/${id}/`),
    enabled: Boolean(id),
  })
}

// ---------------------------------------------------------------------------
// 借阅

export function useLoans(enabled: boolean) {
  return useQuery({
    queryKey: ['loans'],
    queryFn: () => get<Paged<Loan>>('/loans/'),
    enabled,
  })
}

export function useReturnLoan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => post<Loan>(`/loans/${id}/return/`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['loans'] })
      void qc.invalidateQueries({ queryKey: ['books'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}
