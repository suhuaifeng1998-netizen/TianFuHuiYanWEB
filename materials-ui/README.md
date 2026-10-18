# 材料筛选页面外观资源

此目录按方案 A 从当前线上 Gradio 界面提取纯前端部分，仅用于保存、阅读和复用外观资源，不能独立启动完整材料筛选工作台。

## 文件说明

| 文件 | 内容 |
| --- | --- |
| `fragments/banner.html` | 页面顶部品牌、材料筛选标题和外观菜单的 HTML 片段 |
| `fragments/head.html` | 颜色方案、公共 banner 样式和浏览器主题脚本的引用片段 |
| `styles/base.css` | 原页面组件和布局的基础外观规则 |
| `styles/theme.css` | 浅色、深色主题和颜色变量 |
| `styles/layout.css` | 当前工作台布局与控件样式覆盖 |
| `scripts/theme.js` | 浏览器主题选择、菜单交互及系统主题同步 |

公共 banner 样式和 Logo 位于仓库根目录 `shared/`。HTML 片段保留页面使用的资源引用，使用者需要在实际集成环境将这些路径指向对应静态资源；片段文件本身不是完整页面入口。

## 复用边界

这些 CSS 依赖原 Gradio 界面生成的结构，以及 `agent-banner`、`app-layout`、`left-sidebar` 等元素 ID。保留对应结构和样式加载顺序后，才能复用布局效果：基础样式、主题样式、布局覆盖样式，并加载公共 banner 样式。

主题脚本读取 `localStorage` 中的 `ai4s-theme`，支持 `light`、`dark` 和 `system`，与其他页面的主题偏好保持一致。它只控制浏览器外观，不请求业务接口。

此目录不包含 Python 文件、Gradio 组件声明、业务回调、问答或检索实现，也不包含上传文件处理、知识库和会话数据。没有这些服务端部分，仅打开片段或加载 CSS 不能获得材料分析、上传、历史会话或流式回答功能。

根目录的安装和构建命令仅处理两个 React 应用，不将这里的资源转换为独立材料页。门户默认仍链接 `/agent/materials/`，完整工作台需要由现有 Gradio 服务提供；也可通过门户的 `VITE_MATERIALS_ENTRY` 指定其公开地址。

完整范围见 [前端交付范围](../docs/frontend-scope.md)，接口关系见 [前端接口对接](../docs/api-integration.md)。
