import json
import os
import time
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
from bridge_removal.extract_masks_pipeline import ExtractMasksPipeline
from bridge_removal.image_utils import safe_imwrite as _safe_imwrite


import logging

logger = logging.getLogger(__name__)

BIG_BRIDGE_WIDTH_M = 15.0
BIG_BRIDGE_LENGTH_M = 100.0
BIG_BRIDGE_WIDTH_PX = 30
BIG_BRIDGE_LENGTH_PX = 200


def is_big_bridge(segment_data: Dict[str, Any]) -> bool:
    props = segment_data.get("properties") if isinstance(segment_data, dict) else {}
    if not isinstance(props, dict):
        props = {}
    geo = segment_data.get("geometry") if isinstance(segment_data, dict) else {}
    if not isinstance(geo, dict):
        geo = {}

    bridge_width = props.get("bridge_width")
    bridge_length = props.get("length")
    resolution = props.get("resolution")

    if bridge_width is not None and bridge_length is not None:
        try:
            w = float(bridge_width)
            l = float(bridge_length)
            if w >= BIG_BRIDGE_WIDTH_M or l >= BIG_BRIDGE_LENGTH_M:
                return True
        except (ValueError, TypeError):
            pass

    if resolution is not None and bridge_width is not None and bridge_length is not None:
        try:
            res = float(resolution)
            if res > 0:
                wpx = float(bridge_width) / res
                lpx = float(bridge_length) / res
                if wpx >= BIG_BRIDGE_WIDTH_PX or lpx >= BIG_BRIDGE_LENGTH_PX:
                    return True
        except (ValueError, TypeError):
            pass

    return False


def _sam2_available() -> bool:
    try:
        import sam2  # noqa: F401
        return True
    except ImportError:
        pass
    try:
        from segment_anything import sam_model_registry  # noqa: F401
        return True
    except ImportError:
        pass
    return False


def _ensure_dir(path: str) -> str:
    os.makedirs(path, exist_ok=True)
    return path


def _collect_polygon_rings(geometry: Dict[str, Any]) -> List[List[List[float]]]:
    if not isinstance(geometry, dict):
        return []
    gtype = str(geometry.get("type") or "").lower()
    coords = geometry.get("coordinates") or []
    rings: List[List[List[float]]] = []
    if gtype == "polygon":
        for ring in coords:
            if isinstance(ring, list) and ring:
                rings.append(ring)
    elif gtype == "multipolygon":
        for poly in coords:
            if isinstance(poly, list):
                for ring in poly:
                    if isinstance(ring, list) and ring:
                        rings.append(ring)
    return rings


def _world_to_pixel(points: List[List[float]], bounds: Tuple[float, float, float, float], resolution: float) -> np.ndarray:
    minx, miny, maxx, maxy = bounds
    pts = []
    for p in points:
        if not isinstance(p, (list, tuple)) or len(p) < 2:
            continue
        x, y = float(p[0]), float(p[1])
        col = int(round((x - minx) / resolution))
        row = int(round((maxy - y) / resolution))
        pts.append([col, row])
    return np.array(pts, dtype=np.int32)


def _polygon_to_mask(geometry: Dict[str, Any], bounds: Tuple[float, float, float, float], resolution: float, width: int, height: int) -> np.ndarray:
    mask = np.zeros((height, width), dtype=np.uint8)
    rings = _collect_polygon_rings(geometry)
    if not rings:
        return mask
    outer = rings[0]
    outer_pts = _world_to_pixel(outer, bounds, resolution)
    if outer_pts.size > 0:
        cv2.fillPoly(mask, [outer_pts], 255)
    if len(rings) > 1:
        for hole in rings[1:]:
            hole_pts = _world_to_pixel(hole, bounds, resolution)
            if hole_pts.size > 0:
                cv2.fillPoly(mask, [hole_pts], 0)
    return mask


def _read_segment_json(json_path: str) -> Optional[Dict[str, Any]]:
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _find_image_for_json(json_path: str) -> Optional[str]:
    base = os.path.splitext(json_path)[0]
    for ext in (".png", ".jpg", ".jpeg", ".tif", ".tiff"):
        img = base + ext
        if os.path.exists(img):
            return img
    return None


def _load_segments(segments_dir: str) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    if not os.path.exists(segments_dir):
        return items
    for name in os.listdir(segments_dir):
        if not name.lower().endswith(".json") or name.endswith("_segments.json"):
            continue
        json_path = os.path.join(segments_dir, name)
        data = _read_segment_json(json_path)
        if not data:
            continue
        image_path = _find_image_for_json(json_path)
        if not image_path:
            continue
        items.append({"json_path": json_path, "image_path": image_path, "data": data})
    return items


def _compute_resolution(bounds: Tuple[float, float, float, float], width: int, height: int, fallback: float) -> float:
    if fallback and fallback > 0:
        return float(fallback)
    minx, miny, maxx, maxy = bounds
    if width > 0:
        return max((maxx - minx) / float(width), 1e-9)
    if height > 0:
        return max((maxy - miny) / float(height), 1e-9)
    return 0.5


def _shadow_mask(image: np.ndarray, bridge_mask: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        gray = image
        alpha = None
    else:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.shape[2] >= 3 else image[:, :, 0]
        alpha = image[:, :, 3] if image.shape[2] == 4 else None
    valid = np.ones_like(gray, dtype=np.uint8) * 255
    if alpha is not None:
        valid = (alpha > 0).astype(np.uint8) * 255
    if bridge_mask is not None and bridge_mask.size:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
        expanded = cv2.dilate(bridge_mask, kernel, iterations=2)
        valid = cv2.bitwise_and(valid, expanded)
    coords = gray[valid > 0]
    if coords.size < 10:
        return np.zeros_like(gray, dtype=np.uint8)
    thresh = np.percentile(coords, 20)
    shadow = ((gray <= thresh) & (valid > 0)).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    shadow = cv2.morphologyEx(shadow, cv2.MORPH_OPEN, kernel, iterations=1)
    return shadow


def _overlay_mask(image: np.ndarray, mask: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        base = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    elif image.shape[2] == 4:
        base = image[:, :, :3].copy()
    else:
        base = image.copy()
    overlay = base.copy()
    overlay[mask > 0] = (0, 0, 255)
    return cv2.addWeighted(base, 0.7, overlay, 0.3, 0)


def generate_bridge_masks(segments_dir: str, output_dir: str, enable_shadow: bool = False, dilate_iterations: int = 2) -> Dict[str, Any]:
    _ensure_dir(output_dir)
    items = _load_segments(segments_dir)
    print("mask_pipline.py 149lines:Loaded segments:", items)
    manifest: Dict[str, Any] = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "segments_dir": segments_dir,
        "output_dir": output_dir,
        "segment_count": len(items),
        "segments": [],
    }
    if not items:
        manifest["error"] = "segments_not_found"
        return manifest
    for item in items:
        json_path = item["json_path"]
        image_path = item["image_path"]
        data = item["data"]
        img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
        if img is None:
            manifest["segments"].append({"json_path": json_path, "image_path": image_path, "error": "image_read_failed"})
            continue
        height, width = img.shape[:2]
        geo = data.get("geometry") if isinstance(data, dict) else None
        if not isinstance(geo, dict):
            manifest["segments"].append({"json_path": json_path, "image_path": image_path, "error": "geometry_missing"})
            continue
        bounds = geo.get("bounds_geo") or geo.get("bounds") or geo.get("bbox")
        if not bounds or len(bounds) < 4:
            manifest["segments"].append({"json_path": json_path, "image_path": image_path, "error": "bounds_missing"})
            continue
        bounds_tuple = (float(bounds[0]), float(bounds[1]), float(bounds[2]), float(bounds[3]))
        props = data.get("properties") if isinstance(data, dict) else {}
        resolution = _compute_resolution(bounds_tuple, width, height, float(props.get("resolution", 0) or 0))
        bridge_polygon = geo.get("bridge_polygon") or geo.get("polygon")
        segment_polygon = geo.get("polygon") if isinstance(geo.get("polygon"), dict) else None
        if not isinstance(bridge_polygon, dict):
            manifest["segments"].append({"json_path": json_path, "image_path": image_path, "error": "bridge_polygon_missing"})
            continue
        mask_sam = _polygon_to_mask(bridge_polygon, bounds_tuple, resolution, width, height)
        if segment_polygon:
            segment_mask = _polygon_to_mask(segment_polygon, bounds_tuple, resolution, width, height)
            mask_cut = cv2.bitwise_and(mask_sam, segment_mask)
        else:
            mask_cut = mask_sam
        if enable_shadow:
            shadow_mask = _shadow_mask(img, mask_cut)
            merged = cv2.bitwise_or(mask_cut, shadow_mask)
        else:
            shadow_mask = np.zeros_like(mask_cut)
            merged = mask_cut
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        merged = cv2.dilate(merged, kernel, iterations=dilate_iterations)
        overlay = _overlay_mask(img, merged)
        base = os.path.splitext(os.path.basename(json_path))[0]
        seg_output_dir = os.path.join(output_dir, base)
        _ensure_dir(seg_output_dir)
        mask_sam_path = os.path.join(seg_output_dir, f"{base}_mask_sam.png")
        mask_cut_path = os.path.join(seg_output_dir, f"{base}_mask_cut.png")
        shadow_path = os.path.join(seg_output_dir, f"{base}_shadow_mask.png")
        cut_merged_path = os.path.join(seg_output_dir, f"{base}_mask_cut_with_shadow.png")
        merged_path = os.path.join(seg_output_dir, f"{base}_mask_with_shadow.png")
        overlay_path = os.path.join(seg_output_dir, f"{base}_overlay.png")
        _safe_imwrite(mask_sam_path, mask_sam)
        _safe_imwrite(mask_cut_path, mask_cut)
        _safe_imwrite(shadow_path, shadow_mask)
        cut_merged = cv2.bitwise_or(mask_cut, shadow_mask)
        cut_merged = cv2.dilate(cut_merged, kernel, iterations=dilate_iterations)
        _safe_imwrite(cut_merged_path, cut_merged)
        _safe_imwrite(merged_path, merged)
        _safe_imwrite(overlay_path, overlay)
        segment_id = None
        if isinstance(props, dict):
            segment_id = props.get("segment_id")
        manifest["segments"].append({
            "segment_id": segment_id,
            "json_path": json_path,
            "image_path": image_path,
            "mask_sam_path": mask_sam_path,
            "mask_cut_path": cut_merged_path,
            "shadow_mask_path": shadow_path,
            "merged_mask_path": merged_path,
            "overlay_path": overlay_path,
        })
    manifest_path = os.path.join(output_dir, "mask_manifest.json")
    try:
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
        manifest["manifest_path"] = manifest_path
    except Exception:
        pass
    return manifest


def generate_bridge_masks_from_json(json_path: str, output_dir: str, enable_shadow: bool = False, dilate_iterations: int = 2) -> Dict[str, Any]:
    _ensure_dir(output_dir)
    manifest: Dict[str, Any] = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "segments_dir": os.path.dirname(json_path),
        "output_dir": output_dir,
        "segment_count": 1,
        "segments": [],
    }
    data = _read_segment_json(json_path)
    if not data:
        manifest["error"] = "segment_json_missing"
        return manifest
    image_path = _find_image_for_json(json_path)
    if not image_path:
        manifest["segments"].append({"json_path": json_path, "error": "image_missing"})
        return manifest
    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        manifest["segments"].append({"json_path": json_path, "image_path": image_path, "error": "image_read_failed"})
        return manifest
    height, width = img.shape[:2]
    geo = data.get("geometry") if isinstance(data, dict) else None
    if not isinstance(geo, dict):
        manifest["segments"].append({"json_path": json_path, "image_path": image_path, "error": "geometry_missing"})
        return manifest
    bounds = geo.get("bounds_geo") or geo.get("bounds") or geo.get("bbox")
    if not bounds or len(bounds) < 4:
        manifest["segments"].append({"json_path": json_path, "image_path": image_path, "error": "bounds_missing"})
        return manifest
    bounds_tuple = (float(bounds[0]), float(bounds[1]), float(bounds[2]), float(bounds[3]))
    props = data.get("properties") if isinstance(data, dict) else {}
    resolution = _compute_resolution(bounds_tuple, width, height, float(props.get("resolution", 0) or 0))
    bridge_polygon = geo.get("bridge_polygon") or geo.get("polygon")
    segment_polygon = geo.get("polygon") if isinstance(geo.get("polygon"), dict) else None
    if not isinstance(bridge_polygon, dict):
        manifest["segments"].append({"json_path": json_path, "image_path": image_path, "error": "bridge_polygon_missing"})
        return manifest
    mask_sam = _polygon_to_mask(bridge_polygon, bounds_tuple, resolution, width, height)
    if segment_polygon:
        segment_mask = _polygon_to_mask(segment_polygon, bounds_tuple, resolution, width, height)
        mask_cut = cv2.bitwise_and(mask_sam, segment_mask)
    else:
        mask_cut = mask_sam
    if enable_shadow:
        shadow_mask = _shadow_mask(img, mask_cut)
        merged = cv2.bitwise_or(mask_cut, shadow_mask)
    else:
        shadow_mask = np.zeros_like(mask_cut)
        merged = mask_cut
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    merged = cv2.dilate(merged, kernel, iterations=dilate_iterations)
    overlay = _overlay_mask(img, merged)
    base = os.path.splitext(os.path.basename(json_path))[0]
    seg_output_dir = os.path.join(output_dir, base)
    _ensure_dir(seg_output_dir)
    mask_sam_path = os.path.join(seg_output_dir, f"{base}_mask_sam.png")
    mask_cut_path = os.path.join(seg_output_dir, f"{base}_mask_cut.png")
    shadow_path = os.path.join(seg_output_dir, f"{base}_shadow_mask.png")
    cut_merged_path = os.path.join(seg_output_dir, f"{base}_mask_cut_with_shadow.png")
    merged_path = os.path.join(seg_output_dir, f"{base}_mask_with_shadow.png")
    overlay_path = os.path.join(seg_output_dir, f"{base}_overlay.png")
    _safe_imwrite(mask_sam_path, mask_sam)
    _safe_imwrite(mask_cut_path, mask_cut)
    _safe_imwrite(shadow_path, shadow_mask)
    cut_merged = cv2.bitwise_or(mask_cut, shadow_mask)
    cut_merged = cv2.dilate(cut_merged, kernel, iterations=dilate_iterations)
    _safe_imwrite(cut_merged_path, cut_merged)
    _safe_imwrite(merged_path, merged)
    _safe_imwrite(overlay_path, overlay)
    segment_id = None
    if isinstance(props, dict):
        segment_id = props.get("segment_id")
    manifest["segments"].append({
        "segment_id": segment_id,
        "json_path": json_path,
        "image_path": image_path,
        "mask_sam_path": mask_sam_path,
        "mask_cut_path": cut_merged_path,
        "shadow_mask_path": shadow_path,
        "merged_mask_path": merged_path,
        "overlay_path": overlay_path,
    })
    manifest_path = os.path.join(output_dir, "mask_manifest.json")
    try:
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
        manifest["manifest_path"] = manifest_path
    except Exception:
        pass
    return manifest


def _normalize_batch_payload(payload: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
    if not isinstance(payload, dict):
        return None
    items = payload.get("batch")
    if isinstance(items, list):
        return [item for item in items if isinstance(item, dict)]
    paths = payload.get("segment_json_paths")
    if isinstance(paths, list):
        normalized = []
        for p in paths:
            if not p:
                continue
            normalized.append({"segment_json_path": p})
        return normalized
    return None


def run_mask_generation(task_id: str, input_params_text: str, sam2_dilate_iterations: int = 2, light_expand_pixels: int = 0) -> Dict[str, Any]:
    payload_text = input_params_text if isinstance(input_params_text, str) else json.dumps(input_params_text, ensure_ascii=False)
    payload = json.loads(payload_text) if payload_text and payload_text.strip() else {}
    pipeline = ExtractMasksPipeline(dilate_iterations=sam2_dilate_iterations, light_expand_pixels=light_expand_pixels)
    batch_items = _normalize_batch_payload(payload)
    if batch_items:
        results = []
        for item in batch_items:
            item_task_id = item.get("task_id") or task_id
            item_payload = dict(item)
            item_payload.setdefault("task_id", item_task_id)
            item_text = json.dumps(item_payload, ensure_ascii=False)
            results.append(pipeline.run(item_text))
        return {"batch_count": len(results), "items": results}
    pipeline.run(payload_text)
    segment_json_path = payload.get("segment_json_path")
    artifacts: Dict[str, Any] = {"segment_count": 1}
    if segment_json_path:
        artifacts["segment_json_path"] = segment_json_path
    return artifacts
