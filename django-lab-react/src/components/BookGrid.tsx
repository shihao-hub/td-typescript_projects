import { Card, Col, Empty, Row, Spin, Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'
import type { Book } from '../lib/types'

const statusColor: Record<string, string> = {
  AVAILABLE: 'green',
  BORROWED: 'orange',
  DRAFT: 'default',
  RETIRED: 'red',
}

export function BookCard({ book }: { book: Book }) {
  return (
    <Col xs={24} sm={12} lg={8}>
      <Card
        hoverable
        title={
          <Link to={`/books/${book.slug}`} style={{ color: 'inherit' }}>
            {book.title}
          </Link>
        }
        extra={<Tag color={statusColor[book.status]}>{book.status_display}</Tag>}
      >
        <p style={{ minHeight: 24 }}>
          <Typography.Text type="secondary">{book.author}</Typography.Text>
          {book.genres.map((genre) => (
            <Tag key={genre} style={{ marginLeft: 8 }}>
              {genre}
            </Tag>
          ))}
        </p>
        <Typography.Paragraph ellipsis={{ rows: 2 }} type="secondary">
          {book.summary || '（暂无摘要）'}
        </Typography.Paragraph>
        <p>
          定价 <Typography.Text strong>{book.price}</Typography.Text>
          <span style={{ marginLeft: 12 }}>
            含税 <Typography.Text type="secondary">{book.price_with_tax}</Typography.Text>
          </span>
        </p>
      </Card>
    </Col>
  )
}

export function BookGrid({
  books,
  loading,
}: {
  books: Book[] | undefined
  loading: boolean
}) {
  if (loading && !books) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin />
      </div>
    )
  }
  if (!books || books.length === 0) {
    return <Empty description="没有找到符合条件的图书" style={{ padding: 48 }} />
  }
  return (
    <Row gutter={[16, 16]}>
      {books.map((book) => (
        <BookCard key={book.id} book={book} />
      ))}
    </Row>
  )
}
