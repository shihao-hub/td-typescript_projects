import { Card, Col, Empty, Row, Spin, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { useAuthors } from '../lib/queries'

export default function AuthorListPage() {
  const { data, isPending, isError } = useAuthors()

  if (isPending) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin />
      </div>
    )
  }
  if (isError) {
    return <p>加载作者失败，请稍后刷新重试。</p>
  }
  if (!data || data.results.length === 0) {
    return <Empty description="暂无作者" style={{ padding: 48 }} />
  }

  return (
    <>
      <Typography.Title level={4}>作者（{data.count}）</Typography.Title>
      <Row gutter={[16, 16]}>
        {data.results.map((author) => (
          <Col xs={24} sm={12} lg={8} key={author.id}>
            <Card hoverable>
              <Card.Meta
                title={<Link to={`/authors/${author.id}`}>{author.full_name}</Link>}
                description={
                  <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                    {author.about || '（暂无简介）'}
                  </Typography.Paragraph>
                }
              />
              <p style={{ marginTop: 12, marginBottom: 0 }}>
                <Typography.Text type="secondary">著作 {author.book_count} 本</Typography.Text>
              </p>
            </Card>
          </Col>
        ))}
      </Row>
    </>
  )
}
