import json
import math
import os
import sys
import traceback

import cv2
import numpy as np


def _read_payload_arg(arg: str) -> dict:
    raw = ""
    if arg.startswith("@"):
        with open(arg[1:], "r", encoding="utf-8") as f:
            raw = f.read()
    else:
        raw = arg
    if not raw or not raw.strip():
        return {}
    return json.loads(raw)


def _read_world_file(path: str):
    values = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if not s:
                continue
            values.append(float(s))
    if len(values) < 6:
        raise RuntimeError("MERGE_RESULTS_WORLD_FILE_INVALID")
    return values[0], values[1], values[2], values[3], values[4], values[5]


def _read_image(path: str) -> np.ndarray:
    data = np.fromfile(path, dtype=np.uint8)
    if data.size == 0:
        raise RuntimeError(f"MERGE_RESULTS_IMAGE_EMPTY:{path}")
    img = cv2.imdecode(data, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise RuntimeError(f"MERGE_RESULTS_READ_IMAGE_FAILED:{path}")
    return img


def _to_bgr_white_bg(img: np.ndarray) -> np.ndarray:
    if img.ndim == 2:
        return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    if img.shape[2] == 3:
        return img
    if img.shape[2] == 4:
        bgr = img[:, :, :3].astype(np.float32)
        alpha = img[:, :, 3].astype(np.float32) / 255.0
        alpha_3 = np.repeat(alpha[:, :, None], 3, axis=2)
        white = np.full_like(bgr, 255.0)
        mixed = bgr * alpha_3 + white * (1.0 - alpha_3)
        return np.clip(mixed, 0, 255).astype(np.uint8)
    raise RuntimeError("MERGE_RESULTS_UNSUPPORTED_CHANNELS")


def _detect_orientation(images, world_paths):
    if len(world_paths) == len(images):
        centers = []
        valid = True
        for idx, wp in enumerate(world_paths):
            if not wp or not os.path.isfile(wp):
                valid = False
                break
            try:
                a, d, b, e, c, f = _read_world_file(wp)
            except Exception:
                valid = False
                break
            h, w = images[idx].shape[:2]
            cx = a * (w / 2.0) + b * (h / 2.0) + c
            cy = d * (w / 2.0) + e * (h / 2.0) + f
            centers.append((cx, cy))
        if valid and centers:
            xs = [p[0] for p in centers]
            ys = [p[1] for p in centers]
            if (max(ys) - min(ys)) > (max(xs) - min(xs)):
                return "vertical"
            return "horizontal"
    total_w = sum(img.shape[1] for img in images)
    total_h = sum(img.shape[0] for img in images)
    return "horizontal" if total_w >= total_h else "vertical"


def _merge_images(images, orientation: str) -> np.ndarray:
    bgr_images = [_to_bgr_white_bg(img) for img in images]
    if orientation == "vertical":
        width = max(img.shape[1] for img in bgr_images)
        height = sum(img.shape[0] for img in bgr_images)
        canvas = np.full((height, width, 3), 255, dtype=np.uint8)
        y = 0
        for img in bgr_images:
            h, w = img.shape[:2]
            canvas[y:y + h, 0:w] = img
            y += h
        return canvas
    width = sum(img.shape[1] for img in bgr_images)
    height = max(img.shape[0] for img in bgr_images)
    canvas = np.full((height, width, 3), 255, dtype=np.uint8)
    x = 0
    for img in bgr_images:
        h, w = img.shape[:2]
        canvas[0:h, x:x + w] = img
        x += w
    return canvas


def _world_layout(images, world_paths):
    if len(world_paths) != len(images):
        return None
    world_items = []
    for idx, wp in enumerate(world_paths):
        p = str(wp or "").strip()
        if not p or not os.path.isfile(p):
            return None
        a, d, b, e, c, f = _read_world_file(p)
        h, w = images[idx].shape[:2]
        if w <= 0 or h <= 0:
            return None
        world_items.append({"a": float(a), "d": float(d), "b": float(b), "e": float(e), "c": float(c), "f": float(f), "w": int(w), "h": int(h)})
    res_x_candidates = [abs(item["a"]) for item in world_items if abs(item["a"]) > 1e-12]
    res_y_candidates = [abs(item["e"]) for item in world_items if abs(item["e"]) > 1e-12]
    if not res_x_candidates or not res_y_candidates:
        return None
    res_x = float(np.median(np.array(res_x_candidates, dtype=np.float64)))
    res_y = float(np.median(np.array(res_y_candidates, dtype=np.float64)))
    if res_x <= 0 or res_y <= 0:
        return None
    a_med = float(np.median(np.array([item["a"] for item in world_items], dtype=np.float64)))
    b_med = float(np.median(np.array([item["b"] for item in world_items], dtype=np.float64)))
    d_med = float(np.median(np.array([item["d"] for item in world_items], dtype=np.float64)))
    e_med = float(np.median(np.array([item["e"] for item in world_items], dtype=np.float64)))
    min_x = None
    max_x = None
    min_y = None
    max_y = None
    for item in world_items:
        a = item["a"]
        d = item["d"]
        b = item["b"]
        e = item["e"]
        c = item["c"]
        f = item["f"]
        w = item["w"]
        h = item["h"]
        corners = [
            (0.0, 0.0),
            (float(w), 0.0),
            (0.0, float(h)),
            (float(w), float(h)),
        ]
        xs = []
        ys = []
        for col, row in corners:
            xs.append(a * col + b * row + c)
            ys.append(d * col + e * row + f)
        cx0 = min(xs)
        cx1 = max(xs)
        cy0 = min(ys)
        cy1 = max(ys)
        min_x = cx0 if min_x is None else min(min_x, cx0)
        max_x = cx1 if max_x is None else max(max_x, cx1)
        min_y = cy0 if min_y is None else min(min_y, cy0)
        max_y = cy1 if max_y is None else max(max_y, cy1)
    if min_x is None or max_x is None or min_y is None or max_y is None:
        return None
    x_positive = a_med >= 0
    y_positive = e_med >= 0
    anchor_x = min_x if x_positive else max_x
    anchor_y = min_y if y_positive else max_y
    raw_placements = []
    for item in world_items:
        c = item["c"]
        f = item["f"]
        w = item["w"]
        h = item["h"]
        if x_positive:
            ox = int(round((c - anchor_x) / res_x))
        else:
            ox = int(round((anchor_x - c) / res_x))
        if y_positive:
            oy = int(round((f - anchor_y) / res_y))
        else:
            oy = int(round((anchor_y - f) / res_y))
        raw_placements.append((ox, oy, w, h))
    if not raw_placements:
        return None
    min_ox = min(p[0] for p in raw_placements)
    min_oy = min(p[1] for p in raw_placements)
    max_x1 = max(p[0] + p[2] for p in raw_placements)
    max_y1 = max(p[1] + p[3] for p in raw_placements)
    shift_x = -min_ox if min_ox < 0 else 0
    shift_y = -min_oy if min_oy < 0 else 0
    canvas_w = int(max(1, max_x1 + shift_x))
    canvas_h = int(max(1, max_y1 + shift_y))
    placements = [(ox + shift_x, oy + shift_y, w, h) for ox, oy, w, h in raw_placements]
    x_sign = 1.0 if x_positive else -1.0
    y_sign = 1.0 if y_positive else -1.0
    anchor_x_adj = float(anchor_x - x_sign * shift_x * res_x)
    anchor_y_adj = float(anchor_y - y_sign * shift_y * res_y)
    transform = (a_med, d_med, b_med, e_med, anchor_x_adj, anchor_y_adj)
    return {"canvas_w": canvas_w, "canvas_h": canvas_h, "placements": placements, "transform": transform}


def _merge_images_by_world(images, world_paths):
    layout = _world_layout(images, world_paths)
    if layout is None:
        return None
    canvas_w = int(layout["canvas_w"])
    canvas_h = int(layout["canvas_h"])
    placements = layout["placements"]
    transform = layout["transform"]
    canvas = np.full((canvas_h, canvas_w, 3), 255, dtype=np.uint8)
    bgr_images = [_to_bgr_white_bg(img) for img in images]
    for idx, img in enumerate(bgr_images):
        ox, oy, w, h = placements[idx]
        x0 = max(0, ox)
        y0 = max(0, oy)
        x1 = min(canvas_w, ox + w)
        y1 = min(canvas_h, oy + h)
        if x1 <= x0 or y1 <= y0:
            continue
        sx0 = x0 - ox
        sy0 = y0 - oy
        sx1 = sx0 + (x1 - x0)
        sy1 = sy0 + (y1 - y0)
        canvas[y0:y1, x0:x1] = img[sy0:sy1, sx0:sx1]
    return canvas, transform


def _write_png(path: str, img: np.ndarray):
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    ok, data = cv2.imencode(".png", img, [cv2.IMWRITE_PNG_COMPRESSION, 0])
    if not ok:
        raise RuntimeError(f"MERGE_RESULTS_ENCODE_FAILED:{path}")
    data.tofile(path)


def _world_file_extension_for_image(path: str) -> str:
    lower = str(path or "").lower()
    if lower.endswith(".png"):
        return ".pgw"
    if lower.endswith(".tif") or lower.endswith(".tiff"):
        return ".tfw"
    return ".tfw"


def _build_world_file_path(image_path: str) -> str:
    base, _ = os.path.splitext(image_path)
    return base + _world_file_extension_for_image(image_path)


def _write_world_file(path: str, transform):
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    a, d, b, e, c, f = transform
    lines = [a, d, b, e, c, f]
    with open(path, "w", encoding="utf-8") as fobj:
        for v in lines:
            fobj.write(f"{float(v):.12f}\n")


def run(payload: dict):
    output_path = str(payload.get("output_path") or "").strip()
    segment_paths = payload.get("segment_result_paths")
    world_paths = payload.get("segment_world_file_paths")
    if not isinstance(segment_paths, list) or not segment_paths:
        return 1, {
            "status": "error",
            "code": "MERGE_RESULTS_SEGMENTS_REQUIRED",
            "message": "segment_result_paths_required",
        }
    if not output_path:
        return 1, {
            "status": "error",
            "code": "MERGE_RESULTS_OUTPUT_REQUIRED",
            "message": "output_path_required",
        }
    if not isinstance(world_paths, list):
        world_paths = []
    checked_paths = []
    missing = []
    for p in segment_paths:
        sp = str(p or "").strip()
        if not sp:
            missing.append(sp)
            continue
        lower = sp.lower()
        if not (lower.endswith(".png") or lower.endswith(".jpg") or lower.endswith(".jpeg")):
            missing.append(sp)
            continue
        if not os.path.isfile(sp) or not os.access(sp, os.R_OK):
            missing.append(sp)
            continue
        checked_paths.append(sp)
    if missing:
        return 1, {
            "status": "error",
            "code": "MERGE_RESULTS_MISSING_SEGMENTS",
            "message": "missing_segment_results",
            "missing_segments": missing,
        }
    created = False
    output_world_file_path = None
    try:
        images = [_read_image(p) for p in checked_paths]
        normalized_world_paths = [str(v or "").strip() for v in world_paths]
        orientation = _detect_orientation(images, normalized_world_paths)
        merged_by_world = _merge_images_by_world(images, normalized_world_paths)
        merged_transform = None
        if merged_by_world is None:
            merged = _merge_images(images, orientation)
        else:
            merged, merged_transform = merged_by_world
        _write_png(output_path, merged)
        if merged_transform is not None:
            output_world_file_path = _build_world_file_path(output_path)
            _write_world_file(output_world_file_path, merged_transform)
        created = True
        h, w = merged.shape[:2]
        result = {
            "status": "ok",
            "code": "MERGE_RESULTS_OK",
            "message": "ok",
            "output_path": output_path,
            "orientation": orientation,
            "segment_count": len(checked_paths),
            "width": int(w),
            "height": int(h),
        }
        if output_world_file_path:
            result["output_world_file_path"] = output_world_file_path
        return 0, result
    except Exception as ex:
        rolled_back = False
        rolled_back_world = False
        try:
            if os.path.isfile(output_path) and os.path.getsize(output_path) == 0:
                os.remove(output_path)
                rolled_back = True
        except Exception:
            pass
        try:
            if output_world_file_path and os.path.isfile(output_world_file_path) and os.path.getsize(output_world_file_path) == 0:
                os.remove(output_world_file_path)
                rolled_back_world = True
        except Exception:
            pass
        return 1, {
            "status": "error",
            "code": "MERGE_RESULTS_FAILED",
            "message": str(ex) if str(ex) else ex.__class__.__name__,
            "output_path": output_path,
            "output_world_file_path": output_world_file_path,
            "created": created,
            "rolled_back_zero_byte_file": rolled_back,
            "rolled_back_zero_byte_world_file": rolled_back_world,
            "traceback": traceback.format_exc(limit=3),
        }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "code": "MERGE_RESULTS_ARG_REQUIRED", "message": "payload_required"}, ensure_ascii=False))
        return 2
    payload = _read_payload_arg(sys.argv[1])
    exit_code, output = run(payload)
    print(json.dumps(output, ensure_ascii=False))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
