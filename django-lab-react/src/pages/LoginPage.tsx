import { useState } from 'react'
import { App, Button, Card, Form, Input } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import { firstError } from '../lib/api'
import { useLogin } from '../lib/queries'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const login = useLogin()
  const { message } = App.useApp()
  const [loading, setLoading] = useState(false)

  const onFinish = (values: { username: string; password: string }) => {
    setLoading(true)
    login.mutate(values, {
      onSuccess: (data) => {
        message.success(`欢迎回来，${data.username}！`)
        const from = (location.state as { from?: string } | null)?.from ?? '/books'
        navigate(from)
      },
      onError: (error) => message.error(firstError((error as { detail?: unknown }).detail)),
      onSettled: () => setLoading(false),
    })
  }

  return (
    <Card title="登录" style={{ maxWidth: 420, margin: '48px auto' }}>
      <Form onFinish={onFinish} layout="vertical">
        <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
          <Input autoFocus autoComplete="username" />
        </Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          登录
        </Button>
      </Form>
      <p style={{ marginTop: 16, marginBottom: 0 }}>
        演示账号：admin / admin1234（管理员）、reader / reader1234（读者）
      </p>
    </Card>
  )
}
