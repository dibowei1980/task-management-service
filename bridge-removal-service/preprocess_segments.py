import json
import sys

from bridge_removal_task import run_automation_processing


def _read_arg_payload(arg: str) -> str:
    if arg.startswith("@"):
        path = arg[1:]
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return arg


def main() -> int:
    if len(sys.argv) < 3:
        sys.stdout.write(json.dumps({"error": "usage: preprocess_segments.py <task_id> <input_params_json_or_@file>"}, ensure_ascii=False))
        sys.stdout.write("\n")
        return 2

    task_id = sys.argv[1]
    raw = _read_arg_payload(sys.argv[2])
    try:
        input_params = json.loads(raw) if raw and raw.strip() else {}
    except Exception as e:
        sys.stdout.write(json.dumps({"error": "invalid_input_params", "message": str(e)}, ensure_ascii=False))
        sys.stdout.write("\n")
        return 2

    manifest: dict = {"task_id": task_id, "steps": [], "artifacts": {}}
    try:
        step_result = run_automation_processing(task_id, input_params)
        if isinstance(step_result, dict):
            step = step_result.get("step")
            artifacts = step_result.get("artifacts")
            error = step_result.get("error")
            if step is not None or error is not None:
                item: dict = {}
                if step is not None:
                    item["step"] = step
                if error is not None:
                    item["error"] = error
                manifest["steps"].append(item)
            if isinstance(artifacts, dict):
                manifest["artifacts"] = artifacts
            if error is not None and str(error).strip():
                manifest["error"] = str(error)
        else:
            manifest["error"] = "invalid_step_result"
    except Exception as e:
        manifest["error"] = str(e)
        manifest["steps"].append({"step": {"name": "automation_processing", "status": "failed"}, "error": str(e)})

    sys.stdout.write(json.dumps({"preprocess_manifest": manifest}, ensure_ascii=False))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

