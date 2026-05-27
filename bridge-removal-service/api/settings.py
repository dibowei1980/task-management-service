import json
import os
import logging

from flask import Blueprint, request

from api.utils import api_ok, api_error, to_snake

logger = logging.getLogger(__name__)

settings_bp = Blueprint("user_settings", __name__, url_prefix="/api/v1")

_SETTINGS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
_SETTINGS_FILE = os.path.join(_SETTINGS_DIR, "user_settings.json")

_DEFAULT_SETTINGS = {
    "enable_shadow": False,
    "polygon_dilate_iterations": 2,
    "sam2_dilate_iterations": 2,
    "sam2_light_expand_pixels": 1,
    "inpaint_count": 1,
    "blur_radius": 2,
    "expand_pixels": 3,
    "local_edit_tool": "brush",
    "local_edit_brush_size": 20,
    "local_edit_prompt": "",
    "local_edit_num_candidates": 1,
}

_INT_RANGE_VALIDATORS = {
    "inpaint_count": (1, 8),
    "blur_radius": (0, 20),
    "expand_pixels": (0, 50),
    "polygon_dilate_iterations": (0, 10),
    "sam2_dilate_iterations": (0, 10),
    "sam2_light_expand_pixels": (0, 20),
    "local_edit_brush_size": (4, 80),
    "local_edit_num_candidates": (1, 8),
}

_STR_ENUM_VALIDATORS = {
    "local_edit_tool": ("brush", "erase"),
}


def _load_settings() -> dict:
    if os.path.isfile(_SETTINGS_FILE):
        try:
            with open(_SETTINGS_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
            merged = {**_DEFAULT_SETTINGS, **saved}
            if "mask_dilate_iterations" in saved and "polygon_dilate_iterations" not in saved:
                merged["polygon_dilate_iterations"] = saved["mask_dilate_iterations"]
                merged["sam2_dilate_iterations"] = saved["mask_dilate_iterations"]
            merged.pop("mask_dilate_iterations", None)
            return merged
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("Failed to load user settings: %s, using defaults", e)
    return {**_DEFAULT_SETTINGS}


def _save_settings(settings: dict) -> None:
    os.makedirs(_SETTINGS_DIR, exist_ok=True)
    filtered = {k: v for k, v in settings.items() if k in _DEFAULT_SETTINGS}
    with open(_SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(filtered, f, indent=2, ensure_ascii=False)


@settings_bp.route("/user-settings", methods=["GET"])
def get_user_settings():
    settings = _load_settings()
    return api_ok(settings)


@settings_bp.route("/user-settings", methods=["PUT"])
def update_user_settings():
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return api_error("bad_request", "Request body must be a JSON object", 400)
    body = to_snake(body)

    current = _load_settings()
    for key in _DEFAULT_SETTINGS:
        if key in body:
            val = body[key]
            if key in _INT_RANGE_VALIDATORS:
                lo, hi = _INT_RANGE_VALIDATORS[key]
                try:
                    val = int(val)
                except (TypeError, ValueError):
                    return api_error("bad_request", f"Invalid value for {key}: must be integer", 400)
                if val < lo or val > hi:
                    return api_error("bad_request", f"Invalid value for {key}: must be between {lo} and {hi}", 400)
            elif key == "enable_shadow":
                if not isinstance(val, bool):
                    val = str(val).lower() in ("true", "1", "yes")
            elif key in _STR_ENUM_VALIDATORS:
                allowed = _STR_ENUM_VALIDATORS[key]
                if str(val) not in allowed:
                    return api_error("bad_request", f"Invalid value for {key}: must be one of {allowed}", 400)
                val = str(val)
            elif key == "local_edit_prompt":
                val = str(val)[:2048]
            current[key] = val

    _save_settings(current)
    return api_ok(current)
