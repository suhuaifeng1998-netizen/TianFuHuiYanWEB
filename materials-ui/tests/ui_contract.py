"""Normalize UI-only configuration for reproducible handoff regression checks."""
from copy import deepcopy
import json


def normalize(config):
    components = config["components"]
    ids = {component["id"]: index for index, component in enumerate(components)}
    ids[config["layout"]["id"]] = -1
    result = []
    for component in components:
        props = deepcopy(component["props"])
        props.pop("delete_callback", None)
        if component["type"] == "state":
            props.pop("value", None)
            if props.get("time_to_live") == float("inf"):
                props["time_to_live"] = None
        if props.get("elem_id") == "agent-banner":
            props["value"] = "<shared-banner>"
        result.append({"type": component["type"], "props": props})
    dependencies = []
    for dependency in config["dependencies"]:
        row = {key: deepcopy(dependency.get(key)) for key in (
            "api_name", "backend_fn", "queue", "cancels", "trigger_after", "trigger_only_on_success",
            "trigger_mode", "show_progress", "collects_event_data", "types", "api_visibility",
        )}
        for key in ["inputs", "outputs"]:row[key] = [ids[value] for value in dependency[key]]
        row["targets"] = [[ids.get(target, target), event] for target, event in dependency["targets"]]
        dependencies.append(row)
    return json.loads(json.dumps({"components": result, "dependencies": dependencies}, ensure_ascii=False))
