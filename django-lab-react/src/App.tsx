import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import AuthorDetailPage from './pages/AuthorDetailPage'
import AuthorListPage from './pages/AuthorListPage'
import BookDetailPage from './pages/BookDetailPage'
import BookListPage from './pages/BookListPage'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import MyLoansPage from './pages/MyLoansPage'
import NotFoundPage from './pages/NotFoundPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/books" replace />} />
        <Route path="books" element={<BookListPage />} />
        <Route path="books/:slug" element={<BookDetailPage />} />
        <Route path="authors" element={<AuthorListPage />} />
        <Route path="authors/:id" element={<AuthorDetailPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="my/loans" element={<MyLoansPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
