import json
import os
import traceback
import uuid
from datetime import datetime

import requests
from flask import Blueprint, jsonify, request

from api.auth import require_local_auth, require_auth, require_permission
from services.project_service import (
    get_all_projects, set_project, project_to_task_response,
)
from services.job_service import create_job_record, update_job_status, get_job, find_latest_job_by_task
from services.callback_service import callback_task_status, check_task_management

from bridge_removal_task import (
    BridgeRemovalOrchestratorTask,
    BridgeRemovalUnitProcessorTask,
)

misc_bp = Blueprint("misc", __name__)

SSO_BASE_URL = os.getenv("SSO_BASE_URL", "http://localhost:8080")
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


def _check_sso_available():
    try:
        resp = requests.get(f"{SSO_BASE_URL}/actuator/health", timeout=3)
        return resp.status_code == 200
    except Exception:
        return False


@misc_bp.route("/health", methods=["GET"])
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


@misc_bp.route("/api/system/status", methods=["GET"])
def system_status():
    from services.callback_service import _task_management_available
    return jsonify({
        "task_management_connected": _task_management_available,
        "sso_connected": _check_sso_available(),
        "upm_connected": _check_upm_available(),
    })


@misc_bp.route("/api/upm/users", methods=["GET"])
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


@misc_bp.route("/api/upm/departments", methods=["GET"])
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


@misc_bp.route("/api/projects", methods=["POST"])
@require_local_auth
def create_project():
    from db.repository import ProjectRepository
    body = request.get_json(force=True, silent=True) or {}
    project_id = body.get("project_id") or str(uuid.uuid4())
    task_type = body.get("task_type") or body.get("type", "BRIDGE_REMOVAL_BATCH")
    task_name = body.get("task_name") or body.get("name", "")
    input_params = body.get("input_params", {})
    if isinstance(input_params, str):
        try:
            input_params = json.loads(input_params)
        except (json.JSONDecodeError, TypeError):
            input_params = {}

    _projects = get_all_projects()
    if project_id in _projects:
        return jsonify({"error": "Project already exists"}), 409

    current_user = getattr(request, 'current_user', {})
    source = "local" if current_user.get("login_type") == "local" else "sso"

    project = {
        "project_id": project_id,
        "task_type": task_type,
        "task_name": task_name,
        "name": task_name,
        "category": body.get("category", "PROJECT"),
        "priority": body.get("priority", 1),
        "status": body.get("status", "PENDING"),
        "input_params": input_params,
        "callback_url": "",
        "received_at": datetime.utcnow().isoformat(),
        "created_at": datetime.utcnow().isoformat(),
        "job_id": None,
        "source": source,
        "tms_synced": False,
        "department_id": body.get("department_id") or body.get("departmentId"),
        "department_name": body.get("department_name") or body.get("departmentName"),
        "project_leader_id": body.get("project_leader_id") or body.get("projectLeaderId"),
        "assignee_id": body.get("project_leader_id") or body.get("projectLeaderId"),
        "created_by_name": body.get("created_by_name") or current_user.get("username"),
        "created_department_id": body.get("created_department_id") or body.get("createdDepartmentId") or current_user.get("department_id"),
        "created_department_name": body.get("created_department_name") or body.get("createdDepartmentName") or current_user.get("department_name"),
        "external_system": body.get("external_system") or body.get("externalSystem"),
        "external_task_id": body.get("external_task_id") or body.get("externalTaskId"),
        "external_url": body.get("external_url") or body.get("externalUrl"),
        "operator_ids": body.get("operator_ids") or body.get("operatorIds") or [],
        "inspector_ids": body.get("inspector_ids") or body.get("inspectorIds") or [],
        "progress": 0,
        "output_results": None,
        "parent_task_id": None,
    }
    set_project(project_id, project)

    ProjectRepository.save({
        "id": project_id,
        "name": task_name,
        "type": task_type,
        "status": body.get("status", "PENDING"),
        "source": source,
        "tms_synced": False,
        "input_params": json.dumps(input_params, ensure_ascii=False) if isinstance(input_params, dict) else input_params,
        "category": body.get("category", "PROJECT"),
        "priority": body.get("priority", 1),
        "department_id": body.get("department_id") or body.get("departmentId"),
        "department_name": body.get("department_name") or body.get("departmentName"),
        "project_leader_id": body.get("project_leader_id") or body.get("projectLeaderId"),
        "assignee_id": body.get("project_leader_id") or body.get("projectLeaderId"),
        "created_by_name": body.get("created_by_name") or current_user.get("username"),
        "created_department_id": body.get("created_department_id") or body.get("createdDepartmentId") or current_user.get("department_id"),
        "created_department_name": body.get("created_department_name") or body.get("createdDepartmentName") or current_user.get("department_name"),
        "external_system": body.get("external_system") or body.get("externalSystem"),
        "external_task_id": body.get("external_task_id") or body.get("externalTaskId"),
        "external_url": body.get("external_url") or body.get("externalUrl"),
        "operator_ids": json.dumps(body.get("operator_ids") or body.get("operatorIds") or []),
        "inspector_ids": json.dumps(body.get("inspector_ids") or body.get("inspectorIds") or []),
    })

    return jsonify(project_to_task_response(project)), 201


@misc_bp.route("/tasks/<task_id>/execute", methods=["POST"])
@require_auth
@require_permission("task:execute")
def execute_task(task_id: str):
    body = request.get_json(force=True, silent=True) or {}
    task_type = body.get("task_type", "")
    input_params = body.get("input_params", {})

    if task_type not in ("BRIDGE_REMOVAL_BATCH", "BRIDGE_REMOVAL_UNIT"):
        return jsonify({"error": f"不支持的任务类型: {task_type}"}), 400

    job_id = create_job_record(task_id, task_type, input_params)

    try:
        update_job_status(job_id, "IN_PROGRESS")

        if task_type == "BRIDGE_REMOVAL_BATCH":
            task = BridgeRemovalOrchestratorTask(task_id=task_id, input_params=input_params)
        else:
            task = BridgeRemovalUnitProcessorTask(task_id=task_id, input_params=input_params)

        task.run()

        results = {
            "task_id": task_id,
            "status": task.get_status(),
            "results": task.get_results(),
        }
        update_job_status(job_id, task.get_status(), results=results)
        return jsonify({"job_id": job_id, "status": task.get_status(), "results": task.get_results()})
    except Exception as e:
        error_msg = str(e)
        traceback_str = traceback.format_exc()
        update_job_status(job_id, "FAILED", error=f"{error_msg}\n{traceback_str}")
        return jsonify({"job_id": job_id, "status": "FAILED", "error": error_msg}), 500


@misc_bp.route("/tasks/<task_id>/preprocess-generate", methods=["POST"])
@require_auth
@require_permission("task:execute")
def preprocess_generate(task_id: str):
    body = request.get_json(force=True, silent=True) or {}
    input_params = body.get("input_params", {})
    overwrite = body.get("overwrite", False)
    max_side_px = body.get("max_side_px", 1024)

    job_id = create_job_record(task_id, "PREPROCESS_GENERATE", input_params)

    try:
        update_job_status(job_id, "IN_PROGRESS")

        task = BridgeRemovalUnitProcessorTask(task_id=task_id, input_params=input_params)
        api_url = os.getenv("TASK_MANAGEMENT_API_URL", "")
        auth_token = os.getenv("AUTH_TOKEN", "")
        headers = {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"} if auth_token else {}

        result = task.preprocess_segmentation(
            api_url=api_url,
            headers=headers,
            intermediate_root=input_params.get("intermediate_root"),
            overwrite=overwrite,
            param_overrides={"preprocess_max_side_px": max_side_px},
        )

        results = {"task_id": task_id, "preprocess_completed": result}
        update_job_status(job_id, "COMPLETED", results=results)
        return jsonify({"job_id": job_id, "status": "COMPLETED", "results": results})
    except Exception as e:
        error_msg = str(e)
        traceback_str = traceback.format_exc()
        update_job_status(job_id, "FAILED", error=f"{error_msg}\n{traceback_str}")
        return jsonify({"job_id": job_id, "status": "FAILED", "error": error_msg}), 500


@misc_bp.route("/jobs/<job_id>", methods=["GET"])
@require_local_auth
def get_job_status(job_id: str):
    job = get_job(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job)


@misc_bp.route("/simulate", methods=["POST"])
@require_auth
@require_permission("task:execute")
def simulate_offline():
    body = request.get_json(force=True, silent=True) or {}
    try:
        from bridge_removal_task import simulate_end_to_end_flow_local
        summary = simulate_end_to_end_flow_local(body)
        return jsonify(summary)
    except Exception as e:
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500
