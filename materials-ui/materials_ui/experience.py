"""Progressive display of checked text and acknowledgements of uploaded files."""

import hashlib
import json
import re
import time
import uuid
from functools import wraps
from pathlib import Path

_MARKER = re.compile(
    r'<span hidden class="matagent-reveal marker-[A-Za-z0-9-]+"></span>'
)
_PROTECTED = re.compile(
    r"```[\s\S]*?(?:```|\Z)|~~~[\s\S]*?(?:~~~|\Z)|<[^>\n]*>|\[[^\]\n]*\]\([^\)\n]*\)"
    r"|^\|[^\n]*\n\|[ :|\-]+\n\|[^\n]*(?:\n|$)|^\|[^\n]*(?:\n|$)",
    re.MULTILINE,
)


def reveal_marker(identifier):
    if not re.fullmatch(r"[A-Za-z0-9-]+", identifier):
        raise ValueError("Invalid presentation identifier")
    return f'<span hidden class="matagent-reveal marker-{identifier}"></span>'


def strip_reveal(text):
    return _MARKER.sub("", text)


def _prefixes(text, start):
    signature = re.search(r"<div\b[^>]*class=[\"\'][^\"\']*agent-signature", text)
    body = text[: signature.start()] if signature else text
    if len(body) - start < 80:
        return
    protected = [(match.start(), match.end()) for match in _PROTECTED.finditer(body)]
    step = max(40, (len(body) - start + 23) // 24)
    position = start
    while position + step < len(body):
        boundary = position + step
        punctuation = re.search(r"[\n。！？.!?；;]\s*", body[boundary : boundary + 60])
        if punctuation:
            boundary += punctuation.end()
        for left, right in protected:
            if left < boundary < right:
                boundary = right
        if boundary >= len(body):
            return
        yield body[:boundary]
        position = boundary


def reveal_payloads(source, history, *, pause=time.sleep):
    previous = list(history or [])
    baseline = len(previous)
    remaining_delay = 1.2
    try:
        for payload in source:
            raw = payload[0]
            chat = raw.get("value") if isinstance(raw, dict) else raw
            if not isinstance(chat, list):
                yield payload
                continue
            for index in range(baseline, len(chat)):
                message = chat[index]
                if not isinstance(message, dict) or message.get("role") != "assistant":
                    continue
                text = message.get("content")
                if not isinstance(text, str) or 'class="agent-progress"' in text:
                    continue
                old = (
                    previous[index].get("content", "")
                    if index < len(previous) and isinstance(previous[index], dict)
                    else ""
                )
                if old == text:
                    continue
                start = len(old) if isinstance(old, str) and text.startswith(old) else 0
                marker = reveal_marker(uuid.uuid4().hex)
                for prefix in _prefixes(text, start):
                    interim = [*chat[:index], {**message, "content": prefix + marker}]
                    displayed = (
                        {**raw, "value": interim} if isinstance(raw, dict) else interim
                    )
                    yield (displayed, *payload[1:])
                    if remaining_delay > 0:
                        delay = min(0.04, remaining_delay)
                        pause(delay)
                        remaining_delay = max(0, remaining_delay - delay)
            yield payload
            previous = chat
    finally:
        close = getattr(source, "close", None)
        if close is not None:
            close()


def _stop_reveal(value):
    if isinstance(value, dict):
        if value.get("role") == "assistant" and isinstance(value.get("content"), str):
            content = value["content"]
            cleaned = strip_reveal(content)
            if cleaned != content:
                return {
                    **value,
                    "content": cleaned + "\n\n（已停止显示，内容尚未展示完整。）",
                }
        return {key: _stop_reveal(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return type(value)(_stop_reveal(item) for item in value)
    return value


def upload_digest(files):
    paths = [
        str(item if isinstance(item, (str, Path)) else item.name) for item in files
    ]
    encoded = json.dumps(paths, ensure_ascii=False, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def enhance_ui(namespace, *, callbacks_enhanced=False):
    if namespace.get("_ui_experience_enabled"):
        return
    names = (
        "_dispatch_composer_ui",
        "_create_ui",
        "_stop_feedback",
        "_queue_attachments",
    )
    if not all(callable(namespace.get(name)) for name in names):
        raise ValueError(
            "This interface does not expose the required presentation hooks"
        )
    original_dispatch, original_create, original_stop, original_upload = (
        namespace[name] for name in names
    )

    @wraps(original_dispatch)
    def dispatch(*args, **kwargs):
        history = args[2] if len(args) > 2 else kwargs.get("history")
        yield from reveal_payloads(original_dispatch(*args, **kwargs), history)

    @wraps(original_stop)
    def stop(*args, **kwargs):
        return _stop_reveal(original_stop(*args, **kwargs))

    @wraps(original_upload)
    def upload(*args, **kwargs):
        result = original_upload(*args, **kwargs)
        files = args[0] if args else kwargs.get("files")
        if (
            files
            and isinstance(result, tuple)
            and len(result) == 2
            and isinstance(result[1], str)
        ):
            marker = (
                '<span hidden class="matagent-upload-ready-'
                f'{upload_digest(files)}"></span>'
            )
            return result[0], result[1] + "\n\n" + marker
        return result

    @wraps(original_create)
    def create(*args, **kwargs):
        page = original_create(*args, **kwargs)
        javascript = (
            Path(__file__).with_name("ui_upload_progress.js").read_text("utf-8")
        )
        with page:
            page.load(
                fn=None, inputs=None, outputs=None, js="() => {\n" + javascript + "\n}"
            )
        for function in page.fns.values():
            if getattr(function.fn, "__name__", "") == "dispatch_shell":
                function.stream_every = 0.04
        return page

    # Production callbacks may already carry the same presentation wrappers.
    # Always install the page script, and wrap callbacks only once.
    namespace.update(_create_ui=create, _ui_experience_enabled=True)
    if not callbacks_enhanced:
        namespace.update(
            _dispatch_composer_ui=dispatch,
            _stop_feedback=stop,
            _queue_attachments=upload,
        )
