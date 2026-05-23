import json
import os
import sys
import time
import traceback

import cv2
import numpy as np

try:
    from .dom_mosaic import ImageTile
except ImportError:
    from dom_mosaic import ImageTile


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
        raise RuntimeError("OVERLAP_FIX_WORLD_FILE_INVALID")
    return values[0], values[1], values[2], values[3], values[4], values[5]


def _read_image(path: str, mode=cv2.IMREAD_UNCHANGED):
    img = cv2.imread(path, mode)
    if img is None:
        raise RuntimeError(f"OVERLAP_FIX_READ_IMAGE_FAILED:{path}")
    return img


def _write_image(path: str, image: np.ndarray):
    ext = os.path.splitext(path)[1].lower()
    params = []
    if ext in (".png",):
        params = [cv2.IMWRITE_PNG_COMPRESSION, 0]
    elif ext in (".tif", ".tiff"):
        params = [cv2.IMWRITE_TIFF_COMPRESSION, 1]
    ok = cv2.imwrite(path, image, params)
    if not ok:
        raise RuntimeError(f"OVERLAP_FIX_WRITE_IMAGE_FAILED:{path}")


def _to_bgra(img: np.ndarray) -> np.ndarray:
    if img.ndim == 2:
        return cv2.cvtColor(img, cv2.COLOR_GRAY2BGRA)
    if img.shape[2] == 4:
        return img
    return cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)


def _from_bgra(src: np.ndarray, ref: np.ndarray) -> np.ndarray:
    if ref.ndim == 2:
        return cv2.cvtColor(src, cv2.COLOR_BGRA2GRAY)
    if ref.shape[2] == 4:
        return src
    return cv2.cvtColor(src, cv2.COLOR_BGRA2BGR)


def _mask_suffix_path(path: str, suffix: str) -> str:
    root, ext = os.path.splitext(path)
    if not ext:
        ext = ".png"
    return root + suffix + ext


def _build_overlap_fixed_path(path: str) -> str:
    root, ext = os.path.splitext(path)
    if not ext:
        ext = ".png"
    return root + "_overlap_fixed" + ext


def _world_file_extension_for_image_path(path: str) -> str:
    lower = str(path or "").lower()
    if lower.endswith(".png"):
        return ".pgw"
    if lower.endswith(".tif") or lower.endswith(".tiff"):
        return ".tfw"
    return ".tfw"


def _feather_part_alpha(part_bgra: np.ndarray, blend_width: int) -> np.ndarray:
    alpha = part_bgra[:, :, 3]
    h, w = alpha.shape
    _, mask = cv2.threshold(alpha, 1, 255, cv2.THRESH_BINARY)
    blend_width = max(1, int(blend_width))
    pad = blend_width + 5
    mask_padded = cv2.copyMakeBorder(mask, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=255)
    dist = cv2.distanceTransform(mask_padded, cv2.DIST_L2, 5)
    dist_cropped = dist[pad : pad + h, pad : pad + w]
    weight = np.clip(dist_cropped / blend_width, 0.0, 1.0)
    new_alpha = alpha.astype(np.float32) * weight
    out = part_bgra.copy()
    out[:, :, 3] = new_alpha.astype(np.uint8)
    return out


def _overlay_with_alpha(canvas_bgra: np.ndarray, part_bgra: np.ndarray, feather_px: int) -> np.ndarray:
    #part = part_bgra
    part = _feather_part_alpha(part_bgra, feather_px)
    src_alpha = part[:, :, 3]
    if not np.any(src_alpha > 0):
        return canvas_bgra
    out = canvas_bgra.copy()
    dst_alpha = out[:, :, 3]
    mask_copy = (src_alpha > 0) & (dst_alpha == 0)
    if np.any(mask_copy):
        out[mask_copy] = part[mask_copy]
    mask_blend = (src_alpha > 0) & (dst_alpha > 0)
    if np.any(mask_blend):
        alpha_s = src_alpha[mask_blend].astype(np.float32) / 255.0
        alpha_d = dst_alpha[mask_blend].astype(np.float32) / 255.0
        alpha_out = alpha_s + alpha_d * (1.0 - alpha_s)
        alpha_out_safe = alpha_out.copy()
        alpha_out_safe[alpha_out_safe < 1e-6] = 1.0
        for c in range(3):
            val_s = part[mask_blend, c].astype(np.float32)
            val_d = out[mask_blend, c].astype(np.float32)
            val_out = (val_s * alpha_s + val_d * alpha_d * (1.0 - alpha_s)) / alpha_out_safe
            out[mask_blend, c] = np.clip(val_out, 0, 255).astype(np.uint8)
        out[mask_blend, 3] = np.clip(alpha_out * 255.0, 0, 255).astype(np.uint8)
    return out


def _get_feather_px(payload: dict, default_px: int = 6) -> int:
    raw = payload.get("feather_px")
    if raw is None:
        return max(1, int(default_px))
    try:
        v = int(raw)
        return max(1, v)
    except Exception:
        return max(1, int(default_px))


def _map_bounds(current_world_file: str, current_image_path: str):
    a, d, b, e, c, f = _read_world_file(current_world_file)
    img = _read_image(current_image_path)
    h, w = img.shape[:2]
    x_tl = c
    y_tl = f
    x_br = a * w + b * h + c
    y_br = d * w + e * h + f
    minx = min(x_tl, x_br)
    maxx = max(x_tl, x_br)
    miny = min(y_tl, y_br)
    maxy = max(y_tl, y_br)
    return (minx, miny, maxx, maxy), abs(a), w, h


def _prepare_prev_result_tile(prev_result_path: str, prev_world_file_path: str):
    world_target = os.path.splitext(prev_result_path)[0] + _world_file_extension_for_image_path(prev_result_path)
    if not os.path.exists(world_target):
        with open(prev_world_file_path, "r", encoding="utf-8") as src:
            world_data = src.read()
        with open(world_target, "w", encoding="utf-8") as dst:
            dst.write(world_data)
    tile = ImageTile(prev_result_path)
    if not tile.valid:
        raise RuntimeError("OVERLAP_FIX_PREV_RESULT_TILE_INVALID")
    return tile, world_target


def _erase_mask(mask_path: str, overlap_alpha: np.ndarray, output_path: str):
    mask = _read_image(mask_path, cv2.IMREAD_UNCHANGED)
    mh, mw = mask.shape[:2]
    oh, ow = overlap_alpha.shape[:2]
    local_overlap = overlap_alpha
    if mh != oh or mw != ow:
        local_overlap = cv2.resize(overlap_alpha, (mw, mh), interpolation=cv2.INTER_NEAREST)
    erase = local_overlap > 0
    if mask.ndim == 2:
        mask[erase] = 0
    else:
        mask[erase, :] = 0
    _write_image(output_path, mask)


def run(payload: dict):
    started = time.time()
    created = []
    try:
        previous_result_path = str(payload.get("previous_result_path") or "").strip()
        previous_world_file_path = str(payload.get("previous_world_file_path") or "").strip()
        current_image_path = str(payload.get("current_image_path") or "").strip()
        current_world_file_path = str(payload.get("current_world_file_path") or "").strip()
        mask1_path = str(payload.get("mask1_path") or "").strip()
        mask2_path = str(payload.get("mask2_path") or "").strip()
        feather_px = _get_feather_px(payload, 6)
        if not previous_result_path:
            raise RuntimeError("OVERLAP_FIX_PREVIOUS_RESULT_REQUIRED")
        if not previous_world_file_path:
            raise RuntimeError("OVERLAP_FIX_PREVIOUS_WORLD_FILE_REQUIRED")
        if not current_image_path:
            raise RuntimeError("OVERLAP_FIX_CURRENT_IMAGE_REQUIRED")
        if not current_world_file_path:
            raise RuntimeError("OVERLAP_FIX_CURRENT_WORLD_FILE_REQUIRED")
        if not mask1_path or not mask2_path:
            raise RuntimeError("OVERLAP_FIX_MASK_PATH_REQUIRED")
        for p in [previous_result_path, previous_world_file_path, current_image_path, current_world_file_path, mask1_path, mask2_path]:
            if not os.path.isfile(p):
                raise RuntimeError(f"OVERLAP_FIX_FILE_NOT_FOUND:{p}")

        map_bounds, target_res, target_width, target_height = _map_bounds(current_world_file_path, current_image_path)
        tile, temp_prev_world = _prepare_prev_result_tile(previous_result_path, previous_world_file_path)
        warped = tile.read_region(map_bounds, target_res, target_width, target_height)
        if warped is None:
            raise RuntimeError("OVERLAP_FIX_WARP_FAILED")
        current = _read_image(current_image_path, cv2.IMREAD_UNCHANGED)
        current_bgra = _to_bgra(current)
        warped_bgra = _to_bgra(warped)
        overlap_alpha = warped_bgra[:, :, 3]
        overlap_mask = overlap_alpha > 0
        current_bgra = _overlay_with_alpha(current_bgra, warped_bgra, feather_px=feather_px)

        temp_image_path = _build_overlap_fixed_path(current_image_path)
        temp_mask1_path = _mask_suffix_path(mask1_path, "_temp_mask1")
        temp_mask2_path = _mask_suffix_path(mask2_path, "_temp_mask2")
        _write_image(temp_image_path, _from_bgra(current_bgra, current))
        created.append(temp_image_path)
        _erase_mask(mask1_path, overlap_alpha, temp_mask1_path)
        created.append(temp_mask1_path)
        _erase_mask(mask2_path, overlap_alpha, temp_mask2_path)
        created.append(temp_mask2_path)

        duration_ms = int((time.time() - started) * 1000)
        return 0, {
            "status": "ok",
            "code": "OVERLAP_FIX_OK",
            "message": "ok",
            "temp_image_path": temp_image_path,
            "temp_mask1_path": temp_mask1_path,
            "temp_mask2_path": temp_mask2_path,
            "overlap_pixel_count": int(np.count_nonzero(overlap_mask)),
            "feather_px_used": feather_px,
            "generated_temp_files": created,
            "duration_ms": duration_ms,
            "temp_prev_world_file_path": temp_prev_world,
        }
    except Exception as ex:
        removed = []
        for p in created:
            try:
                if os.path.exists(p):
                    os.remove(p)
                    removed.append(p)
            except Exception:
                pass
        duration_ms = int((time.time() - started) * 1000)
        code = "OVERLAP_FIX_FAILED"
        msg = str(ex) if str(ex) else ex.__class__.__name__
        return 1, {
            "status": "error",
            "code": code,
            "message": msg,
            "rolled_back_files": removed,
            "duration_ms": duration_ms,
            "traceback": traceback.format_exc(limit=3),
        }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "code": "OVERLAP_FIX_ARG_REQUIRED", "message": "payload_required"}, ensure_ascii=False))
        return 2
    payload = _read_payload_arg(sys.argv[1])
    exit_code, output = run(payload)
    print(json.dumps(output, ensure_ascii=False))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
