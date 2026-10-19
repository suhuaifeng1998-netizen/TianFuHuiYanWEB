# 前端接口对接

本说明记录当前前端消费的接口，便于对接已有服务。仓库只包含浏览器侧请求代码和类型，不包含接口实现。

从 GitHub 下载后连接现有线上服务，请先按 [外部开发者接入指南](external-development.md) 执行 `connect:online`，启动两个开发服务器。该流程已验证医学 SSE、材料 Gradio 队列/文件，以及机械臂 WebSocket/视频；见 [验证记录](external-verification.md)。

## 公开地址配置

两个应用各自在 `.env.local` 中读取配置，并提供 `.env.example` 作为模板。

| 变量 | 用途 |
| --- | --- |
| `VITE_API_BASE` | 公开 API 根地址或同源路径前缀；留空使用当前页面同源地址 |
| `VITE_DEV_PROXY_TARGET` | Vite 开发代理目标；留空禁用代理，生产构建和静态预览不使用此变量代理请求 |
| `VITE_ROBOT_ENTRY` | 仅门户使用，覆盖智能体广场的机械臂入口，默认 `/agent/robot/` |
| `VITE_MATERIALS_ENTRY` | 仅门户使用，覆盖材料页入口，默认 `/agent/materials/` |

开发代理模式下，保持 `VITE_API_BASE` 为空，设置 `VITE_DEV_PROXY_TARGET` 为可访问的接口服务根地址。直接访问跨域 API 时，设置 `VITE_API_BASE` 为公开接口地址，并由接口服务处理对应的跨域访问。

仓库的开发代理在改写 Host 时同步处理 HTTP/WebSocket Origin，拒绝其他页面来源使用本地代理。门户还代理 `/agent/materials`，并将 Gradio HTML、配置中的工作台根地址保持在本机。该逻辑只在开发服务器中运行，不会编译为浏览器业务代码，也不会自动为任意生产域名开启 CORS。

不要把密钥放入任何 `VITE_` 变量。这些值会公开在浏览器可下载的 JavaScript 中。模型服务或第三方平台所需的私密凭据应留在接口服务内部。

## 平台门户与通用对话

入口代码：`apps/portal/src/main.tsx`。

| 方法与路径 | 用途及前端消费内容 |
| --- | --- |
| `GET /api/status` | 读取总体 `state`、`message` 以及各模型的 `id`、`label`、`state`、`message` |
| `POST /api/chat` | 提交 `{ model, messages, max_tokens }`，读取流式回答 |

`model` 使用前端标识 `base` 或 `final`。消息正文支持普通字符串，或包含 `text` 和 `image_url` 的多模态内容数组。用户图片在浏览器读取和缩放后以 data URL 随请求发送，不依赖本仓库提供文件上传服务。

通用对话按 SSE 格式消费响应：事件之间空行分隔，`data:` 是 JSON。`meta` 提供模型来源信息；`delta` 的 `content` 追加到回答；`done` 表示结束并可带 `finish_reason`；`error` 的 `message` 用于显示错误。前端也识别 `data: [DONE]`。接口需要允许浏览器持续读取响应流。

## 医学知识问答

入口代码：`apps/portal/src/MedicalAgent.tsx`；资料标题、来源与引用展示逻辑位于 `medicalPresentation.ts`。

| 方法与路径 | 用途 |
| --- | --- |
| `GET /api/medical/status` | 读取服务状态及知识库概况，包括可选的地区专题列表 |
| `GET /api/medical/questions` | 读取推荐问题；可带 `exclude` 和 `regional_topic` 查询参数 |
| `POST /api/medical/followups` | 以 `{ session_id, answer_id, exclude }` 请求已有回答的追问建议 |
| `POST /api/medical/ask` | 以 `{ session_id, question, parent_answer_id }` 请求医学回答流；起始问题的 `parent_answer_id` 为 `null` |

医学回答流同样按 SSE 格式读取：

| 事件 | 前端处理 |
| --- | --- |
| `meta` | 接收回答标识、追问层级、主题、证据状态及 `sources` 引用资料等元数据 |
| `evidence_comparison` | 更新回答元数据中的证据比较结果 |
| `delta` | 追加 `content` 文本 |
| `replace` | 以 `content` 替换当前回答文本 |
| `done` | 标记回答完整结束 |
| `error` | 显示 `message` 并标记失败 |

当前前端会将缺少结束事件、没有正文或中途失败的响应视为不完整回答。资料引用需与 `sources` 中的标识及 URL 对应。完整字段定义以组件中的 TypeScript 类型为准。

## 智能实验机械臂

主要入口为 `apps/robot/src/api.ts`，数据类型位于 `apps/robot/src/types.ts`。附加手动控制和手势请求分别位于 `ManualControl.tsx` 与 `GestureOverlay.tsx`，关节标注请求位于 `ManualJointLabels.tsx`。

以下 `{id}` 表示运行时创建的会话 ID。

| 方法与路径 | 用途 |
| --- | --- |
| `GET /health` | 读取可用运行模式及模式设置 |
| `POST /api/sessions` | 创建会话 |
| `GET /api/sessions/{id}` | 恢复会话快照 |
| `PUT /api/sessions/{id}/robot/mode` | 切换 `simulation` 或 `real` 模式 |
| `POST /api/sessions/{id}/commands/text` | 发送文字指令，可带 `image_data_url` 和 `image_name` |
| `POST /api/sessions/{id}/commands/random-suggestion` | 获取随机动作建议 |
| `GET /api/asr/status` | 读取语音服务能力与可用状态 |
| `POST /api/sessions/{id}/commands/speech` | 发送音频二进制；使用音频 MIME 类型和 `X-Audio-Duration-Ms` 请求头 |
| `POST /api/sessions/{id}/confirm` | 确认当前待执行动作，可带 `fingerprint` |
| `POST /api/sessions/{id}/cancel` | 取消当前动作 |
| `POST /api/sessions/{id}/stop` | 请求停止 |
| `POST /api/sessions/{id}/estop` | 请求急停 |
| `POST /api/sessions/{id}/reset-estop` | 请求重置仿真急停状态 |
| `POST /api/sessions/{id}/robot/enabled` | 请求使能或去使能 |
| `GET /api/sessions/{id}/robot/telemetry` | 获取机械臂遥测 |
| `GET /api/sessions/{id}/robot/camera` | 读取视角状态 |
| `PUT /api/sessions/{id}/robot/camera` | 调整视角 |
| `POST /api/sessions/{id}/robot/trajectory/clear` | 清除轨迹显示 |
| `GET /api/sessions/{id}/robot/stream.mjpeg` | 视频流，带 `attempt`、`mode` 查询参数 |

WebSocket 路径为 `/ws/sessions/{id}`。浏览器接收的 JSON 消息中，`type: "telemetry"` 按遥测处理，其他消息按会话快照处理。跨域 API 地址还需要对应的 WebSocket 连通性；HTTPS 页面应使用可访问的 HTTPS/WSS 资源。

手动控制使用 `/api/sessions/{id}/manual`：根路径以 `GET` 查询状态，`/acquire`、`/input`、`/heartbeat`、`/release` 以 `POST` 调用；`GET /api/sessions/{id}/manual/joint-labels` 获取视频中的关节标注。控制令牌由会话服务在运行时返回，不是仓库中保存的固定凭据。

手势操作以 `POST /api/sessions/{id}/commands/gesture` 提交摄像头画面 data URL 和采集时间，并使用 `/gesture/reset` 和 `/gesture/voice-activity` 同步状态。语音和手势采集需要浏览器授予相应权限；摄像头、麦克风功能需要 HTTPS 或浏览器认可的本地安全上下文。

仅部署静态前端不会创建机械臂会话、产生视频或连接设备，以上功能均由已有接口服务提供。

## 材料筛选

`materials-ui` 提供独立 Gradio 界面开发包，不新增 HTTP 业务网关。界面通过 `UiCallbacks` 接收 16 个原业务处理函数，保留原控件、输入输出顺序、事件链和取消关系。详见 [材料回调接入说明](../materials-ui/docs/integration.md)。

`preview.py` 接入固定样例处理函数，可在没有模型、数据库和检索服务时修改界面。真实运行时改由使用方传入原处理函数，不能用预览响应代替业务逻辑。

门户的 `VITE_MATERIALS_ENTRY` 指向运行该界面的公开入口。Python 界面包独立启动，不由根目录的 React 静态构建命令生成。

线上接入模式下，该变量为 `/agent/materials/`，门户开发代理转发完整线上 Gradio 页面、资源、上传、队列和下载。无需把原业务函数放进本地开发包；本地 `preview.py` 仍然是固定数据预览。

## 对接时的检查点

- 页面和静态资源可访问，门户前端路由与 `/agent/robot/` 指向各自应用。
- API 返回前端期望的数据字段和错误信息，SSE 流可以持续读取并正确结束。
- 机械臂 WebSocket、MJPEG 流及运行时会话请求可达。
- 配置地址使用公开入口，不包含凭据；跨域访问规则由已有服务处理。

以上是对接要求，不表示仓库自带服务或已在任意托管环境完成业务验收。
