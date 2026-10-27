"""Load only the UI resources shipped with this development package."""
from base64 import b64encode
from pathlib import Path
import re
import gradio as gr

ROOT = Path(__file__).resolve().parent.parent


def banner_html() -> str:
    html = (ROOT / "fragments/banner.html").read_text(encoding="utf-8")
    image = "data:image/jpeg;base64," + b64encode((ROOT / "assets/tianfu-logo.jpg").read_bytes()).decode("ascii")
    return html.replace('src="/tianfu-logo.jpg"', 'src="' + image + '"')


def launch_options() -> dict:
    css = "\n".join((ROOT / name).read_text(encoding="utf-8") for name in (
        "styles/base.css", "styles/theme.css", "styles/layout.css",
        "styles/workspace.css", "styles/presentation.css",
    ))
    head = (ROOT / "fragments/head.html").read_text(encoding="utf-8")
    masthead = (ROOT / "assets/agent-masthead.css").read_text(encoding="utf-8")
    # The online portal serves this root URL; a standalone Gradio preview does
    # not. Inline the same stylesheet at the same point in the head instead.
    head = re.sub(
        r'<link\b[^>]*\bhref=["\']/agent-masthead\.css(?:\?[^"\']*)?["\'][^>]*>',
        lambda _: '<style data-source="agent-masthead.css">' + masthead + '</style>',
        head,
    )
    return {
        "css": css,
        "head": head,
        "theme": gr.themes.Soft(primary_hue="blue", neutral_hue="slate"),
    }
