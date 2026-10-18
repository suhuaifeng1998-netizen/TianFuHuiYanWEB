"""Load only the UI resources shipped with this development package."""
from base64 import b64encode
from pathlib import Path
import gradio as gr

ROOT = Path(__file__).resolve().parent.parent


def banner_html() -> str:
    html = (ROOT / "fragments/banner.html").read_text(encoding="utf-8")
    image = "data:image/jpeg;base64," + b64encode((ROOT / "assets/tianfu-logo.jpg").read_bytes()).decode("ascii")
    return html.replace('src="/tianfu-logo.jpg"', 'src="' + image + '"')


def launch_options() -> dict:
    css = "\n".join((ROOT / name).read_text(encoding="utf-8") for name in (
        "styles/base.css", "styles/theme.css", "styles/layout.css", "assets/agent-masthead.css",
    ))
    script = (ROOT / "scripts/theme.js").read_text(encoding="utf-8")
    return {
        "css": css,
        "head": '<meta name="color-scheme" content="light dark"><script>' + script + '</script>',
        "theme": gr.themes.Soft(primary_hue="blue", neutral_hue="slate"),
    }
