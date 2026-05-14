import argparse
import json
import os
from pathlib import Path

import inpaint_gen_Runninghub as mod


DEFAULT_ORIGINAL = r"D:\work\devlope\生产协同系统\automation-scripts\intermediate\383b1a24-56fc-47c9-b070-fc32433e8b71\segments\bridge_2_1.png"
DEFAULT_REMOVAL_MASK = r"D:\work\devlope\生产协同系统\automation-scripts\intermediate\383b1a24-56fc-47c9-b070-fc32433e8b71\masks\bridge_2_1\bridge_2_1_mask_with_shadow.png"
DEFAULT_CROP_MASK = r"D:\work\devlope\生产协同系统\automation-scripts\intermediate\383b1a24-56fc-47c9-b070-fc32433e8b71\masks\bridge_2_1\bridge_2_1_mask_cut_with_shadow.png"
DEFAULT_OUTPUT_DIR = r"D:\work\devlope\生产协同系统\automation-scripts\intermediate\383b1a24-56fc-47c9-b070-fc32433e8b71\segments\images\pool_test"


def run_single(api_key: str, original: str, removal_mask: str, crop_mask: str, output_dir: str, seed: str, job_id: str):
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    output_path = str(Path(output_dir) / "single.png")
    result = mod.run_with_pool(mod.qwen_bridge_removal, api_key, original, removal_mask, crop_mask, output_path, seed, job_id)
    return {"mode": "single", "output_path": result}


def run_batch(api_key: str, original: str, removal_mask: str, crop_mask: str, output_dir: str, seed: str, job_id: str, count: int):
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    args_list = []
    for i in range(1, count + 1):
        output_path = str(Path(output_dir) / f"batch_{i}.png")
        args_list.append((api_key, original, removal_mask, crop_mask, output_path, seed, job_id))
    results, errors = mod.run_batch_with_pool(mod.qwen_bridge_removal, args_list)
    success, payload = mod._aggregate_batch_results(job_id or "manual_pool_test", results, errors)
    return {"mode": "batch", "success": success, "payload": payload}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-key", default=os.getenv("RUNNINGHUB_API_KEY", "").strip())
    parser.add_argument("--original", default=DEFAULT_ORIGINAL)
    parser.add_argument("--removal-mask", default=DEFAULT_REMOVAL_MASK)
    parser.add_argument("--crop-mask", default=DEFAULT_CROP_MASK)
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--seed", default="")
    parser.add_argument("--job-id", default="manual_pool_test_job")
    parser.add_argument("--count", type=int, default=2)
    parser.add_argument("--mode", choices=["single", "batch", "both"], default="both")
    args = parser.parse_args()

    if not args.api_key:
        raise RuntimeError("缺少api_key，请使用 --api-key 或环境变量 RUNNINGHUB_API_KEY")
    if args.count < 1:
        raise RuntimeError("count 必须 >= 1")

    out = {"mode": args.mode, "results": []}
    if args.mode in ("single", "both"):
        out["results"].append(run_single(args.api_key, args.original, args.removal_mask, args.crop_mask, args.output_dir, args.seed, args.job_id))
    if args.mode in ("batch", "both"):
        out["results"].append(run_batch(args.api_key, args.original, args.removal_mask, args.crop_mask, args.output_dir, args.seed, args.job_id, args.count))
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
