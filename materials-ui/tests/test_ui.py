import json
import asyncio
from copy import deepcopy
import os
from pathlib import Path
import sys
import unittest

os.environ.setdefault("GRADIO_ANALYTICS_ENABLED", "False")
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import gradio as gr
from materials_ui import UiCallbacks, UiDefaults, create_ui
from materials_ui.examples import EXAMPLE_CATEGORIES, next_example
from materials_ui.preview_handlers import PreviewHandlers, NOTICE
from materials_ui.assets import launch_options
from ui_contract import normalize
from materials_ui.interaction import _PageRequestGate, _composer_send_update, _request_controls, _cancel_page_request
from types import SimpleNamespace
from unittest.mock import AsyncMock
from materials_ui.experience import reveal_payloads, reveal_marker, _stop_reveal, upload_digest, enhance_ui


class UiContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.preview = PreviewHandlers(stream_delay=0)
        cls.demo = create_ui(cls.preview.callbacks())

    @classmethod
    def tearDownClass(cls):
        cls.demo.close(verbose=False)

    def test_current_layout_and_all_event_chains_are_preserved(self):
        expected = json.loads((ROOT / "tests/ui_contract.json").read_text(encoding="utf-8"))
        self.assertEqual(expected, normalize(self.demo.get_config_file()))

    def test_missing_business_callbacks_are_reported_before_build(self):
        with self.assertRaisesRegex(ValueError, "_dispatch_composer_ui"):
            UiCallbacks({})

    def test_registry_preserves_the_original_callable(self):
        callback = self.preview._dispatch_composer_ui
        handlers = {name: self.preview.callbacks().require(name) for name in self.preview.callbacks()._handlers}
        handlers["_dispatch_composer_ui"] = callback
        self.assertIs(UiCallbacks(handlers).require("_dispatch_composer_ui"), callback)

    def test_examples_only_fill_input_and_do_not_mutate_cursors(self):
        key = EXAMPLE_CATEGORIES[0].examples[0].key
        cursor = {}
        first, advanced = next_example(key, cursor)
        second, _ = next_example(key, advanced)
        self.assertEqual({}, cursor)
        self.assertTrue(first)
        self.assertNotEqual(first, second)

    def test_streaming_payload_and_stop_feedback(self):
        payloads = list(self.preview._dispatch_ui("auto", "预览材料", [], None, None, "", 2020, 15, False))
        self.assertGreater(len(payloads), 1)
        self.assertTrue(all(len(payload) == 20 for payload in payloads))
        self.assertIn(NOTICE, payloads[-1][0][-1]["content"])
        stopped = self.preview._stop_feedback(payloads[0][0])
        self.assertIn("已请求停止", stopped[-1]["content"])
        self.assertIn("正在显示", payloads[0][0][-1]["content"])

    def test_new_and_restored_conversations_do_not_run_a_query(self):
        self.assertEqual([], self.preview._new_conversation_ui(False)[0])
        restored = self.preview._restore_recent_conversation_ui("preview-literature")
        self.assertEqual(20, len(restored))
        self.assertTrue(restored[2]["preview_literature"])
        self.assertEqual(2, len(restored[0]))

    def test_attachment_names_and_clear_are_session_local(self):
        left = self.preview._initial_state();right = self.preview._initial_state()
        left["artifact_names"] = ["sample.pdf"]
        self.assertIn("sample.pdf", self.preview._attachment_markdown(None, left))
        self.assertEqual("", self.preview._attachment_markdown(None, right))
        _, cleared, label = self.preview._clear_attachments(left)
        self.assertEqual([], cleared["artifact_names"])
        self.assertEqual(["sample.pdf"], left["artifact_names"])
        self.assertEqual("", label)

    def test_literature_paging_and_panel_toggle(self):
        state = self.preview._initial_state();state["preview_literature"] = True
        rows, details, label, current = self.preview._turn_literature_page(state, 1)
        self.assertIn("2 / 2", label)
        self.assertEqual(2, rows[0][0])
        self.assertEqual(0, state["preview_page"])
        self.assertTrue(self.preview._literature_view_updates(True, current)[0])
        self.assertFalse(self.preview._literature_view_updates(True, current)[2]["visible"])
        self.assertFalse(self.preview._literature_view_updates(False, current)[0])

    def test_standalone_head_inlines_the_public_banner_stylesheet(self):
        head = launch_options()["head"]
        self.assertIn((ROOT / "assets/agent-masthead.css").read_text(encoding="utf-8"), head)
        self.assertNotIn('href="/agent-masthead.css', head)

    def test_analysis_and_download_callbacks_match_original_output_arity(self):
        state = self.preview._initial_state();state["preview_data"] = True
        for action in ["eda", "describe", "correlation", "test", "plot", "report", "export"]:
            result = self.preview._run_data_action(action, state, [], None, None, None, [], "welch_t", "scatter", "pearson", "CSV")
            self.assertEqual(4, len(result))
            self.assertTrue(Path(result[2]).is_file())
            self.assertTrue(Path(result[3]).is_file())
        self.assertEqual(11, len(self.preview._run_deduplicate_action(state, "group")))
        self.assertEqual(11, len(self.preview._import_cross_agent_dataset("materials_database", "", state)))

    def test_preview_error_does_not_silently_succeed(self):
        with self.assertRaises(gr.Error):
            list(self.preview._dispatch_ui("auto", "演示错误", [], None, None, "", 2020, 15, False))

    def test_pending_upload_merges_names_and_clear_removes_them(self):
        pending, label = self.preview._queue_attachments(["sample.csv", "second.pdf"], ["sample.csv"], None)
        self.assertEqual(["sample.csv", "second.pdf"], pending)
        self.assertIn("second.pdf", label)
        self.assertTrue(_composer_send_update("", pending)["interactive"])
        self.assertFalse(_composer_send_update("", [] )["interactive"])
        self.assertFalse(_composer_send_update("question", pending, True)["interactive"])
        self.assertFalse(_request_controls(False)[2]["visible"])

    def test_recent_list_is_page_scoped_and_removal_does_not_leak(self):
        gate = _PageRequestGate();other = _PageRequestGate()
        empty = self.preview._recent_chat_choices(None, [], gate)
        self.assertEqual([], empty[2])
        state = self.preview._initial_state();state["master_conversation_id"] = "preview-materials"
        shown = self.preview._recent_chat_choices(state, [], gate)
        self.assertEqual(["preview-materials"], shown[2])
        self.assertIn('data-chat-action="select"', shown[0]["value"])
        self.assertIn('data-chat-action="remove"', shown[0]["value"])
        gate.hide("preview-materials")
        self.assertEqual([], self.preview._recent_chat_choices(state, shown[2], gate)[2])
        self.assertEqual(["preview-materials"], other.visible(shown[2]))

    def test_new_composer_callback_keeps_21_outputs(self):
        values = list(self.preview._dispatch_composer_ui("auto", "预览数据", [], [], None, "", 2020, 15, False))
        self.assertTrue(all(len(value) == 21 for value in values))
        self.assertEqual([], values[-1][-1])
        self.assertEqual("preview-materials", values[-1][2]["master_conversation_id"])

    def test_gate_cancels_old_run_without_finishing_new_run(self):
        gate = _PageRequestGate();first = gate.begin("first")
        self.assertEqual("first", gate.cancel())
        self.assertFalse(gate.current(first));self.assertEqual(1, gate.page_version)
        second = gate.begin("second");gate.finish(first)
        self.assertTrue(gate.running);self.assertTrue(gate.current(second))
        independent = deepcopy(gate)
        self.assertFalse(independent.running);self.assertEqual(0, independent.page_version)

    def test_cancel_cleans_only_the_owned_gradio_event(self):
        async def run():
            gate = _PageRequestGate();gate.begin("event-one")
            pending = asyncio.Queue()
            queue = SimpleNamespace(clean_events=AsyncMock(), pending_messages_per_session={"preview": pending}, pending_event_ids_session={"preview": {"event-one"}})
            owned = asyncio.create_task(asyncio.Event().wait(), name="preview_0<gradio-sep>event-one")
            unrelated = asyncio.create_task(asyncio.Event().wait(), name="other_0<gradio-sep>event-one")
            await _cancel_page_request(gate, SimpleNamespace(session_hash="preview"), SimpleNamespace(_queue=queue))
            await asyncio.gather(owned, return_exceptions=True)
            self.assertTrue(owned.cancelled());self.assertFalse(unrelated.cancelled())
            queue.clean_events.assert_awaited_once_with(event_id="event-one")
            self.assertEqual("event-one", pending.get_nowait().event_id)
            unrelated.cancel();await asyncio.gather(unrelated, return_exceptions=True)
        asyncio.run(run())

    def test_dispatch_ignores_previous_page_and_drops_late_updates(self):
        function = next(f.fn for f in self.demo.fns.values() if f.api_name == "dispatch_shell")
        gate = _PageRequestGate();gate.cancel()
        args = ["auto", "预览材料", [], [], self.preview._initial_state(), "", 2020, 15, False]
        self.assertEqual([], list(function(*args, gate.page_version - 1, gate)))
        stream = function(*args, gate.page_version, gate)
        next(stream);next(stream)
        gate.cancel()
        self.assertEqual([], list(stream))
        self.assertFalse(gate.running)

    def test_fresh_navigation_returns_the_new_page_generation(self):
        function = next(f.fn for f in self.demo.fns.values() if f.api_name == "fresh_navigation")
        gate = _PageRequestGate()
        result = asyncio.run(function(False, gate, [], None))
        self.assertEqual(gate.page_version, result[-1])
        self.assertEqual([], result[0]["value"])
        self.assertEqual(gate.version, result[2]["_ui_request_version"])

    def test_progressive_display_preserves_final_text_and_closes_source(self):
        closed = []
        text = "说明文字。" * 35 + "\n\n| 材料 | 数值 |\n|---|---|\n| A | 1 |\n\n```python\nprint('sample')\n```"
        payload = ([{"role": "assistant", "content": text}], "status")
        def source():
            try:
                yield payload
            finally:
                closed.append(True)
        values = list(reveal_payloads(source(), [], pause=lambda _: None))
        self.assertGreater(len(values), 1)
        self.assertEqual(payload, values[-1])
        self.assertTrue(all(value[1] == "status" for value in values))
        self.assertEqual([True], closed)
        self.assertIn("matagent-reveal", values[0][0][0]["content"])

    def test_stop_removes_only_incomplete_reveal_markers(self):
        history = [{"role": "assistant", "content": "部分解答" + reveal_marker("preview-1")}]
        stopped = _stop_reveal(history)
        self.assertNotIn("matagent-reveal", stopped[0]["content"])
        self.assertIn("已停止显示", stopped[0]["content"])
        self.assertIn("matagent-reveal", history[0]["content"])
        self.assertEqual("完成的解答", _stop_reveal({"role": "assistant", "content": "完成的解答"})["content"])

    def test_upload_acknowledgement_and_page_script_are_installed_once(self):
        upload = next(f.fn for f in self.demo.fns.values() if f.api_name == "_queue_attachments")
        result = upload(["sample.csv"], [], None)
        self.assertEqual(["sample.csv"], result[0])
        self.assertEqual(1, result[1].count("matagent-upload-ready-"))
        self.assertIn(upload_digest(["sample.csv"]), result[1])
        scripts = [d for d in self.demo.get_config_file()["dependencies"] if "matagent-upload-feedback" in str(d.get("js", ""))]
        self.assertEqual(1, len(scripts))
        streams = [f for f in self.demo.fns.values() if f.api_name.startswith("dispatch_shell")]
        self.assertTrue(streams)
        self.assertTrue(all(f.stream_every == 0.04 for f in streams))

    def test_production_callbacks_are_not_wrapped_twice(self):
        namespace = {name: self.preview.callbacks().require(name) for name in self.preview.callbacks()._handlers}
        namespace["_create_ui"] = lambda: None
        enhance_ui(namespace)
        registered = UiCallbacks.from_namespace(SimpleNamespace(**namespace))
        self.assertTrue(registered.presentation_enhanced)
        demo = create_ui(registered)
        try:
            upload = next(f.fn for f in demo.fns.values() if f.api_name == "_queue_attachments")
            result = upload(["sample.csv"], [], None)
            self.assertEqual(1, result[1].count("matagent-upload-ready-"))
        finally:
            demo.close(verbose=False)


if __name__ == "__main__":unittest.main()
