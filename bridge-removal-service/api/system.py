import os
import traceback

import requests
from flask import Blueprint, jsonify, request

from api.auth import require_auth, require_permission

system_bp = Blueprint("system", __name__)

SSO_BASE_URL = os.getenv("SSO_BASE_URL", "http://localhost:8080")


def _check_sso_available():
    try:
        resp = requests.get(f"{SSO_BASE_URL}/actuator/health", timeout=3)
        return resp.status_code == 200
    except Exception:
        return False


@system_bp.route("/health", methods=["GET"])
def health_check():
    from services.callback_service import _task_management_available
    sso_ok = False
    try:
        resp = requests.get(f"{SSO_BASE_URL}/actuator/health", timeout=3)
        sso_ok = resp.status_code == 200
    except Exception:
        pass
    return jsonify({
        "status": "ok",
        "service": "bridge-removal-service",
        "task_management_connected": _task_management_available,
        "sso_connected": sso_ok,
    })


@system_bp.route("/api/system/status", methods=["GET"])
def system_status():
    from services.callback_service import _task_management_available
    from api.upm import _check_upm_available
    return jsonify({
        "task_management_connected": _task_management_available,
        "sso_connected": _check_sso_available(),
        "upm_connected": _check_upm_available(),
    })


@system_bp.route("/simulate", methods=["POST"])
@require_auth
@require_permission("task:execute")
def simulate_offline():
    body = request.get_json(force=True, silent=True) or {}
    try:
        from services.simulation import simulate_end_to_end_flow_local
        summary = simulate_end_to_end_flow_local(body)
        return jsonify(summary)
    except Exception as e:
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500