# 天府·慧研 Web 前端

从当前线上版本整理的纯前端源码，包含平台门户、医学知识问答、智能实验机械臂，以及材料筛选页面的外观资源。两个 React 应用可分别开发和构建；完整问答、机械臂和材料业务仍依赖现有服务接口。

材料筛选采用方案 A：仅提取 HTML 片段、CSS 和浏览器主题脚本，未将 Gradio 工作台迁移为独立 React 应用。详见 [材料页说明](materials-ui/README.md)。

## 目录

```text
apps/
  portal/          平台首页、对话、科学数据中心、医学知识问答
  robot/           智能实验机械臂 React 应用
materials-ui/
  fragments/       材料页 banner 和 head HTML 片段
  styles/          从线上界面提取的外观样式
  scripts/         浏览器主题脚本
shared/            banner 样式、主题脚本和 Logo 公共资源
scripts/           本地安装、构建、预览和源码范围检查工具
docs/              交付范围与接口对接说明
```

## 本地开发

准备 Node.js 20.19 或更高版本及 npm，建议使用 Node.js 22 或更高版本。在仓库根目录执行：

```sh
npm run setup
npm run dev
```

门户默认地址为 `http://localhost:5173/`，医学知识问答位于 `/agent/medical/`。首页、对话和数据中心分别位于 `/`、`/chat`、`/data`。

在另一个终端启动机械臂应用：

```sh
npm run dev:robot
```

机械臂开发端口为 `5174`。门户与机械臂使用各自的依赖清单和锁文件，`setup` 会分别执行 `npm ci`。

未连接 API 时，页面仍可加载外观，服务状态和业务控件按现有逻辑显示未连接或不可用。本仓库不提供模型、设备模拟器、知识库或 mock 后端。

## 接口和页面入口

在相应应用目录创建未提交的 `.env.local`，按需要设置变量；可参考各应用的 `.env.example`。

| 变量 | 位置 | 默认行为 |
| --- | --- | --- |
| `VITE_API_BASE` | 两个应用 | 留空时使用当前页面同源接口 |
| `VITE_DEV_PROXY_TARGET` | 两个应用 | 留空时不启用开发代理 |
| `VITE_ROBOT_ENTRY` | 门户 | `/agent/robot/` |
| `VITE_MATERIALS_ENTRY` | 门户 | `/agent/materials/` |

这些变量用于公开地址配置，不能存放 API 密钥、口令或令牌。`VITE_` 变量会进入浏览器代码，修改后需重启开发服务或重新构建。

开发时可保持 `VITE_API_BASE` 为空，通过 `VITE_DEV_PROXY_TARGET` 指向可用的接口服务；也可将 `VITE_API_BASE` 设为公开 API 根地址，由接口服务允许对应的跨域请求。机械臂还需要 WebSocket 和视频流。详细路径和流式响应要求见 [接口对接说明](docs/api-integration.md)。

同时运行两个开发应用时，可将门户的 `VITE_ROBOT_ENTRY` 指向机械臂开发地址。材料页入口须指向已有 Gradio 服务；此仓库没有可独立运行的完整材料页。

## 检查、构建和预览

```sh
npm run check:source
npm run build
npm run preview
```

`build` 分别构建两个应用并合并至根目录 `dist/`：门户位于根路径，机械臂位于 `/agent/robot/`。`preview` 默认使用端口 `4173`，用于查看合并后的静态产物。构建产物不会生成完整材料工作台。

预览只提供静态页面，不会启动 API，也不会使用开发代理。需要完整交互时，应先配置可访问的公开 API。实际托管时，门户的 `/chat`、`/data` 和 `/agent/medical/` 等前端路由需要返回门户入口，机械臂路径需要返回对应应用入口。

## 上传范围

保留前端源码、图片、依赖声明和锁文件、Vite/TypeScript 构建配置、浏览器脚本及开发说明。后端代码、Python 服务、模型权重、数据库、知识库原始数据、用户记录、密钥和服务器配置均不在交付范围内。`node_modules/`、`dist/` 和本地 `.env.local` 不提交。

公共资源和各应用现有样式按线上快照保留，未借此次整理重构页面或改写业务逻辑。范围及材料页限制详见 [前端交付范围](docs/frontend-scope.md)。

本仓库用于在 GitHub 保存前端源码；上传到 `main` 不会自动发布 GitHub Pages 网站。
