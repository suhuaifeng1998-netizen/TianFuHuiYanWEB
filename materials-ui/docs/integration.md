# 接入原业务回调

## 入口

```python
from materials_ui import UiCallbacks, UiDefaults, create_ui, launch_options

# existing_ui 是使用方原服务中已有的回调模块或对象，不由本包提供。
callbacks = UiCallbacks.from_namespace(existing_ui)
demo = create_ui(callbacks, UiDefaults(restore_id=""))

# 由使用方的现有启动入口调用。
demo.launch(**launch_options())
```

将整个 `materials-ui` 目录加入使用方的 Python 模块搜索路径即可导入。也可显式传入 `UiCallbacks({回调名: 现有处理函数, ...})`。注册器保留原函数引用，不包装参数、不转换返回结果，不导入业务模块。

缺少必需回调会在创建界面前报错。`UiDefaults.restore_id` 保留启动恢复能力，恢复目标由使用方传入；界面包不读取服务器环境配置。

`launch_options()` 提供主题、CSS、浏览器脚本及本地 Logo。原有访问入口、运行环境、会话存储和服务启动方式由使用方继续管理，不在仓库中。

## 必需回调

准确参数名称与顺序见 [callback-signatures.json](callback-signatures.json)。

| 回调 | 返回值 |
| --- | --- |
| `_initial_state` | 新建的状态字典 |
| `_initialize_safe` | 状态文案、执行说明，共 2 项 |
| `_dispatch_ui` | 生成器，每次返回下述 20 项界面数据 |
| `_new_conversation_ui` / `_restore_recent_conversation_ui` | 同样顺序的 20 项数据 |
| `_recent_chat_choices` | 历史选择器更新、空历史提示，共 2 项 |
| `_stop_feedback` | 保留已完成内容的聊天记录 |
| `_attachment_markdown` | 附件状态文案 |
| `_clear_attachments` | 文件值、状态、附件文案，共 3 项 |
| `_turn_literature_page` | 表格、详情、页码、状态，共 4 项 |
| `_literature_view_updates` | 打开状态、面板、聊天、按钮、显隐标记，共 5 项 |
| `_data_group_choices` | 参与比较组的控件更新 |
| `_answer_data_chat_option` | 聊天记录、状态；事件参数由 `gr.SelectData` 注入 |
| `_run_data_action` | 文案、状态、图表、下载，共 4 项 |
| `_run_deduplicate_action` / `_import_cross_agent_dataset` | 文案、状态和 9 项数据面板更新，共 11 项 |

20 项数据顺序：聊天、执行说明、会话状态、输入框、文件控件、审计展示、附件文案、文献表格、文献详情、文献页码、文献面板更新、数据字段、数据预览、数据摘要、数据面板更新、数值字段选项、X 字段、Y 字段、分组字段、去重字段。

`events.py` 保留原界面封装：发送或恢复时关闭文献面板，补充文献开关状态、按钮及显隐标记，形成 23 个控件输出。不要将这些界面封装重新放进业务算法。

`_run_data_action` 的首个 `action` 由按钮固定为 `eda`、`describe`、`correlation`、`test`、`plot`、`report` 或 `export`。其他参数仍按原顺序传递；State 和选择事件由 Gradio 管理。

## 保持原流程

- 初始化 → 可选启动恢复 → 更新历史选项。
- 发送或回车 → 流式界面结果 → 更新历史选项。
- 恢复只展示保存记录；全文续跑仍由原服务及用户后续操作决定。
- 停止沿用原发送事件和回车事件的 `cancels` 关系。
- 上传先展示状态，发送时由原函数识别附件；清除、新建和示例游标分别处理。

浏览器会执行这些事件链。调试时使用 Gradio API 客户端逐个调用端点，应自行复现初始化及历史选项更新顺序，单次端点调用不会自动代表整条浏览器链。

## 预览与真实服务

`preview_handlers.py` 仅返回固定样例，供界面开发和交接使用。生产应注入原处理函数，真实会话、文献、数据和产物继续由原服务管理。本包没有 HTTP 业务网关、数据库、模型调用或统计算法。
