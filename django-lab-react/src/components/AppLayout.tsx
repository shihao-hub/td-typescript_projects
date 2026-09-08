import { Button, Input, Layout, Menu, Space, Typography } from 'antd'
import {
  BookOutlined,
  DashboardOutlined,
  LoginOutlined,
  LogoutOutlined,
  ReadOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useLogout, useMe } from '../lib/queries'

const { Header, Content, Footer } = Layout

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: me } = useMe()
  const logout = useLogout()

  const selected = '/' + (location.pathname.split('/')[1] ?? '')
  const items = [
    { key: '/books', icon: <BookOutlined />, label: '图书' },
    { key: '/authors', icon: <UserOutlined />, label: '作者' },
    { key: '/dashboard', icon: <DashboardOutlined />, label: '看板' },
    { key: '/my/loans', icon: <ReadOutlined />, label: '我的借阅' },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Typography.Title level={4} style={{ color: '#fff', margin: 0, whiteSpace: 'nowrap' }}>
          Django Lab
        </Typography.Title>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[selected]}
          items={items}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Input.Search
          placeholder="搜索书名 / 作者 / 摘要"
          style={{ width: 240 }}
          onSearch={(value) => navigate(`/books?q=${encodeURIComponent(value)}`)}
          allowClear
        />
        {me?.authenticated ? (
          <Space>
            <Typography.Text style={{ color: '#fff' }}>{me.username}</Typography.Text>
            <Button
              type="text"
              icon={<LogoutOutlined />}
              style={{ color: '#fff' }}
              onClick={() => logout.mutate()}
            >
              登出
            </Button>
          </Space>
        ) : (
          <Button type="primary" icon={<LoginOutlined />} onClick={() => navigate('/login')}>
            登录
          </Button>
        )}
      </Header>
      <Content style={{ padding: 24, maxWidth: 1200, width: '100%', margin: '0 auto' }}>
        <Outlet />
      </Content>
      <Footer style={{ textAlign: 'center' }}>
        Django Lab SPA · React + antd + TanStack Query · 数据来自 DRF API
      </Footer>
    </Layout>
  )
}
