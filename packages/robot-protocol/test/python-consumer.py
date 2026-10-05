"""Read-only conformance probe: execute only the pure consumer method, without ROS."""
import ast
import json
import pathlib
import sys
import types

source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
tree = ast.parse(source)
bridge = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "WebBridge")
method = next(node for node in bridge.body if isinstance(node, ast.FunctionDef) and node.name == "handle_motion_event")
# Read its allowlist from the inspected source rather than reproducing it here.
actions = next(node.value for node in bridge.body if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "MOTION_ACTIONS" for target in node.targets))
namespace = {"json": json, "time": types.SimpleNamespace(time=lambda: 1700000003), "MotionRequest": types.SimpleNamespace, "status": lambda *args: args}
exec(compile(ast.Module(body=[method], type_ignores=[]), "<robot-consumer>", "exec"), namespace)
allowed = ast.literal_eval(actions.args[0])
results = []
for command in json.load(sys.stdin):
    published = []
    robot = types.SimpleNamespace(MOTION_ACTIONS=allowed, motion_publisher=types.SimpleNamespace(publish=published.append), status_publisher=types.SimpleNamespace(publish=lambda _: None))
    try:
        namespace["handle_motion_event"](robot, json.dumps(command))
        results.append({"accepted": True, "action": published[0].action, "duration": published[0].max_duration_ms})
    except (ValueError, TypeError):
        results.append({"accepted": False})
print(json.dumps(results))
