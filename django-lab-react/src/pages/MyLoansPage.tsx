import { App, Button, Popconfirm, Space, Table, Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { useLoans, useMe, useReturnLoan } from '../lib/queries'
import type { Loan } from '../lib/types'

export default function MyLoansPage() {
  const { data: me } = useMe()
  const authenticated = me?.authenticated ?? false
  const { data, isPending } = useLoans(authenticated)
  const returnLoan = useReturnLoan()
  const { message } = App.useApp()

  if (!authenticated) {
    return (
      <Space direction="vertical">
        <Typography.Paragraph>登录后才能查看你的借阅记录。</Typography.Paragraph>
        <Button type="primary" href="/login">
          去登录
        </Button>
      </Space>
    )
  }

  const loans: Loan[] = data?.results ?? []

  const columns = [
    {
      title: '书名',
      dataIndex: 'book',
      key: 'book',
      render: (value: string) => value,
    },
    {
      title: '借出时间',
      dataIndex: 'borrowed_at',
      key: 'borrowed_at',
      render: (value: string) => new Date(value).toLocaleString('zh-CN'),
    },
    { title: '应还日期', dataIndex: 'due_date', key: 'due_date' },
    {
      title: '状态',
      key: 'status',
      render: (_: unknown, record: Loan) => {
        if (!record.is_active) return <Tag>已归还</Tag>
        if (record.is_overdue) return <Tag color="red">已逾期</Tag>
        return <Tag color="processing">在借</Tag>
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: Loan) =>
        record.is_active ? (
          <Popconfirm
            title="确认归还这本书？"
            onConfirm={() =>
              returnLoan.mutate(record.id, {
                onSuccess: () => message.success(`《${record.book}》已归还，感谢！`),
                onError: () => message.error('归还失败，请重试。'),
              })
            }
          >
            <Button size="small" loading={returnLoan.isPending && returnLoan.variables === record.id}>
              还书
            </Button>
          </Popconfirm>
        ) : null,
    },
  ]

  return (
    <>
      <Typography.Title level={4}>我的借阅</Typography.Title>
      <Table<Loan>
        rowKey="id"
        columns={columns}
        dataSource={loans}
        loading={isPending}
        pagination={false}
      />
      <p style={{ marginTop: 12 }}>
        <Link to="/books">去借更多书 →</Link>
      </p>
    </>
  )
}
