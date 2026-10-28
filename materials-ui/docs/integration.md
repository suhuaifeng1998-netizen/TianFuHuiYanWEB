# 接入当前业务回调

本包同步 2026-10-28 重启后的线上 Gradio 界面，包含 114 个组件、41 处事件绑定。16 个业务回调的签名见 [callback-signatures.json](callback-signatures.json)。

## 入口

```python
from materials_ui import UiCallbacks, create_ui, launch_options

# existing_ui 由使用方的原材料服务提供，不在本包内。
callbacks = UiCallbacks.from_namespace(existing_ui)
demo = create_ui(callbacks)
demo.queue().launch(**launch_options())
```

注册器保留原函数引用，不包装业务参数或结果。缺少回调会在创建界面前报错；也可显式传入 `UiCallbacks({名称: 原函数, ...})`。

`launch_options()` 保留线上 CSS 顺序和 head 模板，将依赖原网站根路径的公共 banner 样式内联为相同内容，Logo 也使用本地嵌入资源；无需额外创建公共资源路由。

`UiDefaults.restore_id` 保留为旧调用方的构造参数，但新版界面不再自动恢复指定历史。首次打开页面从空列表开始，当前页产生的对话通过最近列表选择。不要用该参数重新引入跨页面历史。

`create_ui` 会按线上版本为发送、停止和上传回调增加纯显示包装，并安装上传进度脚本。`UiCallbacks.from_namespace(existing_ui)` 识别原模块的 `_ui_experience_enabled` 标记，避免对已增强的生产回调再次包装。手工传入的回调若已经应用同样的增强，可使用 `UiCallbacks(handlers, presentation_enhanced=True)`；普通业务函数保持默认值即可。

显示包装保持业务参数、最终结果和输出数量，增加中间文本显示及附件确认标记，不加入模型、数据库或检索处理。

## 业务回调

| 回调 | 返回值 |
| --- | --- |
| `_initial_state` | 新建状态字典 |
| `_initialize_safe` | 状态文案、执行说明，共 2 项 |
| `_dispatch_composer_ui` | 生成器；20 项界面数据后追加待发送附件列表，共 21 项 |
| `_new_conversation_ui` / `_restore_recent_conversation_ui` | 同样顺序的前 20 项界面数据 |
| `_queue_attachments` | 合并后的待发送附件、附件文案，共 2 项 |
| `_clear_attachments` | 上传控件值、状态、附件文案，共 3 项 |
| `_recent_chat_choices` | 最近对话 HTML 更新、空列表提示、当前页对话 ID 列表，共 3 项；参数为 state、page_conversation_ids、gate |
| `_stop_feedback` | 保留已生成内容的聊天记录 |
| `_turn_literature_page` | 表格、详情、页码、状态，共 4 项 |
| `_literature_view_updates` | 打开状态、文献区、聊天区、按钮、显隐标记，共 5 项 |
| `_data_group_choices` | 参与比较组的选项更新 |
| `_answer_data_chat_option` | 聊天、状态；`gr.SelectData` 由 Gradio 注入 |
| `_run_data_action` | 文案、状态、图表、下载，共 4 项 |
| `_run_deduplicate_action` / `_import_cross_agent_dataset` | 文案、状态和 9 项数据面板更新，共 11 项 |

前 20 项的顺序：聊天、执行说明、会话状态、输入框、上传控件、审计展示、附件文案、文献表格、文献详情、文献页码、文献面板、数据字段、数据预览、数据摘要、数据面板、数值字段、X 字段、Y 字段、分组字段、去重字段。

事件外壳补充文献开关和附件状态，形成 24 项；发送时再追加 3 项运行控件状态，合计 27 项。新建和恢复导航包含 33 项输出。保持这些顺序，不能把 Gradio 位置数组改成随意顺序。

`_run_data_action` 的 action 为 `eda`、`describe`、`correlation`、`test`、`plot`、`report`、`export`，其余参数与原服务一致。

## 页面范围与取消

`interaction.py` 是纯界面代码：页面代次、请求版本、线程锁、Gradio 队列取消，以及最近列表的浏览器事件。它不包含材料查询、检索、统计或生产会话存储。

- 页面内的请求门控对象由 `gr.State` 为各会话独立复制。
- 新建、恢复、停止会取消旧请求并更新页面代次；旧请求迟到的输出会被丢弃。
- 最近列表改为 HTML 按钮，事件携带 `conversation_id`；恢复前检查其属于当前页面可见列表。
- 列表中的移除操作只隐藏当前页面条目，不删除生产快照。
- 发送按钮随输入、待发送附件和运行状态联动；停止按钮只在运行时显示。
- 上传先进入待发送列表，发送时再交给原业务回调。清除同时清理上传控件和待发送列表。

## API 客户端调试

浏览器会自动运行控件更新和 `.then()`；`gradio_client` 单次调用不会执行整条浏览器链，也不会替调用方回填非 State 控件的最新值。

`fresh_navigation` 返回的最后一项是页面代次。调用 `dispatch_shell` 时要按当前公开契约传入问题、聊天记录、该代次；不能始终使用配置中的初始值 0，否则请求会被当作旧页面请求忽略。发送后再执行 `recent_after_dispatch` 才会更新最近列表。

恢复/移除使用 HTML 组件的 select/delete 事件数据，不再使用旧 Radio 的字符串输入。接入与调试以本版本 `events.py` 和 Gradio 6.17.3 为准。

## 新增显示与上传反馈

`experience.py` 和相邻的 `ui_upload_progress.js` 必须一起交付。页面新增一条仅运行浏览器 JavaScript 的 load 事件，发送流刷新间隔为 0.04 秒；事件数从 40 增至 41。上传中暂时拦截发送、新建和清除，附件真正加入待发送列表后恢复。完成确认需要浏览器提供 `window.crypto.subtle`，请使用 localhost 开发代理或 HTTPS。

## 预览与生产

`preview_handlers.py` 只返回固定虚构数据。两类历史样例仅在本页面产生相应预览后进入最近列表，恢复内容仍是固定样例；不保存真实问答。生产必须注入原回调。

模型、数据库、检索、分析、会话持久化、密钥和部署配置继续由原服务维护。本次同步不修改线上业务结果，也不新增 HTTP 业务网关。
