"""Current online event graph, including page cancellation and attachments."""
from functools import partial
import gradio as gr
from .contracts import UiCallbacks
from .examples import next_example
from .layout import MODE_AUTO
from .interaction import _cancel_page_request, _composer_send_update, _request_controls

def bind_events(callbacks: UiCallbacks, controls: dict) -> None:
    _answer_data_chat_option = callbacks.require('_answer_data_chat_option')
    _clear_attachments = callbacks.require('_clear_attachments')
    _data_group_choices = callbacks.require('_data_group_choices')
    _dispatch_composer_ui = callbacks.require('_dispatch_composer_ui')
    _import_cross_agent_dataset = callbacks.require('_import_cross_agent_dataset')
    _initialize_safe = callbacks.require('_initialize_safe')
    _literature_view_updates = callbacks.require('_literature_view_updates')
    _new_conversation_ui = callbacks.require('_new_conversation_ui')
    _queue_attachments = callbacks.require('_queue_attachments')
    _recent_chat_choices = callbacks.require('_recent_chat_choices')
    _restore_recent_conversation_ui = callbacks.require('_restore_recent_conversation_ui')
    _run_data_action = callbacks.require('_run_data_action')
    _run_deduplicate_action = callbacks.require('_run_deduplicate_action')
    _stop_feedback = callbacks.require('_stop_feedback')
    _turn_literature_page = callbacks.require('_turn_literature_page')
    attachment_status = controls['attachment_status']
    audit_panel = controls['audit_panel']
    chatbot = controls['chatbot']
    clear_files_button = controls['clear_files_button']
    cross_import_button = controls['cross_import_button']
    cross_source_id = controls['cross_source_id']
    cross_source_kind = controls['cross_source_kind']
    data_action_result = controls['data_action_result']
    data_columns = controls['data_columns']
    data_correlation_button = controls['data_correlation_button']
    data_correlation_method = controls['data_correlation_method']
    data_deduplicate_button = controls['data_deduplicate_button']
    data_describe_button = controls['data_describe_button']
    data_download = controls['data_download']
    data_eda_button = controls['data_eda_button']
    data_export_button = controls['data_export_button']
    data_export_format = controls['data_export_format']
    data_fields = controls['data_fields']
    data_group = controls['data_group']
    data_groups = controls['data_groups']
    data_key = controls['data_key']
    data_plot_button = controls['data_plot_button']
    data_plot_preview = controls['data_plot_preview']
    data_plot_type = controls['data_plot_type']
    data_preview = controls['data_preview']
    data_report_button = controls['data_report_button']
    data_result_panel = controls['data_result_panel']
    data_statistical_method = controls['data_statistical_method']
    data_summary = controls['data_summary']
    data_test_button = controls['data_test_button']
    data_x = controls['data_x']
    data_y = controls['data_y']
    demo = controls['demo']
    example_cursors = controls['example_cursors']
    examples_close = controls['examples_close']
    examples_panel = controls['examples_panel']
    examples_toggle = controls['examples_toggle']
    examples_visible = controls['examples_visible']
    expert_mode = controls['expert_mode']
    files = controls['files']
    init_status = controls['init_status']
    limit = controls['limit']
    literature_close = controls['literature_close']
    literature_details = controls['literature_details']
    literature_marker = controls['literature_marker']
    literature_open = controls['literature_open']
    literature_page_label = controls['literature_page_label']
    literature_result_panel = controls['literature_result_panel']
    literature_table = controls['literature_table']
    literature_toggle = controls['literature_toggle']
    material = controls['material']
    message = controls['message']
    mode = controls['mode']
    new_button = controls['new_button']
    next_page = controls['next_page']
    page_conversation_ids = controls['page_conversation_ids']
    page_version = controls['page_version']
    pending_files = controls['pending_files']
    previous_page = controls['previous_page']
    provider = controls['provider']
    quick_buttons = controls['quick_buttons']
    recent_chats = controls['recent_chats']
    recent_empty = controls['recent_empty']
    repository = controls['repository']
    request_gate = controls['request_gate']
    request_running = controls['request_running']
    send_button = controls['send_button']
    session_state = controls['session_state']
    stop_button = controls['stop_button']
    trace = controls['trace']
    year_from = controls['year_from']

    inputs = [
        mode,
        message,
        chatbot,
        pending_files,
        session_state,
        material,
        year_from,
        limit,
        expert_mode,
    ]
    outputs = [
        chatbot,
        trace,
        session_state,
        message,
        files,
        audit_panel,
        attachment_status,
        literature_table,
        literature_details,
        literature_page_label,
        literature_result_panel,
        data_fields,
        data_preview,
        data_summary,
        data_result_panel,
        data_columns,
        data_x,
        data_y,
        data_group,
        data_key,
    ]
    shell_outputs = [
        *outputs, literature_open, literature_toggle, literature_marker,
        pending_files,
    ]

    def shell_payload(payload, pending=None):
        values = list(payload)
        values[0] = gr.update(value=values[0], visible=True)
        values[10] = gr.update(visible=False)
        return (
            *values, False, gr.update(
                value="文献详情", interactive=bool(values[7])
            ), '<span hidden data-open="false"></span>',
            [] if pending is None else pending,
        )

    def dispatch_shell(*args):
        if not args[1].strip() and not args[3]:
            return
        gate = args[-1]
        if args[-2] != gate.page_version:
            return
        from gradio.context import LocalContext

        version = gate.begin(LocalContext.event_id.get(None))
        try:
            yield (*[gr.skip() for _ in shell_outputs], *_request_controls(True))
            for payload in _dispatch_composer_ui(*args[:-2]):
                if not gate.current(version):
                    return
                payload = list(payload)
                payload[2] = {**payload[2], "_ui_request_version": version}
                yield (
                    *shell_payload(payload[:-1], payload[-1]),
                    *_request_controls(True),
                )
        except Exception:
            if gate.current(version):
                gate.finish(version)
                yield (
                    *[gr.skip() for _ in shell_outputs], *_request_controls(False),
                )
            raise
        finally:
            gate.finish(version)

    control_outputs = [request_running, send_button, stop_button]
    dispatch_outputs = [*shell_outputs, *control_outputs]

    def recent_after_dispatch(state, page_ids, gate):
        if (state or {}).get("_ui_request_version") != gate.version:
            return gr.skip(), gr.skip(), gr.skip()
        return _recent_chat_choices(state, page_ids, gate)

    send_event = send_button.click(
        dispatch_shell, [*inputs, page_version, request_gate], dispatch_outputs,
        show_progress="hidden",
        concurrency_id="composer",
    )
    submit_event = message.submit(
        dispatch_shell, [*inputs, page_version, request_gate], dispatch_outputs,
        show_progress="hidden",
        concurrency_id="composer",
    )
    for component in (message, pending_files):
        component.change(
            _composer_send_update,
            [message, pending_files, request_running], send_button,
            queue=False, show_progress="hidden",
        )
    send_event.then(
        recent_after_dispatch, [session_state, page_conversation_ids, request_gate],
        [recent_chats, recent_empty, page_conversation_ids],
        show_progress="hidden",
    )
    submit_event.then(
        recent_after_dispatch, [session_state, page_conversation_ids, request_gate],
        [recent_chats, recent_empty, page_conversation_ids],
        show_progress="hidden",
    )
    for event in (send_event, submit_event):
        event.then(
            lambda text, pending, gate: _request_controls(
                gate.running, text, pending,
            ),
            [message, pending_files, request_gate], control_outputs,
            queue=False, show_progress="hidden",
        )
    async def stop_request(
        history, text, pending, running, gate, request: gr.Request,
    ):
        version = await _cancel_page_request(gate, request, demo)
        if not gate.current(version):
            return tuple(gr.skip() for _ in range(len(control_outputs) + 2))
        return (
            _stop_feedback(history) if running else history,
            *_request_controls(False, text, pending),
            gate.page_version,
        )

    stop_button.click(
        stop_request,
        [chatbot, message, pending_files, request_running, request_gate],
        [chatbot, *control_outputs, page_version],
        queue=False, show_progress="hidden",
    )
    request_running.change(
        lambda running, text, pending: (
            _composer_send_update(text, pending, running),
            gr.update(visible=bool(running), interactive=bool(running)),
        ),
        [request_running, message, pending_files],
        [send_button, stop_button],
        queue=False, show_progress="hidden",
    )
    data_group.change(
        _data_group_choices,
        [session_state, data_group],
        data_groups,
        show_progress="hidden",
    )
    chatbot.option_select(
        _answer_data_chat_option,
        [chatbot, session_state],
        [chatbot, session_state],
        show_progress="hidden",
    )
    data_action_inputs = [
        session_state,
        data_columns,
        data_x,
        data_y,
        data_group,
        data_groups,
        data_statistical_method,
        data_plot_type,
        data_correlation_method,
        data_export_format,
    ]
    data_action_outputs = [
        data_action_result,
        session_state,
        data_plot_preview,
        data_download,
    ]
    for button, action in (
        (data_eda_button, "eda"),
        (data_describe_button, "describe"),
        (data_correlation_button, "correlation"),
        (data_test_button, "test"),
        (data_plot_button, "plot"),
        (data_report_button, "report"),
        (data_export_button, "export"),
    ):
        button.click(
            partial(_run_data_action, action),
            data_action_inputs,
            data_action_outputs,
            show_progress="hidden",
        )
    data_deduplicate_button.click(
        _run_deduplicate_action,
        [session_state, data_key],
        [
            data_action_result,
            session_state,
            data_fields,
            data_preview,
            data_summary,
            data_result_panel,
            data_columns,
            data_x,
            data_y,
            data_group,
            data_key,
        ],
        show_progress="hidden",
    )
    cross_import_button.click(
        _import_cross_agent_dataset,
        [cross_source_kind, cross_source_id, session_state],
        [
            data_action_result,
            session_state,
            data_fields,
            data_preview,
            data_summary,
            data_result_panel,
            data_columns,
            data_x,
            data_y,
            data_group,
            data_key,
        ],
        show_progress="hidden",
    )
    navigation_outputs = [
        *shell_outputs, *control_outputs, mode, recent_chats, recent_empty,
        page_conversation_ids, example_cursors, page_version,
    ]

    async def fresh_navigation(expert, gate, page_ids, request: gr.Request):
        version = await _cancel_page_request(gate, request, demo)
        if not gate.current(version):
            return tuple(gr.skip() for _ in navigation_outputs)
        payload = shell_payload(_new_conversation_ui(expert))
        payload[2]["_ui_request_version"] = gate.version
        return (
            *payload, *_request_controls(False), MODE_AUTO,
            *_recent_chat_choices(payload[2], page_ids, gate), {}, gate.page_version,
        )

    def page_chat_id(event, page_ids, gate):
        data = event._data
        selected = data.get("conversation_id") if isinstance(data, dict) else None
        if (
            not isinstance(selected, str)
            or selected not in gate.visible(page_ids or [])
        ):
            raise gr.Error("该对话不在当前页面的最近对话列表中。")
        return selected

    async def restore_saved(
        state, page_ids, expert, gate, event: gr.EventData, request: gr.Request,
    ):
        selected = page_chat_id(event, page_ids, gate)
        payload = shell_payload(_restore_recent_conversation_ui(selected, expert))
        version = await _cancel_page_request(gate, request, demo)
        if not gate.current(version):
            return tuple(gr.skip() for _ in navigation_outputs)
        payload[2]["_ui_request_version"] = gate.version
        return (
            *payload, *_request_controls(False), MODE_AUTO,
            *_recent_chat_choices(payload[2], page_ids, gate), {}, gate.page_version,
        )

    async def remove_recent(
        state, page_ids, expert, gate, event: gr.EventData, request: gr.Request,
    ):
        selected = page_chat_id(event, page_ids, gate)
        gate.hide(selected)
        remaining = [item for item in page_ids if item != selected]
        if (state or {}).get("master_conversation_id") == selected:
            return await fresh_navigation(expert, gate, remaining, request)
        return (
            *[gr.skip() for _ in shell_outputs],
            *[gr.skip() for _ in control_outputs], gr.skip(),
            *_recent_chat_choices(state, remaining, gate), gr.skip(), gr.skip(),
        )

    recent_chats.select(
        restore_saved,
        [session_state, page_conversation_ids, expert_mode, request_gate],
        navigation_outputs,
        queue=False, show_progress="hidden",
    )
    recent_chats.delete(
        remove_recent,
        [session_state, page_conversation_ids, expert_mode, request_gate],
        navigation_outputs, queue=False, show_progress="hidden",
    )
    demo.load(
        _initialize_safe, [provider, repository], [init_status, trace],
        show_progress="hidden",
    )
    new_button.click(
        fresh_navigation, [expert_mode, request_gate, page_conversation_ids],
        navigation_outputs,
        queue=False, show_progress="hidden",
    )
    files.upload(
        _queue_attachments,
        [files, pending_files, session_state],
        [pending_files, attachment_status],
        show_progress="hidden",
        concurrency_id="composer",
        trigger_mode="multiple",
    )
    clear_files_button.click(
        lambda state: (*_clear_attachments(state), []),
        session_state,
        [files, session_state, attachment_status, pending_files],
        show_progress="hidden",
        concurrency_id="composer",
    )
    previous_page.click(
        lambda state: _turn_literature_page(state, -1),
        session_state,
        [
            literature_table,
            literature_details,
            literature_page_label,
            session_state,
        ],
        show_progress="hidden",
    )
    next_page.click(
        lambda state: _turn_literature_page(state, 1),
        session_state,
        [
            literature_table,
            literature_details,
            literature_page_label,
            session_state,
        ],
        show_progress="hidden",
    )
    literature_toggle.click(
        lambda opened, state: _literature_view_updates(not opened, state),
        [literature_open, session_state],
        [
            literature_open, literature_result_panel, chatbot,
            literature_toggle, literature_marker,
        ],
        queue=False, show_progress="hidden",
    )
    literature_close.click(
        lambda state: _literature_view_updates(False, state),
        session_state,
        [
            literature_open, literature_result_panel, chatbot,
            literature_toggle, literature_marker,
        ],
        queue=False, show_progress="hidden",
    )
    def set_examples_visibility(visible):
        return (
            visible,
            gr.update(visible=visible),
            gr.update(value="收起示例" if visible else "筛选示例"),
        )

    examples_toggle.click(
        lambda visible: set_examples_visibility(not visible),
        examples_visible,
        [examples_visible, examples_panel, examples_toggle],
        queue=False,
        show_progress="hidden",
    )
    examples_close.click(
        lambda: set_examples_visibility(False),
        None,
        [examples_visible, examples_panel, examples_toggle],
        queue=False,
        show_progress="hidden",
    )
    for button, key in quick_buttons:
        button.click(
            partial(next_example, key),
            example_cursors,
            [message, example_cursors],
            queue=False,
            show_progress="hidden",
            trigger_mode="once",
        )
