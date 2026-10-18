"""Synthetic UI responses, not material screening or analysis implementations.

All state belongs to the Gradio session. Fixture files are bundled public
examples. No database, model, private service, environment key or user document
content is read here.
"""
from copy import deepcopy
from pathlib import Path
import time
import gradio as gr
from .assets import ROOT
from .contracts import UiCallbacks

NOTICE = "**界面预览 · 固定示例数据，不是真实查询或分析结果。**"
FIXTURES = ROOT / "fixtures"
CHOICES = [("演示 · 材料筛选", "preview-materials"), ("演示 · 文献浏览", "preview-literature")]


class PreviewHandlers:
    def __init__(self, stream_delay: float = 0.15):
        self.stream_delay = stream_delay

    def callbacks(self) -> UiCallbacks:
        return UiCallbacks.from_namespace(self)

    def _initial_state(self):
        return {"preview": True, "master_conversation_id": "preview-materials", "artifact_names": [],
                "preview_page": 0, "preview_literature": False, "preview_data": False}

    def _initialize_safe(self, provider, repository):
        return "预览界面已就绪", "<p>固定样例模式；未连接业务服务。</p>"

    def _attachment_markdown(self, files, state):
        names = [Path(item if isinstance(item, str) else getattr(item, "name", "")).name for item in (files or [])]
        names = [name for name in names if name] or list((state or {}).get("artifact_names", []))
        return "📎 预览附件：" + "、".join(names) if names else ""

    def _clear_attachments(self, state):
        current = deepcopy(state or self._initial_state());current["artifact_names"] = []
        return None, current, ""

    def _literature_page(self, state):
        if not state.get("preview_literature"):
            return [], "文献示例将在这里显示。", "第 0 / 0 页"
        page = max(0, min(1, state.get("preview_page", 0)))
        rows = [[page + 1, "预览", "2026", f"演示文献 {page + 1}（虚构）", "—"]]
        return rows, NOTICE + f"\n\n### 演示文献 {page + 1}\n用于检查分页、详情和返回对话的显示效果。", f"第 {page + 1} / 2 页"

    def _data_panel(self, state):
        visible = bool(state.get("preview_data"));numeric = ["band_gap_ev", "density"] if visible else []
        all_fields = [*numeric, "group"] if visible else []
        fields = [[name, "number" if name in numeric else "string", 2, 0, 2, "虚构预览字段"] for name in all_fields]
        records = [{"demo_id": "preview-A", "band_gap_ev": 1.8, "density": 3.2, "group": "A"},
                   {"demo_id": "preview-B", "band_gap_ev": 2.4, "density": 4.1, "group": "B"}] if visible else None
        return (fields, records, NOTICE if visible else "上传表格后将在这里显示预览。", gr.update(visible=visible),
                gr.update(choices=numeric, value=numeric),
                gr.update(choices=numeric, value=numeric[0] if numeric else None),
                gr.update(choices=numeric, value=numeric[-1] if numeric else None),
                gr.update(choices=all_fields, value="group" if visible else None),
                gr.update(choices=all_fields, value="group" if visible else None))

    def _payload(self, history, state, message="", files=None):
        rows, details, page = self._literature_page(state)
        return (history, "<p>界面预览</p>", state, message, files, "", self._attachment_markdown(None, state),
                rows, details, page, gr.update(visible=bool(rows)), *self._data_panel(state))

    def _dispatch_ui(self, mode, message, history, files, state, material, year_from, limit, expert_mode):
        if message == "演示错误":
            raise gr.Error("这是用于检查错误反馈的预览错误；没有执行业务操作。")
        if not str(message or "").strip() and not files:
            raise gr.Error("请先输入问题或添加文件。")
        current = deepcopy(state or self._initial_state())
        names = [Path(item if isinstance(item, str) else getattr(item, "name", "")).name for item in (files or [])]
        suffixes = {Path(name).suffix.lower() for name in names}
        if ".pdf" in suffixes and suffixes & {".csv", ".json", ".xlsx"}:
            raise gr.Error("预览中请分别上传论文或表格，检查两条界面流程。")
        if names:current["artifact_names"] = names
        current["preview_data"] = bool(suffixes & {".csv", ".json", ".xlsx"}) or "数据" in str(message)
        current["preview_literature"] = ".pdf" in suffixes or "文献" in str(message) or "论文" in str(message)
        current["preview_page"] = 0
        messages = deepcopy(history or []);messages.append({"role": "user", "content": str(message or "预览上传文件")})
        progress = {"role": "assistant", "content": '<div class="agent-progress" role="status">正在显示固定预览样例…</div>'}
        yield self._payload([*messages, progress], current)
        response = NOTICE + "\n\n已展示材料工作台的对话、附件状态和结果面板。\n\n| 演示材料 | 演示数值 |\n|---|---:|\n| preview-A | 1.8 |\n| preview-B | 2.4 |"
        for end in [len(response)//3, 2*len(response)//3, len(response)]:
            if self.stream_delay:time.sleep(self.stream_delay)
            answer = {"role": "assistant", "content": response[:end]}
            if current["preview_data"] and end == len(response):
                answer["options"] = [{"label": "预览描述统计", "value": "describe"}]
            yield self._payload([*messages, answer], current)

    def _recent_chat_choices(self, state=None):
        selected = (state or {}).get("master_conversation_id")
        return gr.update(choices=CHOICES, value=selected if selected in dict((v,k) for k,v in CHOICES) else None), gr.update(visible=False)

    def _new_conversation_ui(self, expert_mode):
        state = self._initial_state();state["master_conversation_id"] = None
        return self._payload([], state)

    def _restore_recent_conversation_ui(self, conversation_id, expert=False):
        if conversation_id not in {value for _, value in CHOICES}:raise gr.Error("请选择一个预览会话。")
        state = self._initial_state();state["master_conversation_id"] = conversation_id
        state["preview_literature"] = conversation_id == "preview-literature"
        history = [{"role": "user", "content": "这是已保存会话的固定预览样例。"}, {"role": "assistant", "content": NOTICE}]
        return self._payload(history, state)

    def _stop_feedback(self, history):
        messages = deepcopy(history or [])
        if messages and messages[-1].get("role") == "assistant" and 'class="agent-progress"' in str(messages[-1].get("content", "")):
            messages[-1]["content"] = '<div class="agent-progress" role="status">已请求停止，保留已完成内容。</div>'
        return messages

    def _turn_literature_page(self, state, delta):
        current = deepcopy(state or self._initial_state());current["preview_page"] = max(0, min(1, current.get("preview_page", 0) + delta))
        return (*self._literature_page(current), current)

    def _literature_view_updates(self, opened, state):
        opened = bool(opened and (state or {}).get("preview_literature"))
        return opened, gr.update(visible=opened), gr.skip(), gr.update(value="收起文献详情" if opened else "文献详情", interactive=bool((state or {}).get("preview_literature"))), f'<span hidden data-open="{str(opened).lower()}"></span>'

    def _data_group_choices(self, state, group_column):
        return gr.update(choices=["A", "B"] if (state or {}).get("preview_data") and group_column else [], value=[])

    def _answer_data_chat_option(self, history, state, event: gr.SelectData):
        return [*(history or []), {"role": "assistant", "content": NOTICE + "\n\n已选择数据操作预览。"}], deepcopy(state or self._initial_state())

    def _run_data_action(self, action, state, columns, x, y, group_by, groups, statistical_method, plot_type, correlation_method, export_format):
        current = deepcopy(state or self._initial_state())
        if not current.get("preview_data"):raise gr.Error("请先上传表格或输入包含“数据”的预览问题。")
        download = FIXTURES / ("preview-report.md" if action == "report" else "preview-materials.json" if export_format == "JSON" else "preview-materials.csv")
        return NOTICE + f"\n\n已展示 {action} 的固定样例；未执行统计计算。", current, str(FIXTURES / "preview-chart.png"), str(download)

    def _run_deduplicate_action(self, state, key_column):
        current = deepcopy(state or self._initial_state());current["preview_data"] = True
        return (NOTICE + "\n\n去重操作的界面预览。", current, *self._data_panel(current))

    def _import_cross_agent_dataset(self, source_kind, identifier, state):
        current = deepcopy(state or self._initial_state());current["preview_data"] = True
        return (NOTICE + "\n\n跨 Agent 导入的界面预览。", current, *self._data_panel(current))
