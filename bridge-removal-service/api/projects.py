import json
import logging
import os
import threading
import uuid
from datetime import datetime

import requests
from flask import Blueprint, current_app, request

from api.auth import require_local_auth, require_auth
from api.utils import api_ok, api_created, api_accepted, api_no_content, api_error, api_collection
from api.schemas import validate_body, get_validated_body, ProjectCreateBody, ProjectUpdateBody, ProjectExecuteBody
from services.project_service import (
    get_project, get_all_projects, set_project,
    project_to_task_response, update_project_fields, delete_project as delete_project_svc,
)
from services.job_service import create_job_record, update_job_status, find_jobs_by_project
from services.callback_service import callback_task_status

logger = logging.getLogger(__name__)

projects_bp = Blueprint("projects", __name__, url_prefix="/api/v1/projects")

from bridge_removal_task import (
    BridgeRemovalOrchestratorTask,
    BridgeRemovalUnitProcessorTask,
)

TMS_URL = os.getenv("TASK_MANAGEMENT_API_URL", "http://127.0.0.1:8082/api")
TMS_TOKEN = os.getenv("TASK_MANAGEMENT_AUTH_TOKEN", "internal-automation-token")


@projects_bp.route("/<project_id>/execute", methods=["POST"])
@require_auth
@validate_body(ProjectExecuteBody)
def receive_project(project_id: str):
    body = get_validated_body()
    task_type = body.get("task_type", "BRIDGE_REMOVAL_BATCH")
    task_name = body.get("task_name", "")
    input_params = body.get("input_params", {})
    callback_url = body.get("callback_url", "")

    existing = get_project(project_id)
    if existing:
        return api_error("already_exists", "Project already exists", 409)

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
        "parent_task_id": body.get("parent_task_id"),
    }
    set_project(project_id, project)

    app = current_app._get_current_object()

    def _run_async():
        with app.app_context():
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
                    update_project_fields(project_id, {"status": "COMPLETED", "progress": 100})
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

    return api_accepted({
        "project_id": project_id,
        "status": "RECEIVED",
        "message": "Project received, processing started",
    })


@projects_bp.route("", methods=["GET"])
@require_local_auth
def list_projects():
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page") or request.args.get("size", 20)
    try:
        per_page = int(per_page)
    except (ValueError, TypeError):
        per_page = 20
    per_page = min(per_page, 1000)
    status_filter = request.args.get("status")
    category_filter = request.args.get("category")
    type_filter = request.args.get("type")
    external_system_filter = request.args.get("external_system") or request.args.get("externalSystem")
    sort = request.args.get("sort", "-created_at")

    projects = list(get_all_projects().values())

    if status_filter:
        projects = [p for p in projects if p.get("status") == status_filter]
    if category_filter:
        projects = [p for p in projects if p.get("category") == category_filter]
    if type_filter:
        projects = [p for p in projects if p.get("task_type") == type_filter]
    if external_system_filter:
        projects = [p for p in projects if p.get("external_system") == external_system_filter]

    sort_field = sort.lstrip("-")
    reverse = sort.startswith("-")
    projects.sort(
        key=lambda p: p.get(sort_field, "") or "",
        reverse=reverse,
    )

    total = len(projects)
    start = (page - 1) * per_page
    end = start + per_page
    page_items = projects[start:end]

    return api_collection(
        [project_to_task_response(p) for p in page_items],
        total=total,
        page=page,
        per_page=per_page,
        base_url="/api/v1/projects",
    )


@projects_bp.route("/<project_id>", methods=["GET"])
@require_local_auth
def get_project_route(project_id: str):
    project = get_project(project_id)
    if not project:
        return api_error("not_found", "Project not found", 404)
    return api_ok(project_to_task_response(project))


@projects_bp.route("/<project_id>", methods=["PUT"])
@require_local_auth
@validate_body(ProjectUpdateBody)
def update_project(project_id: str):
    project = get_project(project_id)
    if not project:
        return api_error("not_found", "Project not found", 404)
    body = get_validated_body()
    updatable_fields = [
        "name", "task_name", "status", "priority", "assignee_id",
        "project_leader_id", "department_id", "department_name",
        "operator_ids", "inspector_ids", "progress", "output_results",
        "created_by_name", "created_department_id", "created_department_name",
        "external_system", "external_task_id", "external_url",
    ]
    updates = {}
    for field in updatable_fields:
        val = body.get(field)
        if val is not None:
            updates[field] = val
    if "name" in body and "task_name" not in body:
        updates["task_name"] = body["name"]
    if "task_name" in body and "name" not in body:
        updates["name"] = body["task_name"]
    input_params_val = body.get("input_params")
    if input_params_val is not None:
        ip = input_params_val
        if isinstance(ip, str):
            try:
                ip = json.loads(ip)
            except (json.JSONDecodeError, TypeError):
                ip = {}
        updates["input_params"] = ip
    updated = update_project_fields(project_id, updates)
    return api_ok(project_to_task_response(updated))


def _find_subtasks_recursive(project_id: str) -> list:
    from db.repository import ProjectRepository
    from services.project_service import db_model_to_project_dict

    results = []
    seen = set()

    def _collect(parent_id: str):
        children = ProjectRepository.find_by_parent(parent_id)
        for m in children:
            if m.id in seen:
                continue
            seen.add(m.id)
            p = db_model_to_project_dict(m)
            if p.get("category") == "SUBTASK":
                results.append(project_to_task_response(p))
            elif p.get("category") == "SYSTEM_TASK":
                _collect(m.id)

    _collect(project_id)
    return results


@projects_bp.route("/<project_id>/jobs", methods=["GET"])
@require_local_auth
def list_project_jobs(project_id: str):
    project = get_project(project_id)
    if not project:
        return api_error("not_found", "Project not found", 404)
    subtasks = _find_subtasks_recursive(project_id)
    return api_ok(subtasks)


@projects_bp.route("/<project_id>", methods=["DELETE"])
@require_local_auth
def delete_project(project_id: str):
    existing = get_project(project_id)
    if not existing:
        return api_error("not_found", "Project not found", 404)
    delete_project_svc(project_id)
    return api_no_content()


@projects_bp.route("/<project_id>/submit-to-tms", methods=["POST"])
@require_local_auth
def submit_project_to_tms(project_id: str):
    from services.callback_service import _task_management_available
    project = get_project(project_id)
    if not project:
        return api_error("not_found", "Project not found", 404)
    if project.get("source") != "local":
        return api_error("invalid_source", "Only local projects can be submitted to TMS", 400)
    if project.get("tms_synced"):
        return api_error("already_synced", "Project already synced to TMS", 409)
    if not _task_management_available:
        return api_error("tms_unavailable", "Task management service is not available", 503)

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
            return api_ok(project_to_task_response(updated))
        return api_error("tms_error", f"TMS returned {resp.status_code}", resp.status_code)
    except requests.RequestException as e:
        return api_error("tms_unavailable", f"Failed to submit to TMS: {str(e)}", 502)


@projects_bp.route("", methods=["POST"])
@require_local_auth
@validate_body(ProjectCreateBody)
def create_project():
    body = get_validated_body()
    project_id = body.get("project_id") or str(uuid.uuid4())
    task_type = body.get("task_type", "BRIDGE_REMOVAL_BATCH")
    task_name = body.get("task_name") or body.get("name", "")
    input_params = body.get("input_params", {})
    if isinstance(input_params, str):
        try:
            input_params = json.loads(input_params)
        except (json.JSONDecodeError, TypeError):
            input_params = {}

    existing = get_project(project_id)
    if existing:
        return api_error("already_exists", "Project already exists", 409)

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
        "department_id": body.get("department_id"),
        "department_name": body.get("department_name"),
        "project_leader_id": body.get("project_leader_id"),
        "assignee_id": body.get("project_leader_id"),
        "created_by_name": body.get("created_by_name") or current_user.get("username"),
        "created_department_id": body.get("created_department_id") or current_user.get("department_id"),
        "created_department_name": body.get("created_department_name") or current_user.get("department_name"),
        "external_system": body.get("external_system"),
        "external_task_id": body.get("external_task_id"),
        "external_url": body.get("external_url"),
        "operator_ids": body.get("operator_ids") or [],
        "inspector_ids": body.get("inspector_ids") or [],
        "progress": 0,
        "output_results": None,
        "parent_task_id": body.get("parent_task_id"),
    }
    set_project(project_id, project)

    return api_created(
        project_to_task_response(project),
        location=f"/api/v1/projects/{project_id}",
    )
