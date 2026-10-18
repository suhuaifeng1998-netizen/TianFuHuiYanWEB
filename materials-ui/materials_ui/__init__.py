"""Independent Gradio UI, with the original business callback boundary."""
from .assets import launch_options
from .contracts import REQUIRED_CALLBACKS, UiCallbacks, UiDefaults
from .layout import build_layout
from .events import bind_events


def create_ui(callbacks: UiCallbacks, defaults: UiDefaults | None = None):
    """Build the original controls and event chains using supplied handlers."""
    view = build_layout(callbacks, defaults or UiDefaults())
    with view.demo:
        bind_events(callbacks, view.controls)
    return view.demo


__all__ = ["create_ui", "launch_options", "UiCallbacks", "UiDefaults", "REQUIRED_CALLBACKS"]
