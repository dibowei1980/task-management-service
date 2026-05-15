import logging
import os

import requests
from flask import Blueprint, request

from api.auth import require_auth, require_permission
from api.utils import api_ok, api_error
from api.schemas import validate_body, get_validated_body, SimulateBody

logger = logging.getLogger(__name__)

system_bp = Blueprint("system", __name__, url_prefix="/api/v1/system")

SSO_BASE_URL = os.getenv("SSO_BASE_URL", "http://localhost:8080")


def _check_sso_available():
    try:
        resp = requests.get(f"{SSO_BASE_URL}/actuator/health", timeout=3)
        return resp.status_code == 200
    except Exception:
        return False


health_bp = Blueprint("health", __name__)


@health_bp.route("/health", methods=["GET"])
def health_check():
    from services.callback_service import _task_management_available
    sso_ok = False
    try:
        resp = requests.get(f"{SSO_BASE_URL}/actuator/health", timeout=3)
        sso_ok = resp.status_code == 200
    except Exception:
        pass
    return api_ok({
        "status": "ok",
        "service": "bridge-removal-service",
        "task_management_connected": _task_management_available,
        "sso_connected": sso_ok,
    })


@system_bp.route("/status", methods=["GET"])
def system_status():
    from services.callback_service import _task_management_available
    from api.upm import _check_upm_available
    return api_ok({
        "task_management_connected": _task_management_available,
        "sso_connected": _check_sso_available(),
        "upm_connected": _check_upm_available(),
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
