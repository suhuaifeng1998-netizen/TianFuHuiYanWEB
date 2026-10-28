# 天府·慧研 Web 前端

从当前线上版本整理的网页与界面层源码，包含平台门户、医学知识问答、智能实验机械臂，以及独立 Gradio 材料界面开发包。两个 React 应用可分别开发和构建；完整问答、机械臂和材料业务仍依赖现有服务接口。

医学问答与机械臂前端已同步 2026-10-27 线上版本：医学页包含四川场景和历史会话检查，机械臂采用 Three.js 本地数字孪生，保留线上暂停/继续、复位及方向键映射。同步范围与开发配置差异见 [本次同步记录](docs/online-sync-20261027.md)。

材料筛选继续使用 Gradio，已同步 2026-10-28 线上界面的 114 个组件、41 处事件绑定，新增文本渐进显示、停止显示反馈及上传进度/完成确认，保留 Python 布局、页面取消、回调契约和固定数据预览。后端业务实现仍由使用方提供，不随仓库上传。详见 [材料页说明](materials-ui/README.md)。

## 目录

```text
apps/
  portal/          平台首页、对话、科学数据中心、医学知识问答
  robot/           智能实验机械臂 React 应用
materials-ui/
  materials_ui/    Python 界面定义、事件绑定、回调契约及预览处理
  preview.py       独立预览入口
  requirements.txt Gradio 界面运行依赖
  fragments/       banner 和 head HTML 片段
  styles/          从线上界面提取的外观样式
  scripts/         浏览器主题脚本
  assets/          独立运行所需的 banner CSS 与 Logo
  fixtures/        明确标记的虚构预览样例
  tests/           界面契约及预览回归
shared/            banner 样式、主题脚本和 Logo 公共资源
scripts/           本地安装、构建、预览和源码范围检查工具
docs/              交付范围与接口对接说明
```

## 本地开发

准备 Node.js 22 或更高版本及 npm。在仓库根目录执行以下命令，可连接现有线上服务：

```sh
npm run setup
npm run connect:online -- --target http://221.239.50.147:7860
npm run dev
```

门户地址为 `http://127.0.0.1:5173/`，医学知识问答位于 `/agent/medical/`。首页、对话和数据中心分别位于 `/`、`/chat`、`/data`；材料线上工作台通过本地 `/agent/materials/` 访问。

在另一个终端启动机械臂应用：

```sh
npm run dev:robot
```

机械臂开发地址为 `http://127.0.0.1:5174/`。门户与机械臂使用各自的依赖清单和锁文件，`setup` 会分别执行 `npm ci`。

两个服务运行后，在第三个终端执行 `npm run check:connection`；使用 `npm run check:connection -- --full` 可检查真实医学 SSE 与会话有效性、材料上传/下载与队列、机械臂 WebSocket、渲染姿态和 3D 模型。完整步骤、来源校验及生产部署区别见 [外部开发者接入指南](docs/external-development.md)，实测结果见 [验证记录](docs/external-verification.md)。

未连接 API 时，页面仍可加载外观，服务状态和业务控件按现有逻辑显示未连接或不可用。本仓库不提供模型、设备模拟器、知识库或 mock 后端。

## 材料 Gradio 界面预览

材料包可以单独复制使用，不需要 Node.js。先在 `materials-ui` 创建 Python 虚拟环境并安装 `requirements.txt`，然后运行 `python preview.py`；默认打开 `http://127.0.0.1:7865/`。Windows 和 Linux/macOS 的完整命令见 [材料界面 README](materials-ui/README.md)。

预览使用虚构数据，不运行模型、检索或统计计算。接入原业务回调后可继续使用原业务流程，方法见 [接入文档](materials-ui/docs/integration.md)。

在已激活对应 Python 环境时，也可从仓库根目录运行：

```sh
npm run preview:materials
npm run check:materials
```

## 接口和页面入口

在相应应用目录创建未提交的 `.env.local`，按需要设置变量；可参考各应用的 `.env.example`。

| 变量 | 位置 | 默认行为 |
| --- | --- | --- |
| `VITE_API_BASE` | 两个应用 | 留空时使用当前页面同源接口 |
| `VITE_DEV_PROXY_TARGET` | 两个应用 | 留空时不启用开发代理 |
| `VITE_ROBOT_ENTRY` | 门户 | `/agent/robot/` |
| `VITE_MATERIALS_ENTRY` | 门户 | `/agent/materials/` |

这些变量用于公开地址配置，不能存放 API 密钥、口令或令牌。`VITE_` 变量会进入浏览器代码，修改后需重启开发服务或重新构建。

开发时可保持 `VITE_API_BASE` 为空，通过 `VITE_DEV_PROXY_TARGET` 指向可用的接口服务；也可将 `VITE_API_BASE` 设为公开 API 根地址，由接口服务允许对应的跨域请求。机械臂还需要 WebSocket 遥测及 `/robot-assets/e05/` 模型资源。详细路径和流式响应要求见 [接口对接说明](docs/api-integration.md)。

`connect:online` 会将门户的 `VITE_ROBOT_ENTRY` 指向本地机械臂页面，将 `VITE_MATERIALS_ENTRY` 设为本地代理路径。材料的 `7865` 独立预览仍使用固定样例；通过 `5173/agent/materials/` 访问的是线上完整工作台，两者用途不同。

## 检查、构建和预览

```sh
npm run check:source
npm run build
npm run preview
```

`build` 分别构建两个应用并合并至根目录 `dist/`：门户位于根路径，机械臂位于 `/agent/robot/`。`preview` 默认使用端口 `4173`，用于查看合并后的静态产物。材料界面使用单独的 Python/Gradio 运行入口，不打进 React 静态目录。

预览只提供静态页面，不会启动 API，也不会使用开发代理。需要完整交互时，应先配置可访问的公开 API。实际托管时，门户的 `/chat`、`/data` 和 `/agent/medical/` 等前端路由需要返回门户入口，机械臂路径需要返回对应应用入口。

## 上传范围

保留前端源码、Python/Gradio 界面定义及固定数据预览、图片、依赖声明、构建配置和开发说明。后端业务实现、模型权重、数据库、知识库原始数据、用户记录、密钥和服务器配置不在交付范围内。`node_modules/`、`dist/` 和本地 `.env.local` 不提交。

公共资源和各应用现有样式按线上快照保留，未借此次整理重构页面或改写业务逻辑。范围及材料页限制详见 [前端交付范围](docs/frontend-scope.md)。

本仓库用于在 GitHub 保存前端源码；上传到 `main` 不会自动发布 GitHub Pages 网站。
