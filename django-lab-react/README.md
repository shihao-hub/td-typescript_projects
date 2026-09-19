# django-lab-react — django-lab 的 React SPA 前端

> 同一个图书馆业务的两张脸：django-lab（`python_projects/django-lab`，Django SSR + DRF API）负责数据与接口，本项目用 React 消费它的 `/api/`，演示「SSR 一体 → 前后端分离」的演进终点。

## 快速开始

需要两个终端，先起后端再起前端：

```powershell
# 终端 1：Django 后端（python_projects/django-lab）
uv run manage.py migrate
uv run manage.py seed_demo        # 演示数据 + 账号（幂等）
uv run manage.py runserver 8888

# 终端 2：React 前端（本目录）
pnpm install
pnpm dev                          # http://127.0.0.1:5173
```

演示账号：admin / admin1234（管理员）、reader / reader1234（读者）。

## 认证方案

Session + CSRF（零额外依赖）：开发期 Vite 把 `/api` 代理到 `127.0.0.1:8888`，前后端同源共享 Cookie。

- 应用启动先 `GET /api/auth/me/`（后端挂 `ensure_csrf_cookie`）→ 拿到 `csrftoken` cookie
- 所有 POST 由 `src/lib/api.ts` 现读 cookie 填 `X-CSRFToken` 头（登录成功后 Django 会轮换 token，现读现用天然兼容）
- 登录 / 登出 / 当前用户：`/api/auth/login|logout|me`

## 技术栈与结构

| 库 | 职责 |
|---|---|
| React 19 + TypeScript | UI |
| antd 6 | 组件库（Layout/Card/Table/Form/Statistic…） |
| TanStack Query 5 | 服务端状态：缓存、分页、借还后失效重取 |
| React Router 7 | 客户端路由 |
| Vite 8 | 构建 + 开发代理 |

```
src/
├─ lib/
│  ├─ api.ts        # fetch 封装：/api 前缀、JSON、CSRF 头、错误归一
│  ├─ queries.ts    # 全部 useQuery/useMutation hooks（服务端状态唯一出入口）
│  └─ types.ts      # 与后端 serializer 字段一一对应的镜像类型
├─ components/
│  ├─ AppLayout.tsx # antd Layout：导航、搜索框、登录态
│  └─ BookGrid.tsx  # 图书卡片网格（列表页与作者详情复用）
└─ pages/           # 列表/详情/借阅/作者/看板/我的借阅/登录
```

## 页面对照（与 SSR 版功能对齐）

| 页面 | 路由 | 数据来源 |
|---|---|---|
| 图书列表（搜索+分页） | `/books?q=&page=` | `GET /api/books/?search=&page=&page_size=9` |
| 图书详情 + 借阅 | `/books/:slug` | `GET /api/books/{slug}/` + `POST .../borrow/` |
| 作者列表 / 详情 | `/authors`、`/authors/:id` | `GET /api/authors/` + `?author=` 过滤 |
| 运营看板 | `/dashboard` | `GET /api/books/stats/` + 最新 5 本 |
| 我的借阅 + 还书 | `/my/loans` | `GET /api/loans/` + `POST /api/loans/{id}/return/` |
| 登录 | `/login` | `POST /api/auth/login/` |

## 常用命令

```powershell
pnpm dev        # 开发服务器（代理已配好）
pnpm build      # tsc 类型检查 + 生产构建
pnpm lint       # oxlint
pnpm preview    # 预览生产构建
```
