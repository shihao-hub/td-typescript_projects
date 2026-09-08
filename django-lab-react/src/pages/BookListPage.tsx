import { Pagination } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { BookGrid } from '../components/BookGrid'
import { useBooks } from '../lib/queries'

const PAGE_SIZE = 9

export default function BookListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? '1')

  const { data, isPending, isError } = useBooks({ search, page, pageSize: PAGE_SIZE })

  if (isError) {
    return <p>加载图书失败，请稍后刷新重试。</p>
  }

  return (
    <>
      <BookGrid books={data?.results} loading={isPending} />
      <Pagination
        style={{ marginTop: 24, textAlign: 'center' }}
        current={page}
        pageSize={PAGE_SIZE}
        total={data?.count ?? 0}
        showSizeChanger={false}
        showTotal={(total) => `共 ${total} 本`}
        onChange={(next) => {
          const params = new URLSearchParams(searchParams)
          params.set('page', String(next))
          setSearchParams(params)
        }}
      />
    </>
  )
}
