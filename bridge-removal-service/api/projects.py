import json
import os
import threading
import traceback
import uuid
from datetime import datetime

import requests
from flask import Blueprint, jsonify, request

from api.auth import require_local_auth, require_auth, require_permission
from services.project_service import (
    get_project, get_all_projects, set_project,
    project_to_task_response, update_project_fields, delete_project as delete_project_svc,
)
from services.job_service import create_job_record, update_job_status, find_jobs_by_project
from services.callback_service import callback_task_status

projects_bp = Blueprint("projects", __name__, url_prefix="/api/projects")

from bridge_removal_task import (
    BridgeRemovalOrchestratorTask,
    BridgeRemovalUnitProcessorTask,
)

TMS_URL = os.getenv("TASK_MANAGEMENT_API_URL", "http://localhost:8082/api")
TMS_TOKEN = os.getenv("TASK_MANAGEMENT_AUTH_TOKEN", "internal-automation-token")


@projects_bp.route("/<project_id>/execute", methods=["POST"])
@require_auth
def receive_project(project_id: str):
    body = request.get_json(force=True, silent=True) or {}
    task_type = body.get("task_type", "BRIDGE_REMOVAL_BATCH")
    task_name = body.get("task_name", "")
    input_params = body.get("input_params", {})
    callback_url = body.get("callback_url", "")

    existing = get_project(project_id)
    if existing:
        return jsonify({"project_id": project_id, "status": "already_exists", "message": "Project already received"})

    project = {
        "project_id": project_id,
        "task_type": task_type,
        "task_name": task_name,
        "name": task_name,
        "category": "PROJECT",
        "priority": 1,
        "status": "RECEIVED",
        "input_params": input_params,
        "callback_url": callback_url,
        "received_at": datetime.utcnow().isoformat(),
        "created_at": datetime.utcnow().isoformat(),
        "job_id": None,
        "source": "tms",
        "tms_synced": True,
        "department_id": None,
        "department_name": None,
        "project_leader_id": None,
        "assignee_id": None,
        "created_by_name": None,
        "created_department_id": None,
        "created_department_name": None,
        "external_system": None,
        "external_task_id": None,
        "external_url": None,
        "operator_ids": [],
        "inspector_ids": [],
        "progress": 0,
        "output_results": None,
        "parent_task_id": None,
    }
    set_project(project_id, project)

    def _run_async():
        job_id = create_job_record(project_id, task_type, input_params)
        update_project_fields(project_id, {"job_id": job_id, "status": "IN_PROGRESS"})
        update_job_status(job_id, "IN_PROGRESS")
        callback_task_status(project_id, "IN_PROGRESS")

        try:
            if task_type == "BRIDGE_REMOVAL_BATCH":
                task = BridgeRemovalOrchestratorTask(task_id=project_id, input_params=input_params)
            else:
                task = BridgeRemovalUnitProcessorTask(task_id=project_id, input_params=input_params)

            task.run()
            task_status = task.get_status()
            task_results = task.get_results()

            if task_status == "COMPLETED":
                update_project_fields(project_id, {"status": "COMPLETED"})
                update_job_status(job_id, "COMPLETED", results=task_results)
                callback_task_status(project_id, "COMPLETED", results=task_results)
            else:
                update_project_fields(project_id, {"status": "FAILED"})
                update_job_status(job_id, "FAILED", error=str(task_results.get("error", "Unknown error")))
                callback_task_status(project_id, "FAILED", results=task_results)
        except Exception as e:
            error_msg = str(e)
            update_project_fields(project_id, {"status": "FAILED"})
            update_job_status(job_id, "FAILED", error=error_msg)
            callback_task_status(project_id, "FAILED")

    threading.Thread(target=_run_async, daemon=True).start()

    return jsonify({
        "project_id": project_id,
        "status": "RECEIVED",
        "message": "Project received, processing started"
    })


@projects_bp.route("", methods=["GET"])
@require_local_auth
def list_projects():
    projects = list(get_all_projects().values())
    return jsonify([project_to_task_response(p) for p in projects])


@projects_bp.route("/<project_id>", methods=["GET"])
@require_local_auth
def get_project_route(project_id: str):
    project = get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404
    return jsonify(project_to_task_response(project))


@projects_bp.route("/<project_id>", methods=["PUT"])
@require_local_auth
def update_project(project_id: str):
    project = get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404
    body = request.get_json(force=True, silent=True) or {}
    updatable_fields = [
        "name", "task_name", "status", "priority", "assignee_id",
        "project_leader_id", "department_id", "department_name",
        "operator_ids", "inspector_ids", "progress", "output_results",
        "created_by_name", "created_department_id", "created_department_name",
        "external_system", "external_task_id", "external_url",
    ]
    updates = {}
    for field in updatable_fields:
        camel = ''.join(word.capitalize() for word in field.split('_'))
        camel = camel[0].lower() + camel[1:]
        val = body.get(field) if field in body else body.get(camel)
        if val is not None:
            updates[field] = val
    if "name" in body and "task_name" not in body:
        updates["task_name"] = body["name"]
    if "task_name" in body and "name" not in body:
        updates["name"] = body["task_name"]
    if "input_params" in body:
        ip = body["input_params"]
        if isinstance(ip, str):
            try:
                ip = json.loads(ip)
            except (json.JSONDecodeError, TypeError):
                ip = {}
        updates["input_params"] = ip
    updated = update_project_fields(project_id, updates)
    return jsonify(project_to_task_response(updated))


@projects_bp.route("/<project_id>/jobs", methods=["GET"])
@require_local_auth
def list_project_jobs(project_id: str):
    project = get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404
    jobs = find_jobs_by_project(project_id)
    return jsonify(jobs)


@projects_bp.route("/<project_id>", methods=["DELETE"])
@require_local_auth
def delete_project(project_id: str):
    existing = get_project(project_id)
    if not existing:
        return jsonify({"error": "Project not found"}), 404
    delete_project_svc(project_id)
    return jsonify({"message": "Project deleted"}), 200


@projects_bp.route("/<project_id>/submit-to-tms", methods=["POST"])
@require_local_auth
def submit_project_to_tms(project_id: str):
    from services.callback_service import _task_management_available
    project = get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404
    if project.get("source") != "local":
        return jsonify({"error": "Only local projects can be submitted to TMS"}), 400
    if project.get("tms_synced"):
        return jsonify({"error": "Project already synced to TMS"}), 409
    if not _task_management_available:
        return jsonify({"error": "Task management service is not available"}), 503

    input_params = project.get("input_params", {})
    if isinstance(input_params, dict):
        input_params_str = json.dumps(input_params, ensure_ascii=False)
    else:
        input_params_str = input_params

    payload = {
        "name": project.get("name") or project.get("task_name", ""),
        "type": project.get("task_type", "BRIDGE_REMOVAL_BATCH"),
        "category": project.get("category", "PROJECT"),
        "status": project.get("status", "PENDING"),
        "priority": project.get("priority", 1),
        "inputParams": input_params_str,
        "externalSystem": "bridge-removal-app",
        "externalTaskId": project_id,
        "departmentId": project.get("department_id"),
        "createdByName": project.get("created_by_name"),
        "createdDepartmentId": project.get("created_department_id"),
        "createdDepartmentName": project.get("created_department_name"),
        "projectLeaderId": project.get("project_leader_id"),
    }
    if project.get("operator_ids"):
        payload["operatorIds"] = project.get("operator_ids")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {TMS_TOKEN}",
    }

    try:
        resp = requests.post(
            f"{TMS_URL}/tasks",
            json=payload,
            headers=headers,
            timeout=30,
        )
        if resp.status_code in (200, 201):
            callback_url = f"{TMS_URL}/tasks/{project_id}/workflow-status"
            update_project_fields(project_id, {
                "tms_synced": True,
                "source": "tms",
                "callback_url": callback_url,
            })
            updated = get_project(project_id)
            return jsonify(project_to_task_response(updated))
        return jsonify({"error": f"TMS returned {resp.status_code}", "detail": resp.text}), resp.status_code
    except requests.RequestException as e:
        return jsonify({"error": f"Failed to submit to TMS: {str(e)}"}), 502


@projects_bp.route("", methods=["POST"])
@require_local_auth
def create_project():
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

    existing = get_project(project_id)
    if existing:
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

    return jsonify(project_to_task_response(project)), 201
