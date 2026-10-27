"""UI-only page lifetime, cancellation and recent-chat browser interaction.

No model, database, retrieval, analysis or production storage code is imported.
Cancellation follows the pinned Gradio runtime used by the current online UI.
"""
from __future__ import annotations
import asyncio
import threading
from typing import Any
import gradio as gr

RECENT_CHAT_JS = "\nelement.addEventListener('click', (event) => {\n  const target = event.target.closest('button[data-chat-action]');\n  if (!target || !element.contains(target)) return;\n  event.preventDefault();\n  event.stopPropagation();\n  trigger(target.dataset.chatAction === 'remove' ? 'delete' : 'select', {\n    conversation_id: target.dataset.conversationId\n  });\n});\n"
RECENT_CHAT_CSS = '\n.recent-chat-row { display: flex; align-items: center; gap: 4px;\n  width: 100%; min-width: 0; border-radius: 10px; margin: 3px 0; }\n.recent-chat-row:hover, .recent-chat-row.is-selected {\n  background: var(--button-secondary-background-fill-hover, #e8eef9); }\n.recent-chat-row button { border: 0 !important; background: transparent !important;\n  box-shadow: none !important; color: inherit;\n  cursor: pointer; font: inherit; border-radius: 8px; min-height: 36px; }\n.recent-chat-title { flex: 1; min-width: 0; padding: 7px 8px;\n  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }\n.recent-chat-remove { flex: 0 0 30px; padding: 0 !important; font-size: 20px !important;\n  line-height: 1; opacity: .7; }\n.recent-chat-remove:hover { opacity: 1; color: #bc3030; }\n.recent-chat-row button:focus-visible {\n  outline: 2px solid #4263eb; outline-offset: 1px; }\n'

class _PageRequestGate:
    def __init__(self):
        self._lock = threading.Lock()
        self._version = 0
        self._page_version = 0
        self._running = False
        self._event_id = None
        self._removed = set()
        self._view_version = 0

    def __deepcopy__(self, memo):
        return type(self)()

    def begin(self, event_id=None):
        with self._lock:
            self._version += 1
            self._running = True
            self._event_id = event_id
            return self._version

    def cancel(self):
        with self._lock:
            event_id = self._event_id
            self._event_id = None
            self._version += 1
            self._running = False
            self._page_version += 1
            self._view_version += 1
            return event_id

    def hide(self, conversation_id):
        with self._lock:
            self._removed.add(conversation_id)
            self._view_version += 1

    def visible(self, identifiers):
        with self._lock:
            return [item for item in identifiers if item not in self._removed]

    @property
    def version(self):
        with self._lock:
            return self._version

    @property
    def page_version(self):
        with self._lock:
            return self._page_version

    @property
    def view_version(self):
        with self._lock:
            return self._view_version

    def current(self, version):
        with self._lock:
            return self._version == version

    def finish(self, version):
        with self._lock:
            if self._version == version:
                self._running = False
                self._event_id = None

    @property
    def running(self):
        with self._lock:
            return self._running

def _composer_send_update(
    message: str | None, pending: list[Any] | None, running: bool = False,
) -> dict[str, Any]:
    return gr.update(
        interactive=not running and bool((message or "").strip() or pending)
    )

def _request_controls(running, message="", pending=None):
    return (
        bool(running), _composer_send_update(message, pending, running),
        gr.update(visible=bool(running), interactive=bool(running)),
    )

async def _cancel_page_request(gate, request, blocks):
    event_id = gate.cancel()
    version = gate.version
    session_hash = getattr(request, "session_hash", None)
    if not event_id or not session_hash:
        return version
    for task in asyncio.all_tasks():
        name = task.get_name()
        prefix, separator, candidate = name.partition("<gradio-sep>")
        owner, _, _ = prefix.rpartition("_")
        if separator and candidate == event_id and owner == session_hash:
            task.cancel()
    queue = blocks._queue
    await queue.clean_events(event_id=event_id)
    pending = queue.pending_messages_per_session.get(session_hash)
    if pending is not None and event_id in queue.pending_event_ids_session.get(
        session_hash, set(),
    ):
        from gradio.server_messages import ProcessCompletedMessage

        pending.put_nowait(ProcessCompletedMessage(
            output={}, success=True, event_id=event_id,
        ))
    return version
