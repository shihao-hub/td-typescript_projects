import { Descriptions, Spin, Typography } from 'antd'
import { useParams } from 'react-router-dom'
import { BookGrid } from '../components/BookGrid'
import { useAuthor, useBooks } from '../lib/queries'

export default function AuthorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: author, isPending, isError } = useAuthor(id)
  const { data: books, isPending: booksPending } = useBooks({ author: Number(id) })

  if (isPending) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin />
      </div>
    )
  }
  if (isError || !author) {
    return <Typography.Paragraph>作者不存在。</Typography.Paragraph>
  }

  return (
    <>
      <Typography.Title level={3}>{author.full_name}</Typography.Title>
      <Descriptions bordered column={1} size="small">
        <Descriptions.Item label="著作数量">{author.book_count} 本</Descriptions.Item>
        <Descriptions.Item label="简介">{author.about || '（暂无简介）'}</Descriptions.Item>
      </Descriptions>
      <Typography.Title level={5} style={{ marginTop: 24 }}>
        出版图书
      </Typography.Title>
      <BookGrid books={books?.results} loading={booksPending} />
    </>
  )
}
