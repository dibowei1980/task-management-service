import json
import logging
import os
import secrets

import requests
from flask import Blueprint, request, session, redirect
from functools import wraps

from api.utils import api_ok, api_error
from api.schemas import validate_body, get_validated_body

logger = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__, url_prefix="/api/v1/auth")

_sessions: dict = {}

SSO_BASE_URL = os.getenv("SSO_BASE_URL", "http://127.0.0.1:8080")
SSO_CLIENT_ID = os.getenv("SSO_CLIENT_ID", "bridge-removal-service")
SSO_CLIENT_SECRET = os.getenv("SSO_CLIENT_SECRET", "")
SSO_REDIRECT_URI = os.getenv("SSO_REDIRECT_URI", "http://127.0.0.1:5050/api/v1/auth/sso/callback")
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://127.0.0.1:5174")


def _load_session_from_db(token):
    from db.repository import SessionRepository, model_to_dict
    model = SessionRepository.find_by_id(token)
    if not model:
        return None
    data = model_to_dict(model)
    perms = data.get("permissions", "[]")
    if isinstance(perms, str):
        try:
            perms = json.loads(perms)
        except (json.JSONDecodeError, TypeError):
            perms = []
    return {
        "user_id": data.get("user_id", ""),
        "username": data.get("username", ""),
        "display_name": data.get("display_name", ""),
        "role": data.get("role", "user"),
        "permissions": perms,
        "department_id": data.get("department_id"),
        "department_name": data.get("department_name"),
        "email": data.get("email"),
        "roles": data.get("roles"),
        "sso_session_id": data.get("sso_session_id"),
        "upm_token": data.get("upm_token"),
    }


def require_local_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]

            internal_token = os.getenv("TASK_MANAGEMENT_AUTH_TOKEN")
            if internal_token and internal_token == token:
                request.current_user = {
                    "user_id": "internal-automation",
                    "username": "internal-automation",
                    "permissions": ["task:execute", "task:update_global", "task:update_status_internal"],
                    "department_id": "",
                    "role": "system"
                }
                return f(*args, **kwargs)

            user_info = _sessions.get(token)
            if not user_info:
                user_info = _load_session_from_db(token)
                if user_info:
                    _sessions[token] = user_info
            if user_info:
                request.current_user = user_info
                return f(*args, **kwargs)

        session_token = session.get("session_token")
        if session_token and session_token in _sessions:
            request.current_user = _sessions[session_token]
            return f(*args, **kwargs)

        return api_error("auth_required", "Authentication required", 401)
    return decorated


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]

            internal_token = os.getenv("TASK_MANAGEMENT_AUTH_TOKEN")
            if internal_token and internal_token == token:
                request.sso_user = {
                    "user_id": "internal-automation",
                    "username": "internal-automation",
                    "permissions": ["task:execute", "task:update_global"]
                }
                return f(*args, **kwargs)

            local_user = _sessions.get(token)
            if not local_user:
                local_user = _load_session_from_db(token)
                if local_user:
                    _sessions[token] = local_user
            if local_user:
                request.sso_user = local_user
                return f(*args, **kwargs)

        try:
            validation_url = f"{SSO_BASE_URL}/api/sso/api-token/validate"
            resp = requests.post(validation_url, json={"apiToken": auth_header.replace('Bearer ', '')}, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                if data.get('active'):
                    request.sso_user = data
                    return f(*args, **kwargs)
        except requests.RequestException:
            pass

        return api_error("auth_invalid", "Invalid or missing authentication", 401)
    return decorated


def require_permission(permission: str):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = getattr(request, 'sso_user', None) or getattr(request, 'current_user', None)
            if not user:
                return api_error("auth_required", "Authentication required", 401)
            permissions = user.get('permissions', [])
            if permission not in permissions:
                return api_error("permission_denied", f"Permission denied: {permission}", 403)
            return f(*args, **kwargs)
        return decorated
    return decorator


def _register_sso_client(sso_session_id):
    if not SSO_CLIENT_SECRET:
        return
    try:
        requests.post(
            f"{SSO_BASE_URL}/api/sso/register-client",
            json={
                "session_id": sso_session_id,
                "client_id": SSO_CLIENT_ID,
                "callback_url": SSO_REDIRECT_URI.replace("/callback", "/logout-callback"),
            },
            headers={
                "X-Client-Id": SSO_CLIENT_ID,
                "X-Client-Secret": SSO_CLIENT_SECRET,
            },
            timeout=10,
        )
    except requests.RequestException:
        pass


@auth_bp.route("/upm/login", methods=["POST"])
def upm_login():
    body = request.get_json(silent=True) or {}
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""

    if not username or not password:
        return api_error("invalid_input", "Username and password required", 400)

    upm_base_url = os.getenv("UPM_BASE_URL", "http://127.0.0.1:8081")
    upm_internal_api_key = os.getenv("UPM_INTERNAL_API_KEY", "")
    try:
        headers = {"Content-Type": "application/json"}
        if upm_internal_api_key:
            headers["X-Internal-Api-Key"] = upm_internal_api_key
        resp = requests.post(
            f"{upm_base_url}/auth/login",
            json={"username": username, "password": password},
            headers=headers,
            timeout=10,
        )
        if resp.status_code != 200:
            return api_error("upm_login_failed", "Invalid username or password", 401)

        upm_data = resp.json()
        upm_user_id = upm_data.get("id") or upm_data.get("userId") or ""
        upm_email = upm_data.get("email") or ""
        upm_department_id = upm_data.get("departmentId") or ""
        upm_department_name = upm_data.get("departmentName") or ""
        upm_roles = upm_data.get("roles") or []
        upm_permissions = upm_data.get("permissions") or []
        if not upm_permissions and upm_roles:
            upm_permissions = [r for r in upm_roles if ":" in r and not r.startswith("ROLE_")]

        user_info = {
            "user_id": upm_user_id,
            "username": username,
            "display_name": upm_data.get("displayName") or username,
            "email": upm_email,
            "role": "user",
            "permissions": upm_permissions,
            "department_id": upm_department_id,
            "department_name": upm_department_name,
            "roles": upm_roles,
            "upm_token": upm_data.get("token"),
        }

        if upm_roles:
            for r in upm_roles:
                r_upper = r.upper()
                if "ADMIN" in r_upper:
                    user_info["role"] = "admin"
                    break
                if "MANAGER" in r_upper or "PROJECT_MANAGER" in r_upper:
                    user_info["role"] = "project_manager"
                    break
                if "OPERATOR" in r_upper:
                    user_info["role"] = "operator"
                    break

        local_token = secrets.token_hex(32)
        _sessions[local_token] = user_info

        from db.repository import SessionRepository
        SessionRepository.save({
            "id": local_token,
            "user_id": user_info["user_id"],
            "username": user_info["username"],
            "display_name": user_info["display_name"],
            "role": user_info["role"],
            "permissions": json.dumps(user_info["permissions"]),
            "department_id": user_info["department_id"],
            "department_name": user_info["department_name"],
            "email": user_info["email"],
            "roles": json.dumps(user_info["roles"]),
            "upm_token": user_info.get("upm_token"),
        })

        return api_ok({
            "token": local_token,
            "userId": user_info["user_id"],
            "username": user_info["username"],
            "displayName": user_info["display_name"],
            "email": user_info["email"],
            "role": user_info["role"],
            "permissions": user_info["permissions"],
            "departmentId": user_info["department_id"],
            "departmentName": user_info["department_name"],
            "roles": user_info["roles"],
        })
    except requests.RequestException as e:
        return api_error("upm_unavailable", f"UPM service error: {e}", 502)


@auth_bp.route("/logout", methods=["POST"])
@require_local_auth
def local_logout():
    from db.repository import SessionRepository
    user_info = request.current_user
    sso_session_id = user_info.get("sso_session_id") if isinstance(user_info, dict) else None

    if sso_session_id:
        try:
            requests.post(
                f"{SSO_BASE_URL}/api/sso/logout",
                json={"client_id": SSO_CLIENT_ID},
                headers={"X-Session-Id": sso_session_id},
                timeout=10,
            )
        except requests.RequestException:
            pass

    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
        _sessions.pop(token, None)
        SessionRepository.delete(token)
    session.pop("session_token", None)
    return api_ok({"message": "Logged out"})


@auth_bp.route("/me", methods=["GET"])
@require_local_auth
def local_me():
    return api_ok(request.current_user)


@auth_bp.route("/sso/auth-url", methods=["GET"])
def sso_auth_url():
    redirect_uri = request.args.get("redirect_uri", SSO_REDIRECT_URI)
    try:
        resp = requests.get(
            f"{SSO_BASE_URL}/api/sso/auth-url",
            params={"client_id": SSO_CLIENT_ID, "redirect_uri": redirect_uri},
            timeout=15,
        )
        if resp.status_code == 200:
            data = resp.json()
            session["sso_state"] = data.get("state")
            return api_ok(data)
        return api_error("sso_auth_url_failed", "SSO auth-url request failed", resp.status_code)
    except requests.RequestException as e:
        return api_error("sso_unavailable", f"SSO service error: {e}", 502)


@auth_bp.route("/sso/token", methods=["POST"])
def sso_token():
    body = request.get_json(silent=True) or {}
    code = body.get("code")
    if not code:
        return api_error("invalid_input", "code is required", 400)

    try:
        token_body = {"code": code, "client_id": SSO_CLIENT_ID}
        if SSO_CLIENT_SECRET:
            token_body["client_secret"] = SSO_CLIENT_SECRET
        resp = requests.post(
            f"{SSO_BASE_URL}/api/sso/token",
            json=token_body,
            timeout=15,
        )
        if resp.status_code != 200:
            err_data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            return api_error("sso_token_failed", err_data.get("error", "Failed to exchange code"), resp.status_code)

        data = resp.json()
        sso_session_id = data.get("session_id")
        user_data = data.get("user", {})

        if not sso_session_id or not user_data:
            return api_error("sso_no_session", "No session or user data from SSO", 502)

        user_info = {
            "user_id": user_data.get("userId") or user_data.get("user_id") or "",
            "username": user_data.get("username", ""),
            "display_name": user_data.get("username", ""),
            "email": user_data.get("email", ""),
            "role": "user",
            "permissions": user_data.get("permissions", []),
            "department_id": user_data.get("departmentId", ""),
            "department_name": user_data.get("departmentName", ""),
            "roles": user_data.get("roles", []),
            "sso_session_id": sso_session_id,
        }

        if user_info["roles"]:
            for r in user_info["roles"]:
                r_upper = r.upper()
                if "ADMIN" in r_upper:
                    user_info["role"] = "admin"
                    break
                if "MANAGER" in r_upper or "PROJECT_MANAGER" in r_upper:
                    user_info["role"] = "project_manager"
                    break
                if "OPERATOR" in r_upper:
                    user_info["role"] = "operator"
                    break

        from api.upm import _get_upm_service_token
        user_info["upm_token"] = _get_upm_service_token()

        local_token = secrets.token_hex(32)
        _sessions[local_token] = user_info

        from db.repository import SessionRepository
        SessionRepository.save({
            "id": local_token,
            "user_id": user_info.get("user_id", ""),
            "username": user_info.get("username", ""),
            "display_name": user_info.get("display_name", ""),
            "role": user_info.get("role", "user"),
            "permissions": json.dumps(user_info.get("permissions", [])),
            "department_id": user_info.get("department_id", ""),
            "department_name": user_info.get("department_name", ""),
            "email": user_info.get("email", ""),
            "roles": json.dumps(user_info.get("roles", [])),
            "sso_session_id": sso_session_id,
            "upm_token": user_info.get("upm_token"),
        })

        _register_sso_client(sso_session_id)

        return api_ok({
            "token": local_token,
            "session_id": sso_session_id,
            "userId": user_info["user_id"],
            "username": user_info["username"],
            "displayName": user_info["display_name"],
            "email": user_info["email"],
            "role": user_info["role"],
            "permissions": user_info["permissions"],
            "departmentId": user_info["department_id"],
            "departmentName": user_info["department_name"],
            "roles": user_info["roles"],
            "user": {
                "userId": user_info["user_id"],
                "username": user_info["username"],
                "email": user_info["email"],
                "displayName": user_info["display_name"],
                "roles": user_info["roles"],
                "permissions": user_info["permissions"],
                "departmentId": user_info["department_id"],
                "departmentName": user_info["department_name"],
            },
        })
    except requests.RequestException as e:
        return api_error("sso_service_error", f"SSO service error: {e}", 502)


@auth_bp.route("/sso/callback", methods=["GET"])
def sso_callback():
    code = request.args.get("code")
    state = request.args.get("state")
    error = request.args.get("error")

    params = []
    if code:
        params.append(f"code={code}")
    if state:
        params.append(f"state={state}")
    if error:
        params.append(f"error={error}")

    query = "&".join(params)
    separator = "?" if query else ""
    return redirect(f"{FRONTEND_BASE_URL}/sso/callback{separator}{query}")


@auth_bp.route("/sso/logout", methods=["POST"])
@require_local_auth
def sso_logout():
    from db.repository import SessionRepository
    user_info = request.current_user
    sso_session_id = user_info.get("sso_session_id") if isinstance(user_info, dict) else None

    if sso_session_id:
        try:
            requests.post(
                f"{SSO_BASE_URL}/api/sso/logout",
                json={"client_id": SSO_CLIENT_ID},
                headers={"X-Session-Id": sso_session_id},
                timeout=10,
            )
        except requests.RequestException:
            pass

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        _sessions.pop(token, None)
        SessionRepository.delete(token)
    session.pop("session_token", None)

    return api_ok({"message": "Logged out"})
