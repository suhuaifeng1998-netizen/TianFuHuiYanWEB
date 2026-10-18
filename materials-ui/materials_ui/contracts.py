"""UI integration boundary: callables only, no business imports."""
from dataclasses import dataclass
from types import MappingProxyType
from typing import Callable, Mapping

REQUIRED_CALLBACKS = ('_answer_data_chat_option', '_attachment_markdown', '_clear_attachments', '_data_group_choices', '_dispatch_ui', '_import_cross_agent_dataset', '_initial_state', '_initialize_safe', '_literature_view_updates', '_new_conversation_ui', '_recent_chat_choices', '_restore_recent_conversation_ui', '_run_data_action', '_run_deduplicate_action', '_stop_feedback', '_turn_literature_page')

@dataclass(frozen=True)
class UiDefaults:
    title: str = "材料筛选 Agent · 天府·慧研"
    restore_id: str = ""

class UiCallbacks:
    def __init__(self, handlers: Mapping[str, Callable]):
        missing = [name for name in REQUIRED_CALLBACKS if not callable(handlers.get(name))]
        if missing:
            raise ValueError("Missing UI callbacks: " + ", ".join(missing))
        self._handlers = MappingProxyType({name: handlers[name] for name in REQUIRED_CALLBACKS})

    def require(self, name: str) -> Callable:
        return self._handlers[name]

    @classmethod
    def from_namespace(cls, namespace: object):
        return cls({name: getattr(namespace, name, None) for name in REQUIRED_CALLBACKS})
