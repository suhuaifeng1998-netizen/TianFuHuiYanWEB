"""Current online layout; business handlers are injected separately."""
from dataclasses import dataclass
from typing import Any
import gradio as gr
from .assets import banner_html
from .contracts import UiCallbacks, UiDefaults
from .examples import EXAMPLE_CATEGORIES
from .interaction import _PageRequestGate, RECENT_CHAT_JS, RECENT_CHAT_CSS

MODE_AUTO = '自动判断'

@dataclass
class UiLayout:
    demo: gr.Blocks
    controls: dict[str, Any]

def build_layout(callbacks: UiCallbacks, defaults: UiDefaults) -> UiLayout:
    _initial_state = callbacks.require("_initial_state")
    AGENT_BANNER_HTML = banner_html()
    demo = gr.Blocks(title=defaults.title)
    with demo:
        session_state = gr.State(value=_initial_state())
        pending_files = gr.State(value=[])
        request_running = gr.State(value=False)
        page_version = gr.Number(value=0, precision=0, visible=False)
        request_gate = gr.State(
            value=_PageRequestGate(), delete_callback=lambda gate: gate.cancel(),
        )
        examples_visible = gr.State(value=False)
        example_cursors = gr.State(value={})
        page_conversation_ids = gr.State(value=[])
        literature_open = gr.State(value=False)
        quick_buttons: list[tuple[gr.Button, str]] = []
        gr.HTML(AGENT_BANNER_HTML, elem_id="agent-banner")
        with gr.Row(elem_id="app-layout"):
            with gr.Column(scale=1, min_width=256, elem_id="left-sidebar"):
                new_button = gr.Button(
                    "＋ 新建对话", size="sm", scale=0, interactive=True,
                    elem_id="new-chat"
                )
                gr.Markdown("最近对话", elem_id="recent-heading")
                recent_empty = gr.Markdown(
                    "这里只显示当前页面的对话。\n\n刷新会清空列表，已保存快照保留。",
                    elem_id="recent-empty",
                )
                recent_chats = gr.HTML(
                    value="", js_on_load=RECENT_CHAT_JS, css_template=RECENT_CHAT_CSS,
                    show_label=False, container=False, elem_id="recent-chats",
                )
                literature_toggle = gr.Button(
                    "文献详情", size="sm", interactive=False,
                    elem_id="literature-toggle",
                )
                # Defaults remain server-side inputs, not exposed settings controls.
                mode = gr.State(MODE_AUTO)
                provider = gr.State("intern")
                repository = gr.State("materials-project")
                material = gr.State("")
                year_from = gr.State(2020)
                limit = gr.State(15)
                expert_mode = gr.State(False)
                with gr.Group(visible=False):
                    init_status = gr.Markdown("")
                    trace = gr.HTML("")
                    audit_panel = gr.Markdown(visible=False)
            with gr.Column(scale=5, min_width=0, elem_id="chat-shell"):
                with gr.Row(elem_id="examples-toolbar"):
                    gr.HTML('<section class="mat-page-heading"><h1>材料筛选</h1><p>条件筛选 · 性质比较 · 文献佐证</p></section>', elem_id="workspace-title")
                    examples_toggle = gr.Button(
                        "筛选示例", size="sm", scale=0, elem_id="examples-toggle"
                    )
                # A rendered marker also controls the layout wrapper itself;
                # Group.visible alone may hide children but leave an empty box.
                literature_marker = gr.HTML(
                    '<span hidden data-open="false"></span>',
                    elem_id="literature-visibility-marker",
                )
                chatbot = gr.Chatbot(
                    label="",
                    show_label=False,
                    height=None,
                    layout="bubble",
                    buttons=[],
                    feedback_options=[],
                    elem_id="multi-chat",
                    placeholder=(
                        '<div class="materials-welcome"><span class="materials-welcome-mark" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10l5 8-5 8H7l-5-8Z"/><path d="m7 4 5 8 5-8M2 12h20m-15 8 5-8 5 8"/></svg></span><h2>从筛选条件，到候选材料</h2><p>从成分与性质出发，查询候选材料、比较关键指标，<br>再结合文献与数据核对研究依据。</p><div class="materials-capabilities"><span>条件筛选</span><span>性质比较</span><span>文献佐证</span></div></div>'
                    ),
                )
                with gr.Accordion(
                    "数据分析工具（可选）", open=False, visible=False,
                    elem_id="data-result-panel",
                ) as data_result_panel:
                    gr.Markdown("### 当前数据集")
                    data_summary = gr.Markdown("上传数据后将在这里显示自动 EDA。")
                    with gr.Accordion("查看字段和数据预览", open=False):
                        data_fields = gr.Dataframe(
                            headers=[
                                "字段",
                                "类型",
                                "有效值",
                                "缺失值",
                                "唯一值",
                                "提示",
                            ],
                            datatype=[
                                "str",
                                "str",
                                "number",
                                "number",
                                "number",
                                "str",
                            ],
                            value=[],
                            interactive=False,
                            wrap=True,
                        )
                        data_preview = gr.JSON(value=None)
                    with gr.Accordion("高级分析设置", open=False):
                        data_columns = gr.Dropdown(
                            choices=[],
                            multiselect=True,
                            label="数值字段",
                        )
                        with gr.Row():
                            data_x = gr.Dropdown(choices=[], label="X / 响应字段")
                            data_y = gr.Dropdown(choices=[], label="Y 字段")
                            data_group = gr.Dropdown(
                                choices=[], label="分组字段（可选）"
                            )
                        data_groups = gr.Dropdown(
                            choices=[],
                            multiselect=True,
                            label="参与比较的组",
                        )
                        with gr.Row():
                            data_statistical_method = gr.Dropdown(
                                choices=[
                                    "student_t",
                                    "welch_t",
                                    "paired_t",
                                    "mann_whitney",
                                    "anova",
                                    "kruskal_wallis",
                                ],
                                value="welch_t",
                                label="统计检验",
                            )
                            data_correlation_method = gr.Dropdown(
                                choices=["pearson", "spearman"],
                                value="pearson",
                                label="相关方法",
                            )
                            data_plot_type = gr.Dropdown(
                                choices=[
                                    "histogram",
                                    "boxplot",
                                    "scatter",
                                    "line",
                                    "bar",
                                    "heatmap",
                                ],
                                value="scatter",
                                label="图表类型",
                            )
                        data_export_format = gr.Radio(
                            choices=["CSV", "JSON"],
                            value="CSV",
                            label="导出格式",
                        )
                        with gr.Row():
                            data_key = gr.Dropdown(
                                choices=[],
                                label="去重键字段",
                                scale=3,
                            )
                            data_deduplicate_button = gr.Button(
                                "按键去重并新建数据集",
                                size="sm",
                                scale=2,
                            )
                        with gr.Row():
                            data_eda_button = gr.Button("一键 EDA", size="sm")
                            data_describe_button = gr.Button("描述统计", size="sm")
                            data_correlation_button = gr.Button("相关性", size="sm")
                            data_test_button = gr.Button("显著性检验", size="sm")
                        with gr.Row():
                            data_plot_button = gr.Button("生成图表", size="sm")
                            data_report_button = gr.Button("生成报告", size="sm")
                            data_export_button = gr.Button("导出数据", size="sm")
                        data_action_result = gr.Markdown("尚未执行高级操作。")
                        data_plot_preview = gr.Image(label="图表预览", type="filepath")
                        data_download = gr.File(label="报告或数据下载")
                    with gr.Accordion("跨 Agent 数据导入", open=False):
                        cross_source_kind = gr.Radio(
                            choices=["materials_database", "literature"],
                            value="materials_database",
                            label="来源",
                        )
                        cross_source_id = gr.Textbox(
                            label="query_id / document_id（留空使用最近结果）"
                        )
                        cross_import_button = gr.Button("导入并执行只读 EDA", size="sm")
                with gr.Group(
                    visible=False, elem_id="literature-view"
                ) as literature_result_panel:
                    with gr.Row(elem_id="literature-view-heading"):
                        gr.Markdown("### 文献详情")
                        literature_close = gr.Button(
                            "返回对话", size="sm", scale=0, elem_id="literature-close"
                        )
                    literature_table = gr.Dataframe(
                        headers=["#", "相关性", "年份", "论文题目", "DOI"],
                        datatype=["number", "str", "str", "str", "str"],
                        value=[],
                        interactive=False,
                        wrap=True,
                    )
                    literature_details = gr.Markdown(
                        "检索完成后，可在这里分页查看论文详情。"
                    )
                    with gr.Row():
                        previous_page = gr.Button("← 上一页", size="sm")
                        literature_page_label = gr.Markdown("第 0 / 0 页")
                        next_page = gr.Button("下一页 →", size="sm")
                with gr.Column(min_width=0, elem_id="composer-shell"):
                    message = gr.Textbox(
                        label="材料筛选问题", show_label=False, container=False,
                        placeholder="描述你的筛选目标，或继续追问…",
                        lines=2, max_lines=6, elem_id="material-question",
                    )
                    attachment_status = gr.Markdown("", elem_classes=["attachment-status"])
                    with gr.Row(elem_id="composer"):
                        files = gr.UploadButton(
                            "添加文件", file_count="multiple",
                            file_types=[".pdf", ".csv", ".json", ".xlsx"],
                            type="filepath", elem_id="pdf-upload",
                        )
                        clear_files_button = gr.Button("清除", size="sm", scale=0, elem_id="clear-upload")
                        gr.HTML("文件可选", elem_id="material-input-hint")
                        send_button = gr.Button(
                            "发送", variant="primary", scale=0, elem_id="send-button",
                            interactive=False,
                        )
                        stop_button = gr.Button(
                            "停止", variant="stop", scale=0, elem_id="stop-button",
                            visible=False, interactive=False,
                        )
            with gr.Column(
                scale=0, min_width=0, visible=False, elem_id="right-sidebar"
            ) as examples_panel:
                with gr.Row(elem_id="examples-heading"):
                    gr.Markdown("### 筛选示例")
                    examples_close = gr.Button(
                        "收起", size="sm", scale=0, elem_id="examples-close"
                    )
                gr.Markdown(
                    "点击填入问题，再次点击切换；填入后手动发送。",
                    elem_classes=["examples-hint"],
                )
                for category in EXAMPLE_CATEGORIES:
                    gr.Markdown(f"**{category.title}**")
                    for example in category.examples:
                        quick_buttons.append(
                            (
                                gr.Button(
                                    example.label,
                                    size="sm",
                                    elem_id=f"example-{example.key}",
                                    elem_classes=["quick-chip", "example-question"],
                                ),
                                example.key,
                            )
                        )
    controls = {
        'attachment_status': attachment_status,
        'audit_panel': audit_panel,
        'chatbot': chatbot,
        'clear_files_button': clear_files_button,
        'cross_import_button': cross_import_button,
        'cross_source_id': cross_source_id,
        'cross_source_kind': cross_source_kind,
        'data_action_result': data_action_result,
        'data_columns': data_columns,
        'data_correlation_button': data_correlation_button,
        'data_correlation_method': data_correlation_method,
        'data_deduplicate_button': data_deduplicate_button,
        'data_describe_button': data_describe_button,
        'data_download': data_download,
        'data_eda_button': data_eda_button,
        'data_export_button': data_export_button,
        'data_export_format': data_export_format,
        'data_fields': data_fields,
        'data_group': data_group,
        'data_groups': data_groups,
        'data_key': data_key,
        'data_plot_button': data_plot_button,
        'data_plot_preview': data_plot_preview,
        'data_plot_type': data_plot_type,
        'data_preview': data_preview,
        'data_report_button': data_report_button,
        'data_result_panel': data_result_panel,
        'data_statistical_method': data_statistical_method,
        'data_summary': data_summary,
        'data_test_button': data_test_button,
        'data_x': data_x,
        'data_y': data_y,
        'demo': demo,
        'example_cursors': example_cursors,
        'examples_close': examples_close,
        'examples_panel': examples_panel,
        'examples_toggle': examples_toggle,
        'examples_visible': examples_visible,
        'expert_mode': expert_mode,
        'files': files,
        'init_status': init_status,
        'limit': limit,
        'literature_close': literature_close,
        'literature_details': literature_details,
        'literature_marker': literature_marker,
        'literature_open': literature_open,
        'literature_page_label': literature_page_label,
        'literature_result_panel': literature_result_panel,
        'literature_table': literature_table,
        'literature_toggle': literature_toggle,
        'material': material,
        'message': message,
        'mode': mode,
        'new_button': new_button,
        'next_page': next_page,
        'page_conversation_ids': page_conversation_ids,
        'page_version': page_version,
        'pending_files': pending_files,
        'previous_page': previous_page,
        'provider': provider,
        'quick_buttons': quick_buttons,
        'recent_chats': recent_chats,
        'recent_empty': recent_empty,
        'repository': repository,
        'request_gate': request_gate,
        'request_running': request_running,
        'send_button': send_button,
        'session_state': session_state,
        'stop_button': stop_button,
        'trace': trace,
        'year_from': year_from,
    }
    return UiLayout(demo, controls)
