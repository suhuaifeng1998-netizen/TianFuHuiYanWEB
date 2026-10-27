# 修改与交接指南

## 开始接手

1. 按上级 README 安装 Python 虚拟环境和固定版本依赖。
2. 运行 `python preview.py`，使用固定数据预览；不需要模型或数据库。
3. 运行 `python -m unittest discover -s tests -v`，确认 18 项回归通过。
4. 真正连接现有线上业务时，按仓库的外部开发接入文档运行本地代理；该入口与固定数据预览不同。

## 修改位置

| 目标 | 文件 | 要点 |
| --- | --- | --- |
| 字体、主题、间距、banner | `styles/`、`fragments/banner.html` | CSS 由 `assets.py` 按线上顺序加载；保留组件 ID |
| 布局、文案、默认显隐 | `materials_ui/layout.py` | 包含 114 个组件，隐藏状态也参与事件契约 |
| 示例问题和轮换 | `materials_ui/examples.py` | 当前 7 个示例按钮，只填入问题、不自动发送 |
| 发送、停止、恢复、上传及面板联动 | `materials_ui/events.py` | 保留输入输出顺序、页面代次和 `.then()` |
| 页面隔离、取消、最近条目事件 | `materials_ui/interaction.py` | Gradio 内部队列接口与 6.17.3 配套，不独立升级依赖 |
| 真实业务函数 | `contracts.py`、`docs/callback-signatures.json` | 通过 16 个回调注入，包内没有其实现 |
| 固定预览 | `preview_handlers.py`、`fixtures/` | 不加入真实用户数据、业务计算或私密配置 |

`styles/` 保存材料页按线上顺序拼接的样式；`assets/agent-masthead.css` 是线上额外加载的公共 banner 样式。独立预览通过 `assets.py` 将该文件内联到 head，修改 banner 时也要检查它。

## 必须保留的行为

- 首次打开/刷新从本页空列表开始；新建清空当前显示，已在本页产生的记录可继续选择。
- 最近列表 HTML 的选择和移除都校验页面可见 ID；移除不删除生产快照。
- 附件先排入待发送列表，清除后不会继续参与下一次发送。
- 输入和附件决定发送是否可用；运行时显示停止，停止保留已生成部分。
- 停止、新建、恢复后，旧请求不能把结果写到新页面。
- 文献详情和聊天正确切换，分页及返回正常。
- 数据字段、分组、图表、报告、下载和跨 Agent 导入的回调位置不变。

## 修改后验证

`tests/ui_contract.json` 是本次线上结构基线。纯样式调整不应改变事件图；确需改组件或事件时，先审查差异，再更新基线。

界面回归覆盖取消所属事件、页面隔离、迟到结果、代次传递、附件和下载。需要恢复真实业务时，按 [integration.md](integration.md) 在测试环境注入原回调，再验收查询、文献和分析结果。

复制整个 `materials-ui` 目录即可单独预览。不要遗漏 styles、fragments、assets、fixtures；不要把生产业务模块、用户记录、环境文件或启动配置放进本包。
