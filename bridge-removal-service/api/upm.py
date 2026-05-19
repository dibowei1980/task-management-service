import logging
import os
from datetime import datetime

import requests
from flask import Blueprint, request

from api.auth import require_local_auth
from api.utils import api_ok, api_error

logger = logging.getLogger(__name__)

upm_bp = Blueprint("upm", __name__, url_prefix="/api/v1/upm")

UPM_BASE_URL = os.getenv("UPM_BASE_URL", "http://127.0.0.1:8081")
UPM_API_TOKEN = os.getenv("UPM_API_TOKEN", "")
UPM_INTERNAL_API_KEY = os.getenv("UPM_INTERNAL_API_KEY", "")
UPM_SERVICE_USERNAME = os.getenv("UPM_SERVICE_USERNAME", "")
UPM_SERVICE_PASSWORD = os.getenv("UPM_SERVICE_PASSWORD", "")

_upm_available = False
_upm_service_token = None
_upm_service_token_expires = 0


def _get_upm_service_token():
    global _upm_service_token, _upm_service_token_expires, _upm_available
    if UPM_API_TOKEN:
        return UPM_API_TOKEN
    if _upm_service_token and datetime.utcnow().timestamp() * 1000 < _upm_service_token_expires:
        return _upm_service_token
    if not UPM_SERVICE_USERNAME or not UPM_SERVICE_PASSWORD:
        _upm_available = False
        return None
    try:
        headers = {"Content-Type": "application/json"}
        if UPM_INTERNAL_API_KEY:
            headers["X-Internal-Api-Key"] = UPM_INTERNAL_API_KEY
        resp = requests.post(
            f"{UPM_BASE_URL}/auth/login",
            json={"username": UPM_SERVICE_USERNAME, "password": UPM_SERVICE_PASSWORD},
            headers=headers,
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            _upm_service_token = data.get("token")
            _upm_service_token_expires = datetime.utcnow().timestamp() * 1000 + 3600_000
            _upm_available = True
            return _upm_service_token
        _upm_available = False
        return None
    except Exception:
        _upm_available = False
        return None


def _check_upm_available():
    global _upm_available
    token = _get_upm_service_token()
    if not token:
        return False
    try:
        resp = requests.get(
            f"{UPM_BASE_URL}/api/users?size=1",
            headers={"Authorization": f"Bearer {token}"},
            timeout=5,
        )
        _upm_available = resp.status_code == 200
    except Exception:
        _upm_available = False
    return _upm_available


@upm_bp.route("/users", methods=["GET"])
@require_local_auth
def upm_proxy_users():
    role_name = request.args.get("roleName", "")
    token = _get_upm_service_token()
    if not token:
        return api_error("upm_unavailable", "UPM service is not available", 503)
    try:
        if role_name:
            resp = requests.get(
                f"{UPM_BASE_URL}/api/users/search",
                params={"roleName": role_name, "isActive": "true"},
                headers={"Authorization": f"Bearer {token}"},
                timeout=10,
            )
        else:
            resp = requests.get(
                f"{UPM_BASE_URL}/api/users",
                params={"size": "100"},
                headers={"Authorization": f"Bearer {token}"},
                timeout=10,
            )
        if resp.status_code == 200:
            return api_ok(resp.json())
        if resp.status_code == 403:
            global _upm_service_token
            _upm_service_token = None
        return api_error("upm_error", f"UPM returned {resp.status_code}", 502)
    except requests.RequestException as e:
        logger.warning("UPM proxy users failed: %s", e)
        return api_error("upm_unavailable", "UPM service is not available", 503)


@upm_bp.route("/departments", methods=["GET"])
@require_local_auth
def upm_proxy_departments():
    token = _get_upm_service_token()
    if not token:
        return api_error("upm_unavailable", "UPM service is not available", 503)
    try:
        resp = requests.get(
            f"{UPM_BASE_URL}/api/departments",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        if resp.status_code == 200:
            return api_ok(resp.json())
        if resp.status_code == 403:
            global _upm_service_token
            _upm_service_token = None
        return api_error("upm_error", f"UPM returned {resp.status_code}", 502)
    except requests.RequestException as e:
        logger.warning("UPM proxy departments failed: %s", e)
        return api_error("upm_unavailable", "UPM service is not available", 503)
