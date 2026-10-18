"""Run the UI with synthetic examples; never connects to a business service."""
import argparse
import os

os.environ.setdefault("GRADIO_ANALYTICS_ENABLED", "False")

from materials_ui import create_ui, launch_options
from materials_ui.preview_handlers import PreviewHandlers


def main(argv=None):
    parser = argparse.ArgumentParser(description="Materials Gradio UI preview (synthetic data only)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7865)
    parser.add_argument("--check", action="store_true", help="Build and validate the UI without starting a server")
    args = parser.parse_args(argv)
    preview = PreviewHandlers()
    demo = create_ui(preview.callbacks())
    if args.check:
        config = demo.get_config_file()
        print(f"UI OK: {len(config['components'])} components, {len(config['dependencies'])} callbacks")
        return
    print("UI PREVIEW: synthetic examples only; no model, database or private service is connected.")
    demo.queue().launch(server_name=args.host, server_port=args.port, share=False, **launch_options())


if __name__ == "__main__":
    main()
