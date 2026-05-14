import os
from datetime import datetime

import requests
from flask import Blueprint, jsonify, request

from api.auth import require_local_auth

upm_bp = Blueprint("upm", __name__)

UPM_BASE_URL = os.getenv("UPM_BASE_URL", "http://localhost:8081")
UPM_API_TOKEN = os.getenv("UPM_API_TOKEN", "")
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
        resp = requests.post(
            f"{UPM_BASE_URL}/auth/login",
            json={"username": UPM_SERVICE_USERNAME, "password": UPM_SERVICE_PASSWORD},
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


@upm_bp.route("/api/upm/users", methods=["GET"])
@require_local_auth
def upm_proxy_users():
    role_name = request.args.get("roleName", "")
    token = _get_upm_service_token()
    if not token:
        return jsonify([])
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
            return jsonify(resp.json())
        if resp.status_code == 403:
            global _upm_service_token
            _upm_service_token = None
        return jsonify([])
    except Exception:
        return jsonify([])


@upm_bp.route("/api/upm/departments", methods=["GET"])
@require_local_auth
def upm_proxy_departments():
    token = _get_upm_service_token()
    if not token:
        return jsonify([])
    try:
        resp = requests.get(
            f"{UPM_BASE_URL}/api/departments",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        if resp.status_code == 200:
            return jsonify(resp.json())
        if resp.status_code == 403:
            global _upm_service_token
            _upm_service_token = None
        return jsonify([])
    except Exception:
        return jsonify([])