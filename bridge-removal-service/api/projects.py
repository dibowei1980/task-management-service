import json
import os
import threading
import traceback
from datetime import datetime

import requests
from flask import Blueprint, jsonify, request

from api.auth import require_local_auth, require_auth, require_permission
from services.project_service import (
    get_project, get_all_projects, set_project,
    project_to_task_response, load_projects_from_db,
)
from services.job_service import create_job_record, update_job_status, get_all_jobs
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
    from db.repository import ProjectRepository
    body = request.get_json(force=True, silent=True) or {}
    task_type = body.get("task_type", "BRIDGE_REMOVAL_BATCH")
    task_name = body.get("task_name", "")
    input_params = body.get("input_params", {})
    callback_url = body.get("callback_url", "")
    _projects = get_all_projects()

    if project_id in _projects:
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

    ProjectRepository.save({
        "id": project_id,
        "name": task_name,
        "type": task_type,
        "status": "RECEIVED",
        "source": "tms",
        "tms_synced": True,
        "input_params": json.dumps(input_params, ensure_ascii=False) if isinstance(input_params, dict) else input_params,
        "callback_url": callback_url,
        "operator_ids": "[]",
        "inspector_ids": "[]",
    })

    def _run_async():
        from db.repository import ProjectRepository as PR
        job_id = create_job_record(project_id, task_type, input_params)
        project["job_id"] = job_id
        project["status"] = "IN_PROGRESS"
        PR.save({"id": project_id, "job_id": job_id, "status": "IN_PROGRESS"})
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
                project["status"] = "COMPLETED"
                PR.save({"id": project_id, "status": "COMPLETED"})
                update_job_status(job_id, "COMPLETED", results=task_results)
                callback_task_status(project_id, "COMPLETED", results=task_results)
            else:
                project["status"] = "FAILED"
                PR.save({"id": project_id, "status": "FAILED"})
                update_job_status(job_id, "FAILED", error=str(task_results.get("error", "Unknown error")))
                callback_task_status(project_id, "FAILED", results=task_results)
        except Exception as e:
            error_msg = str(e)
            project["status"] = "FAILED"
            PR.save({"id": project_id, "status": "FAILED"})
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
    load_projects_from_db()
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
    for field in updatable_fields:
        camel = ''.join(word.capitalize() for word in field.split('_'))
        camel = camel[0].lower() + camel[1:]
        val = body.get(field) if field in body else body.get(camel)
        if val is not None:
            project[field] = val
    if "name" in body and "task_name" not in body:
        project["task_name"] = body["name"]
    if "task_name" in body and "name" not in body:
        project["name"] = body["task_name"]
    if "input_params" in body:
        ip = body["input_params"]
        if isinstance(ip, str):
            try:
                ip = json.loads(ip)
            except (json.JSONDecodeError, TypeError):
                ip = {}
        project["input_params"] = ip
    return jsonify(project_to_task_response(project))


@projects_bp.route("/<project_id>/jobs", methods=["GET"])
@require_local_auth
def list_project_jobs(project_id: str):
    from db.repository import JobRepository, model_to_dict
    project = get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404
    db_jobs = JobRepository.find_by_project(project_id)
    result = []
    for j in db_jobs:
        d = model_to_dict(j)
        d["job_id"] = d.get("id")
        result.append(d)
    _jobs = get_all_jobs()
    for jid, j in _jobs.items():
        if j.get("task_id") == project_id and not any(r.get("job_id") == jid for r in result):
            result.append(j)
    return jsonify(result)


@projects_bp.route("/<project_id>", methods=["DELETE"])
@require_local_auth
def delete_project(project_id: str):
    from db.repository import ProjectRepository
    _projects = get_all_projects()
    if project_id not in _projects:
        return jsonify({"error": "Project not found"}), 404
    del _projects[project_id]
    _jobs = get_all_jobs()
    jobs_to_remove = [jid for jid, j in _jobs.items() if j.get("task_id") == project_id]
    for jid in jobs_to_remove:
        del _jobs[jid]
    ProjectRepository.delete(project_id)
    return jsonify({"message": "Project deleted"}), 200


@projects_bp.route("/<project_id>/submit-to-tms", methods=["POST"])
@require_local_auth
def submit_project_to_tms(project_id: str):
    from services.callback_service import _task_management_available
    from db.repository import ProjectRepository
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
            project["tms_synced"] = True
            project["source"] = "tms"
            project["callback_url"] = f"{TMS_URL}/tasks/{project_id}/workflow-status"
            ProjectRepository.save({"id": project_id, "tms_synced": True, "source": "tms", "callback_url": project["callback_url"]})
            return jsonify(project_to_task_response(project))
        return jsonify({"error": f"TMS returned {resp.status_code}", "detail": resp.text}), resp.status_code
    except requests.RequestException as e:
        return jsonify({"error": f"Failed to submit to TMS: {str(e)}"}), 502
