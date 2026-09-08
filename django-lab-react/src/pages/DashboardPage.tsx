import { Card, Col, List, Row, Statistic, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { useBooks, useStats } from '../lib/queries'

export default function DashboardPage() {
  const { data: stats } = useStats()
  const { data: latest } = useBooks({ pageSize: 5 })

  return (
    <>
      <Typography.Title level={4}>运营看板</Typography.Title>
      <Row gutter={16}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="总藏书" value={stats?.total ?? '—'} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="可借" value={stats?.available ?? '—'} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="借出中" value={stats?.borrowed ?? '—'} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="草稿" value={stats?.draft ?? '—'} />
          </Card>
        </Col>
      </Row>

      <Card title="最新入库" style={{ marginTop: 24 }}>
        <List
          dataSource={latest?.results ?? []}
          renderItem={(book) => (
            <List.Item>
              <List.Item.Meta
                title={<Link to={`/books/${book.slug}`}>{book.title}</Link>}
                description={`${book.author} · ￥${book.price} · ${book.status_display}`}
              />
            </List.Item>
          )}
        />
      </Card>
    </>
  )
}
