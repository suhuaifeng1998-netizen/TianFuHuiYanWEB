"""Independent Gradio UI, with the original business callback boundary."""
from .assets import launch_options
from .contracts import REQUIRED_CALLBACKS, UiCallbacks, UiDefaults
from .layout import build_layout
from .events import bind_events
from .experience import enhance_ui


def create_ui(callbacks: UiCallbacks, defaults: UiDefaults | None = None):
    """Build the original controls and event chains using supplied handlers."""
    namespace = {name: callbacks.require(name) for name in REQUIRED_CALLBACKS}

    def build():
        current = UiCallbacks(namespace)
        view = build_layout(current, defaults or UiDefaults())
        with view.demo:
            bind_events(current, view.controls)
        return view.demo

    namespace["_create_ui"] = build
    enhance_ui(namespace, callbacks_enhanced=callbacks.presentation_enhanced)
    return namespace["_create_ui"]()


__all__ = ["create_ui", "launch_options", "UiCallbacks", "UiDefaults", "REQUIRED_CALLBACKS"]
