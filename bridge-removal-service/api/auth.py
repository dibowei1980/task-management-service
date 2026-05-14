import hashlib
import json
import os
import secrets

import requests
from flask import Blueprint, jsonify, request, session, redirect
from functools import wraps

auth_bp = Blueprint("auth", __name__)

_sessions: dict = {}

LOCAL_USERS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "local_users.json")
SSO_BASE_URL = os.getenv("SSO_BASE_URL", "http://localhost:8080")
SSO_CLIENT_ID = os.getenv("SSO_CLIENT_ID", "bridge-removal-service")
SSO_CLIENT_SECRET = os.getenv("SSO_CLIENT_SECRET", "")
SSO_REDIRECT_URI = os.getenv("SSO_REDIRECT_URI", "http://localhost:5050/api/auth/sso/callback")


def _load_local_users():
    if os.path.exists(LOCAL_USERS_FILE):
        with open(LOCAL_USERS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    default = {
        "admin": {
            "password_hash": hashlib.sha256("admin123".encode()).hexdigest(),
            "display_name": "管理员",
            "role": "admin"
        }
    }
    _save_local_users(default)
    return default


def _save_local_users(users):
    with open(LOCAL_USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=2)


def _check_local_login(username, password):
    users = _load_local_users()
    user = users.get(username)
    if not user:
        return None
    pw_hash = hashlib.sha256(password.encode()).hexdigest()
    if pw_hash != user.get("password_hash"):
        return None
    return {
        "user_id": username,
        "username": username,
        "display_name": user.get("display_name", username),
        "role": user.get("role", "user"),
        "permissions": [
            "task:execute", "task:update_global",
            "project:read", "project:create", "project:update", "project:delete",
            "user:read", "quality:check",
        ]
    }


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
    }


def require_local_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
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

        return jsonify({"error": "Authentication required"}), 401
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

        return jsonify({"error": "Invalid or missing authentication"}), 401
    return decorated


def require_permission(permission: str):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = getattr(request, 'sso_user', None) or getattr(request, 'current_user', None)
            if not user:
                return jsonify({"error": "Authentication required"}), 401
            permissions = user.get('permissions', [])
            if permission not in permissions:
                return jsonify({"error": f"Permission denied: {permission}"}), 403
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


@auth_bp.route("/login", methods=["POST"])
def local_login():
    from db.repository import SessionRepository
    body = request.get_json(force=True, silent=True) or {}
    username = body.get("username", "")
    password = body.get("password", "")

    user_info = _check_local_login(username, password)
    if not user_info:
        return jsonify({"error": "Invalid username or password"}), 401

    session_token = secrets.token_hex(32)
    _sessions[session_token] = user_info
    session["session_token"] = session_token
    SessionRepository.save({
        "id": session_token,
        "user_id": user_info.get("user_id", ""),
        "username": user_info.get("username", ""),
        "display_name": user_info.get("display_name", ""),
        "role": user_info.get("role", "user"),
        "permissions": json.dumps(user_info.get("permissions", [])),
    })

    return jsonify({
        "token": session_token,
        "user": {
            "user_id": user_info["user_id"],
            "username": user_info["username"],
            "display_name": user_info["display_name"],
            "role": user_info["role"]
        }
    })


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
    return jsonify({"message": "Logged out"})


@auth_bp.route("/me", methods=["GET"])
@require_local_auth
def local_me():
    return jsonify(request.current_user)


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
            return jsonify(data)
        return jsonify({"error": "SSO auth-url failed"}), resp.status_code
    except requests.RequestException as e:
        return jsonify({"error": f"SSO service error: {e}"}), 502


@auth_bp.route("/sso/callback", methods=["GET"])
def sso_callback():
    code = request.args.get("code")
    state = request.args.get("state")
    error = request.args.get("error")

    if error:
        frontend_url = f"/?error=sso&error_description={error}"
        return redirect(frontend_url)

    if not code:
        return redirect("/?error=sso_no_code")

    saved_state = session.pop("sso_state", None)
    if state and saved_state and state != saved_state:
        return redirect("/?error=sso_state_mismatch")

    try:
        resp = requests.post(
            f"{SSO_BASE_URL}/api/sso/token",
            json={"code": code, "client_id": SSO_CLIENT_ID},
            timeout=15,
        )
        if resp.status_code != 200:
            return redirect("/?error=sso_token_failed")

        data = resp.json()
        sso_session_id = data.get("session_id")
        user_data = data.get("user", {})

        if not sso_session_id or not user_data:
            return redirect("/?error=sso_no_session")

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
        })

        _register_sso_client(sso_session_id)

        frontend_redirect = request.args.get("redirect_path", "/")
        separator = "&" if "?" in frontend_redirect else "?"
        return redirect(f"{frontend_redirect}{separator}bridge_token={local_token}")

    except requests.RequestException as e:
        return redirect(f"/?error=sso_service_error&detail={e}")


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

    return jsonify({"message": "Logged out"})
