# 外部开发者连接线上接口

从 GitHub 下载代码后，可以用本机开发服务器连接现有线上服务。此流程不需要 SSH、服务器环境文件或模型密钥。建议使用 Node.js 22 或更新版本；完整 WebSocket 自检需要该版本。

## 从下载到运行

使用 Git 克隆并启动：

```sh
git clone https://github.com/suhuaifeng1998-netizen/TianFuHuiYanWEB.git
cd TianFuHuiYanWEB
npm run setup
npm run connect:online -- --target http://221.239.50.147:7860
npm run dev
```

另开终端，进入同一个仓库目录：

```sh
npm run dev:robot
```

如果通过 GitHub 的 Download ZIP 下载，解压后从 `npm run setup` 开始执行即可。

`connect:online` 在两个应用中生成 Git 忽略的 `.env.local`，保持 `VITE_API_BASE` 为空，配置开发代理，并将门户的机械臂入口指向本地 `5174`。它只更新下列接入变量，保留文件中其他配置。修改后应重启已运行的开发服务器。

| 页面 | 本地访问地址 | 代码与业务来源 |
| --- | --- | --- |
| 医学知识问答 | `http://127.0.0.1:5173/agent/medical/` | 本地 React 页面调用线上医学接口 |
| 智能实验机械臂 | `http://127.0.0.1:5174/` | 本地 React/Three.js 页面读取线上会话、遥测、WebSocket 和 STL 模型 |
| 材料筛选 | `http://127.0.0.1:5173/agent/materials/` | 通过本地代理访问线上完整 Gradio 工作台 |

门户首页为 `http://127.0.0.1:5173/`，智能体选择入口也已对应上述地址。端口被占用时开发服务器会明确报错，不会静默换到另一个端口。

## 生成的本地配置

`apps/portal/.env.local`：

```dotenv
VITE_API_BASE=
VITE_DEV_PROXY_TARGET=http://221.239.50.147:7860
VITE_ROBOT_ENTRY=http://127.0.0.1:5174/
VITE_MATERIALS_ENTRY=/agent/materials/
```

`apps/robot/.env.local`：

```dotenv
VITE_API_BASE=
VITE_DEV_PROXY_TARGET=http://221.239.50.147:7860
```

上述地址是公开 Web/API 入口。服务地址变化时，重新运行 `connect:online -- --target 新的公开入口`。配置只接受不含凭据、路径、查询串的 HTTP(S) origin。

## 为什么必须使用开发代理

浏览器请求本机 `/api/...`，Vite 再向配置好的线上地址转发。代理同步处理目标 Host 与 Origin，并在本地拒绝来自其他网页来源的接口请求；WebSocket 采用相同来源检查。两个开发服务器均默认只监听 `127.0.0.1`。

这解决的是远程开发接入，不依赖开发者的公网源 IP，也不需要修改线上来源白名单或开放所有 CORS 来源。

代理范围：

- 两个应用：`/api`、`/health`、`/ws`、`/robot-assets`，包括医学 SSE、机械臂 WebSocket、音频请求和数字孪生 STL 模型。
- 门户额外转发 `/agent/materials`：Gradio 页面、静态资源、上传、队列 SSE 和文件下载。
- 材料 HTML 和 `/config` 中的绝对工作台地址会改成本地地址，避免后续请求绕过代理。其他流式响应直接转发，不等待整个响应完成。

不要同时把 `VITE_API_BASE` 设置为线上完整地址，否则浏览器会绕过开发代理，重新遇到 Origin/CORS 限制。不要在浏览器代码中尝试手动设置 Origin，也不要使用 `mode: 'no-cors'`。

## 材料界面开发与线上业务的区别

线上业务连接入口是 `5173/agent/materials/`，该页面由线上 Gradio 服务提供。本地修改 `materials-ui` 中的 Python/CSS 不会改变该线上页面。

要修改本地材料界面，按 [材料包 README](../materials-ui/README.md) 运行 `python preview.py`，地址为 `127.0.0.1:7865`。此入口使用固定虚构数据，不会调用真实业务。

要把修改后的 Gradio 界面用于真实业务，仍需由材料服务维护者按 [回调接入文档](../materials-ui/docs/integration.md) 注入原业务函数并发布。仓库不包含这些业务函数，也没有新增通用 `/api/materials` 网关。

## 自检与调试

两个开发服务器运行后，在第三个终端执行：

```sh
npm run check:connection
npm run check:connection -- --full
```

基础检查读取服务状态、推荐问题、材料配置和接口契约，并用空医学请求确认得到参数校验 422，而不是来源拒绝 403。

材料队列检查会识别新版 `recent_after_dispatch` 或旧版 `_recent_chat_choices`，按实际 State 输入数量构造请求；不固定使用旧接口名称或旧参数数量。

`--full` 还会上传并下载一个合成 CSV，执行一次无业务查询的材料历史列表队列，生成一条医学示例回答并检查历史会话有效性，再创建独立机械臂会话读取遥测、WebSocket 消息、六段渲染姿态和七个 STL 模型。它不发送运动、使能、手动控制或真实设备操作指令。

需要检查代理本身而不连接线上服务时运行：

```sh
npm run test:connection
```

该命令使用本地测试服务和两套实际 Vite 版本检查 HTTP、来源处理、流式响应、上传、下载及 WebSocket。

浏览器开发者工具中，应看到医学请求发往 `127.0.0.1:5173/api/medical/...`，机械臂请求发往 `127.0.0.1:5174/api/...` 和 `/ws/...`，材料请求保持 `/agent/materials/...`。

| 现象 | 排查与处理 |
| --- | --- |
| `请从本站页面发起请求。` | 检查 `VITE_API_BASE` 是否为空、配置后是否重启、请求是否绕过本地代理；仅配置 `changeOrigin` 不足以处理 Origin |
| `请从当前本地开发页面发起请求。` | 请求来自与本机开发服务器不同的页面来源；从上表本地地址打开页面 |
| 机械臂入口打不开 | 确认第二个终端的 `npm run dev:robot` 正在运行，5174 未被占用 |
| 503 / 工作台暂不可用 | 线上对应服务不可用；代理不能代替业务服务，需要服务维护者恢复 |
| 材料页面能打开但后续请求跨域 | 检查是否使用更新后的代理，`/config` 中 `root` 应为 `http://127.0.0.1:5173/agent/materials` |
| 数字孪生或遥测未连接 | 检查 5174 的 `/health`、`/ws/sessions/...`、`/robot-assets/e05/elfin_base.STL`，以及遥测中的 `render_link_poses`；确认浏览器支持 WebGL |
| `npm run preview` 不连接线上接口 | 此命令只预览静态构建，不启用开发代理；在线联调用 `npm run dev` |
| 端口已占用 | 结束占用进程或同时调整端口和入口配置；不要只更改一个端口 |

## 独立部署到自己的域名

Vite 开发代理不会进入 `dist/`。生产部署应由维护者提供同源网关，覆盖上述 HTTP、SSE、WebSocket、模型资源和材料工作台路径，并正确处理公开地址与来源；这类服务器配置不随前端仓库发布。

若选择浏览器直接跨域连接线上服务，需要服务维护者为明确的前端 origin 配置来源白名单、CORS 预检和响应头，并另行核对 WebSocket 与材料页面资源地址。仅修改 `VITE_API_BASE` 不会自动获得这些支持。本次交付已验证的是上述本机开发接入流程。

最近一次实际验证见 [接入验证记录](external-verification.md)，接口字段见 [接口对接说明](api-integration.md)。
