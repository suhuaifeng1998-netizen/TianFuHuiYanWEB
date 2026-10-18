import json
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
from ui_contract import normalize


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
        with self.assertRaisesRegex(ValueError, "_dispatch_ui"):
            UiCallbacks({})

    def test_registry_preserves_the_original_callable(self):
        callback = self.preview._dispatch_ui
        handlers = {name: self.preview.callbacks().require(name) for name in self.preview.callbacks()._handlers}
        handlers["_dispatch_ui"] = callback
        self.assertIs(UiCallbacks(handlers).require("_dispatch_ui"), callback)

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
        self.assertFalse(self.preview._literature_view_updates(False, current)[0])

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


if __name__ == "__main__":unittest.main()
