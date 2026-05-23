import json
import os
import logging

from flask import Blueprint, request

from api.utils import api_ok, api_error

logger = logging.getLogger(__name__)

settings_bp = Blueprint("user_settings", __name__, url_prefix="/api/v1")

_SETTINGS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
_SETTINGS_FILE = os.path.join(_SETTINGS_DIR, "user_settings.json")

_DEFAULT_SETTINGS = {
    "enable_shadow": False,
    "inpaint_count": 1,
}


def _load_settings() -> dict:
    if os.path.isfile(_SETTINGS_FILE):
        try:
            with open(_SETTINGS_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
            merged = {**_DEFAULT_SETTINGS, **saved}
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

    current = _load_settings()
    for key in _DEFAULT_SETTINGS:
        if key in body:
            val = body[key]
            if key == "inpaint_count":
                try:
                    val = int(val)
                except (TypeError, ValueError):
                    return api_error("bad_request", f"Invalid value for {key}: must be integer", 400)
                if val < 1 or val > 8:
                    return api_error("bad_request", f"Invalid value for {key}: must be between 1 and 8", 400)
            elif key == "enable_shadow":
                if not isinstance(val, bool):
                    val = str(val).lower() in ("true", "1", "yes")
            current[key] = val

    _save_settings(current)
    return api_ok(current)
