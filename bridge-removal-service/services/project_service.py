import json
from typing import Any, Dict, List, Optional

from db.repository import ProjectRepository, model_to_dict


def db_model_to_project_dict(model) -> Dict[str, Any]:
    data = model_to_dict(model)
    input_params = data.get("input_params") or "{}"
    if isinstance(input_params, str):
        try:
            input_params = json.loads(input_params)
        except (json.JSONDecodeError, TypeError):
            input_params = {}
    if not isinstance(input_params, dict):
        input_params = {}
    operator_ids = data.get("operator_ids") or "[]"
    if isinstance(operator_ids, str):
        try:
            operator_ids = json.loads(operator_ids)
        except (json.JSONDecodeError, TypeError):
            operator_ids = []
    if not isinstance(operator_ids, list):
        operator_ids = []
    inspector_ids = data.get("inspector_ids") or "[]"
    if isinstance(inspector_ids, str):
        try:
            inspector_ids = json.loads(inspector_ids)
        except (json.JSONDecodeError, TypeError):
            inspector_ids = []
    if not isinstance(inspector_ids, list):
        inspector_ids = []
    output_results = data.get("output_results") or "{}"
    if isinstance(output_results, str):
        try:
            output_results = json.loads(output_results)
        except (json.JSONDecodeError, TypeError):
            output_results = {}
    if not isinstance(output_results, dict):
        output_results = {}
    return {
        "project_id": data.get("id"),
        "task_type": data.get("type", "BRIDGE_REMOVAL_BATCH"),
        "task_name": data.get("name", ""),
        "name": data.get("name", ""),
        "category": data.get("category", "PROJECT"),
        "priority": data.get("priority", 1),
        "status": data.get("status", "PENDING"),
        "input_params": input_params,
        "callback_url": data.get("callback_url", ""),
        "received_at": data.get("received_at", ""),
        "created_at": data.get("created_at", ""),
        "job_id": data.get("job_id"),
        "source": data.get("source", "local"),
        "tms_synced": data.get("tms_synced", False),
        "department_id": data.get("department_id"),
        "department_name": data.get("department_name"),
        "project_leader_id": data.get("project_leader_id"),
        "assignee_id": data.get("assignee_id"),
        "created_by_name": data.get("created_by_name"),
        "created_department_id": data.get("created_department_id"),
        "created_department_name": data.get("created_department_name"),
        "external_system": data.get("external_system"),
        "external_task_id": data.get("external_task_id"),
        "external_url": data.get("external_url"),
        "operator_ids": operator_ids,
        "inspector_ids": inspector_ids,
        "progress": data.get("progress", 0),
        "output_results": output_results,
        "parent_task_id": data.get("parent_task_id"),
    }


def project_dict_to_db(project: Dict[str, Any]) -> Dict[str, Any]:
    input_params = project.get("input_params", {})
    if isinstance(input_params, dict):
        input_params = json.dumps(input_params, ensure_ascii=False)
    output_results = project.get("output_results")
    if isinstance(output_results, dict):
        output_results = json.dumps(output_results, ensure_ascii=False)
    elif output_results is None:
        output_results = None
    operator_ids = project.get("operator_ids", [])
    if isinstance(operator_ids, list):
        operator_ids = json.dumps(operator_ids)
    inspector_ids = project.get("inspector_ids", [])
    if isinstance(inspector_ids, list):
        inspector_ids = json.dumps(inspector_ids)
    return {
        "id": project.get("project_id"),
        "name": project.get("name") or project.get("task_name", ""),
        "type": project.get("task_type", "BRIDGE_REMOVAL_BATCH"),
        "status": project.get("status", "PENDING"),
        "source": project.get("source", "local"),
        "tms_synced": project.get("tms_synced", False),
        "input_params": input_params,
        "callback_url": project.get("callback_url", ""),
        "category": project.get("category", "PROJECT"),
        "priority": project.get("priority", 1),
        "department_id": project.get("department_id"),
        "department_name": project.get("department_name"),
        "project_leader_id": project.get("project_leader_id"),
        "assignee_id": project.get("assignee_id"),
        "created_by_name": project.get("created_by_name"),
        "created_department_id": project.get("created_department_id"),
        "created_department_name": project.get("created_department_name"),
        "external_system": project.get("external_system"),
        "external_task_id": project.get("external_task_id"),
        "external_url": project.get("external_url"),
        "operator_ids": operator_ids,
        "inspector_ids": inspector_ids,
        "job_id": project.get("job_id"),
        "progress": project.get("progress", 0),
        "output_results": output_results,
        "parent_task_id": project.get("parent_task_id"),
    }


def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    model = ProjectRepository.find_by_id(project_id)
    if model:
        return db_model_to_project_dict(model)
    return None


def get_all_projects() -> Dict[str, Dict[str, Any]]:
    models = ProjectRepository.find_all()
    return {m.id: db_model_to_project_dict(m) for m in models}


def set_project(project_id: str, project: Dict[str, Any]):
    db_data = project_dict_to_db(project)
    ProjectRepository.save(db_data)


def update_project_fields(project_id: str, updates: Dict[str, Any]):
    project = get_project(project_id)
    if not project:
        return None
    project.update(updates)
    db_data = project_dict_to_db(project)
    ProjectRepository.save(db_data)
    return project


def delete_project(project_id: str) -> bool:
    return ProjectRepository.delete(project_id)


def project_to_task_response(project: Dict[str, Any]) -> Dict[str, Any]:
    input_params = project.get("input_params", {})
    if isinstance(input_params, dict):
        input_params = json.dumps(input_params, ensure_ascii=False)
    return {
        "id": project["project_id"],
        "name": project.get("name") or project.get("task_name", ""),
        "type": project.get("task_type", "BRIDGE_REMOVAL_BATCH"),
        "category": project.get("category", "PROJECT"),
        "status": project.get("status", "PENDING"),
        "priority": project.get("priority", 1),
        "assignee_id": project.get("assignee_id") or project.get("project_leader_id"),
        "project_leader_id": project.get("project_leader_id"),
        "operator_ids": project.get("operator_ids", []),
        "inspector_ids": project.get("inspector_ids", []),
        "project_id": project.get("parent_task_id"),
        "department_id": project.get("department_id"),
        "created_by_name": project.get("created_by_name"),
        "created_department_id": project.get("created_department_id"),
        "created_department_name": project.get("created_department_name"),
        "external_system": project.get("external_system"),
        "external_task_id": project.get("external_task_id"),
        "external_url": project.get("external_url"),
        "progress": project.get("progress", 0),
        "created_at": project.get("created_at") or project.get("received_at", ""),
        "input_params": input_params,
        "output_results": project.get("output_results"),
        "parent_task_id": project.get("parent_task_id"),
        "source": project.get("source", "tms"),
        "tms_synced": project.get("tms_synced", True),
        "callback_url": project.get("callback_url", ""),
        "job_id": project.get("job_id"),
        "received_at": project.get("received_at", ""),
    }


def find_project_by_task_id(task_id):
    project = get_project(task_id)
    return project


def get_subtasks_local(parent_task_id: str) -> list:
    models = ProjectRepository.find_by_parent(parent_task_id)
    results = []
    for m in models:
        p = db_model_to_project_dict(m)
        resp = project_to_task_response(p)
        resp["inputParams"] = p.get("input_params", {})
        resp["outputResults"] = p.get("output_results")
        results.append(resp)
    return results


def get_task_local(task_id: str) -> dict:
    project = get_project(task_id)
    if not project:
        return {}
    resp = project_to_task_response(project)
    resp["inputParams"] = project.get("input_params", {})
    resp["outputResults"] = project.get("output_results")
    return resp
