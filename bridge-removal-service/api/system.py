import logging
import os

import requests
from flask import Blueprint, request

from api.auth import require_auth, require_permission
from api.utils import api_ok, api_error
from api.schemas import validate_body, get_validated_body, SimulateBody

logger = logging.getLogger(__name__)

system_bp = Blueprint("system", __name__, url_prefix="/api/v1/system")

SSO_BASE_URL = os.getenv("SSO_BASE_URL", "http://127.0.0.1:8080")


def _check_sso_available():
    try:
        resp = requests.get(f"{SSO_BASE_URL}/actuator/health", timeout=3)
        return resp.status_code in (200, 503)
    except Exception:
        return False


health_bp = Blueprint("health", __name__)


@health_bp.route("/health", methods=["GET"])
def health_check():
    from services.callback_service import is_tms_available, is_tms_registered, is_local_mode
    sso_ok = False
    try:
        resp = requests.get(f"{SSO_BASE_URL}/actuator/health", timeout=3)
        sso_ok = resp.status_code in (200, 503)
    except Exception:
        pass
    return api_ok({
        "status": "ok",
        "service": "bridge-removal-service",
        "task_management_connected": is_tms_available(),
        "tms_registered": is_tms_registered(),
        "local_mode": is_local_mode(),
        "sso_connected": sso_ok,
    })


@system_bp.route("/status", methods=["GET"])
def system_status():
    from services.callback_service import is_tms_available, is_tms_registered, is_local_mode
    from api.upm import _check_upm_available
    return api_ok({
        "task_management_connected": is_tms_available(),
        "tms_registered": is_tms_registered(),
        "local_mode": is_local_mode(),
        "sso_connected": _check_sso_available(),
        "upm_connected": _check_upm_available(),
    })


_ALLOWED_ROOTS_ENV = os.getenv("BRS_ALLOWED_ROOTS", "")
_ALLOWED_ROOTS: list = []
if _ALLOWED_ROOTS_ENV:
    _ALLOWED_ROOTS = [os.path.realpath(p) for p in _ALLOWED_ROOTS_ENV.split(";") if p.strip()]


def _is_browse_path_allowed(requested_path: str) -> bool:
    if not requested_path:
        return False
    real = os.path.realpath(requested_path)
    for allowed in _ALLOWED_ROOTS:
        if real == allowed or real.startswith(allowed + os.sep):
            return True
    return False


@system_bp.route("/browse", methods=["GET"])
@require_auth
def browse_files():
    dir_path = request.args.get("path", "")
    file_filter = request.args.get("filter", "")
    if not dir_path:
        roots = []
        for r in _ALLOWED_ROOTS:
            if os.path.isdir(r):
                roots.append({"name": os.path.basename(r) or r, "path": r, "type": "directory"})
        return api_ok({"currentPath": "", "parentPath": None, "items": roots})
    dir_path = os.path.normpath(dir_path)
    if not _is_browse_path_allowed(dir_path):
        return api_error("access_denied", "Path outside allowed directories", 403)
    if not os.path.isdir(dir_path):
        return api_error("not_found", "Directory not found", 404)
    parent = os.path.dirname(dir_path)
    parent_allowed = _is_browse_path_allowed(parent) if parent and parent != dir_path else False
    items = []
    try:
        for entry in sorted(os.listdir(dir_path)):
            full = os.path.join(dir_path, entry)
            try:
                is_dir = os.path.isdir(full)
            except OSError:
                continue
            if file_filter == "directories" and not is_dir:
                continue
            if file_filter == "shp" and not is_dir and not entry.lower().endswith(".shp"):
                continue
            items.append({
                "name": entry,
                "path": os.path.normpath(full),
                "type": "directory" if is_dir else "file",
            })
    except PermissionError:
        return api_error("access_denied", "Permission denied", 403)
    return api_ok({
        "currentPath": dir_path,
        "parentPath": parent if parent_allowed else None,
        "items": items,
    })


@system_bp.route("/simulate", methods=["POST"])
@require_auth
@require_permission("task:execute")
@validate_body(SimulateBody)
def simulate_offline():
    body = get_validated_body()
    try:
        from services.simulation import simulate_end_to_end_flow_local
        summary = simulate_end_to_end_flow_local(body)
        return api_ok(summary)
    except Exception as e:
        logger.exception("Simulate failed: %s", e)
        return api_error("simulation_failed", "Simulation failed", 500)
