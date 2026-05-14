import json
import sys

from bridge_removal.mask_pipeline import run_mask_generation


def _read_arg_payload(arg: str) -> str:
    if arg.startswith("@"):
        path = arg[1:]
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return arg


def main() -> int:
    if len(sys.argv) < 3:
        sys.stdout.write(json.dumps({"error": "usage: mask_generate.py <task_id> <input_params_json_or_@file>"}, ensure_ascii=False))
        sys.stdout.write("\n")
        return 2
    task_id = sys.argv[1]
    raw = _read_arg_payload(sys.argv[2])
    try:
        json.loads(raw) if raw and raw.strip() else {}
    except Exception as e:
        sys.stdout.write(json.dumps({"error": "invalid_input_params", "message": str(e)}, ensure_ascii=False))
        sys.stdout.write("\n")
        return 2
    manifest: dict = {"task_id": task_id, "steps": [], "artifacts": {}}
    try:
        result = run_mask_generation(task_id, raw)
        manifest["artifacts"] = result
        if isinstance(result, dict) and result.get("error"):
            manifest["error"] = str(result.get("error"))
            manifest["steps"].append({"step": {"name": "mask_generation", "status": "failed"}, "error": manifest["error"]})
        else:
            manifest["steps"].append({"step": {"name": "mask_generation", "status": "completed"}})
    except Exception as e:
        manifest["error"] = str(e)
        manifest["steps"].append({"step": {"name": "mask_generation", "status": "failed"}, "error": str(e)})
    sys.stdout.write(json.dumps({"mask_manifest": manifest}, ensure_ascii=False))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
