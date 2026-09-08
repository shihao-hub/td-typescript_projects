import { useState } from 'react'
import { App, Button, DatePicker, Descriptions, Modal, Space, Spin, Tag, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { firstError } from '../lib/api'
import { useBook, useBorrow, useMe } from '../lib/queries'

const statusColor: Record<string, string> = {
  AVAILABLE: 'green',
  BORROWED: 'orange',
  DRAFT: 'default',
  RETIRED: 'red',
}

export default function BookDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { data: book, isPending, isError } = useBook(slug)
  const { data: me } = useMe()
  const borrow = useBorrow()
  const { message } = App.useApp()
  const [open, setOpen] = useState(false)
  const [dueDate, setDueDate] = useState<Dayjs>(dayjs().add(14, 'day'))

  if (isPending) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin />
      </div>
    )
  }
  if (isError || !book) {
    return <Typography.Paragraph>图书不存在或已被删除。</Typography.Paragraph>
  }

  const openBorrow = () => {
    if (!me?.authenticated) {
      message.info('请先登录后再借阅。')
      navigate('/login')
      return
    }
    setOpen(true)
  }

  const submitBorrow = () => {
    if (!slug) return
    borrow.mutate(
      { slug, dueDate: dueDate.format('YYYY-MM-DD') },
      {
        onSuccess: (record) => {
          setOpen(false)
          message.success(`《${book.title}》借阅成功，请在 ${record.due_date} 前归还。`)
        },
        onError: (error) => message.error(firstError((error as { detail?: unknown }).detail)),
      },
    )
  }

  return (
    <>
      <Typography.Title level={3}>{book.title}</Typography.Title>
      <Descriptions bordered column={{ xs: 1, md: 2 }} size="small">
        <Descriptions.Item label="作者">
          <Link to={`/authors/${book.author_id}`}>{book.author}</Link>
        </Descriptions.Item>
        <Descriptions.Item label="状态">
          <Tag color={statusColor[book.status]}>{book.status_display}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="分类">{book.genres.join(' / ') || '—'}</Descriptions.Item>
        <Descriptions.Item label="ISBN">{book.isbn || '—'}</Descriptions.Item>
        <Descriptions.Item label="定价">￥{book.price}</Descriptions.Item>
        <Descriptions.Item label="含税价">￥{book.price_with_tax}</Descriptions.Item>
        <Descriptions.Item label="入库时间">
          {new Date(book.created_at).toLocaleString('zh-CN')}
        </Descriptions.Item>
        <Descriptions.Item label="摘要" span={2}>
          {book.summary || '（暂无摘要）'}
        </Descriptions.Item>
      </Descriptions>

      <Space style={{ marginTop: 24 }}>
        <Button type="primary" disabled={!book.is_borrowable} onClick={openBorrow}>
          {book.is_borrowable ? '借阅这本书' : '当前状态不可借阅'}
        </Button>
        <Button onClick={() => navigate('/books')}>返回列表</Button>
      </Space>

      <Modal
        title={`借阅《${book.title}》`}
        open={open}
        onOk={submitBorrow}
        onCancel={() => setOpen(false)}
        confirmLoading={borrow.isPending}
        okText="确认借阅"
        cancelText="取消"
      >
        <p style={{ marginBottom: 8 }}>应还日期（默认借 14 天）：</p>
        <DatePicker value={dueDate} onChange={(value) => value && setDueDate(value)} />
      </Modal>
    </>
  )
}
