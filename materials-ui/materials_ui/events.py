"""Original Gradio event graph, without business implementations."""
from functools import partial
import gradio as gr
from .contracts import UiCallbacks
from .examples import next_example
from .layout import MODE_AUTO

def bind_events(callbacks: UiCallbacks, controls: dict) -> None:
    _answer_data_chat_option = callbacks.require('_answer_data_chat_option')
    _attachment_markdown = callbacks.require('_attachment_markdown')
    _clear_attachments = callbacks.require('_clear_attachments')
    _data_group_choices = callbacks.require('_data_group_choices')
    _dispatch_ui = callbacks.require('_dispatch_ui')
    _import_cross_agent_dataset = callbacks.require('_import_cross_agent_dataset')
    _initialize_safe = callbacks.require('_initialize_safe')
    _literature_view_updates = callbacks.require('_literature_view_updates')
    _new_conversation_ui = callbacks.require('_new_conversation_ui')
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
    previous_page = controls['previous_page']
    provider = controls['provider']
    quick_buttons = controls['quick_buttons']
    recent_chats = controls['recent_chats']
    recent_empty = controls['recent_empty']
    repository = controls['repository']
    restore_id = controls['restore_id']
    send_button = controls['send_button']
    session_state = controls['session_state']
    stop_button = controls['stop_button']
    trace = controls['trace']
    year_from = controls['year_from']

    inputs = [
        mode,
        message,
        chatbot,
        files,
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
        *outputs, literature_open, literature_toggle, literature_marker
    ]

    def shell_payload(payload):
        values = list(payload)
        values[0] = gr.update(value=values[0], visible=True)
        values[10] = gr.update(visible=False)
        return (
            *values, False, gr.update(
                value="文献详情", interactive=bool(values[7])
            ), '<span hidden data-open="false"></span>',
        )

    def dispatch_shell(*args):
        for payload in _dispatch_ui(*args):
            yield shell_payload(payload)

    send_event = send_button.click(
        dispatch_shell, inputs, shell_outputs, show_progress="hidden"
    )
    submit_event = message.submit(
        dispatch_shell, inputs, shell_outputs, show_progress="hidden"
    )
    send_event.then(
        _recent_chat_choices, session_state, [recent_chats, recent_empty],
        show_progress="hidden",
    )
    submit_event.then(
        _recent_chat_choices, session_state, [recent_chats, recent_empty],
        show_progress="hidden",
    )
    stop_button.click(
        _stop_feedback, chatbot, chatbot, cancels=[send_event, submit_event],
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
    def restore_saved(conversation_id, expert):
        return (
            *shell_payload(
                _restore_recent_conversation_ui(conversation_id, expert)
            ),
            MODE_AUTO,
        )

    def restore_on_load(conversation_id, expert):
        if not conversation_id.strip():
            return tuple(gr.skip() for _ in [*shell_outputs, mode])
        return restore_saved(conversation_id, expert)

    restore_event = recent_chats.input(
        restore_saved, [recent_chats, expert_mode], [*shell_outputs, mode],
        show_progress="hidden",
    )
    restore_event.then(
        _recent_chat_choices, session_state, [recent_chats, recent_empty],
        show_progress="hidden",
    )
    initialized = demo.load(
        _initialize_safe, [provider, repository], [init_status, trace],
        show_progress="hidden",
    )
    restored = initialized.then(
        restore_on_load, [restore_id, expert_mode], [*shell_outputs, mode],
        show_progress="hidden",
    )
    restored.then(
        _recent_chat_choices, session_state, [recent_chats, recent_empty],
        show_progress="hidden",
    )
    new_event = new_button.click(
        lambda expert: shell_payload(_new_conversation_ui(expert)),
        expert_mode,
        shell_outputs,
        show_progress="hidden",
    )
    new_event.then(
        _recent_chat_choices, session_state, [recent_chats, recent_empty],
        show_progress="hidden",
    )
    new_event.then(
        lambda: {}, None, example_cursors, queue=False, show_progress="hidden"
    )
    files.upload(
        _attachment_markdown,
        [files, session_state],
        attachment_status,
        show_progress="hidden",
    )
    clear_files_button.click(
        _clear_attachments,
        session_state,
        [files, session_state, attachment_status],
        show_progress="hidden",
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
