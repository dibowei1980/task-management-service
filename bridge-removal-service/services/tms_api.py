import json
import os

import requests

from services.status_mapping import to_platform_status


def parse_input_params(raw_input_params):
    if raw_input_params is None:
        return {}
    if isinstance(raw_input_params, dict):
        return raw_input_params
    if not isinstance(raw_input_params, str):
        return {}
    raw_input_params = raw_input_params.strip()
    if not raw_input_params:
        return {}
    try:
        return json.loads(raw_input_params)
    except json.JSONDecodeError:
        return {}


def get_api_config():
    api_url = os.getenv("TASK_MANAGEMENT_API_URL")
    auth_token = os.getenv("AUTH_TOKEN")
    if not api_url or not auth_token:
        raise ValueError("环境变量 TASK_MANAGEMENT_API_URL 或 AUTH_TOKEN 未设置。")
    headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }
    return api_url, headers


def get_task(api_url, headers, task_id):
    response = requests.get(f"{api_url}/tasks/{task_id}", headers=headers, timeout=15)
    response.raise_for_status()
    return response.json()


def update_task_status(api_url, headers, task_id, task_status):
    response = requests.patch(
        f"{api_url}/tasks/{task_id}/status",
        headers=headers,
        params={"status": task_status},
        timeout=15
    )
    response.raise_for_status()


def update_task_input_params(api_url, headers, task_id, updates):
    task_data = get_task(api_url, headers, task_id)
    input_params = parse_input_params(task_data.get("inputParams"))
    input_params.update(updates or {})
    payload = {
        "name": task_data.get("name"),
        "type": task_data.get("type"),
        "priority": task_data.get("priority"),
        "dueAt": task_data.get("dueAt"),
        "inputParams": json.dumps(input_params),
        "outputResults": task_data.get("outputResults")
    }
    response = requests.put(f"{api_url}/tasks/{task_id}", headers=headers, data=json.dumps(payload), timeout=15)
    response.raise_for_status()


def update_task_output_results(api_url, headers, task_id, updates):
    task_data = get_task(api_url, headers, task_id)
    raw_output = task_data.get("outputResults") or "{}"
    if isinstance(raw_output, str):
        try:
            output_results = json.loads(raw_output)
        except json.JSONDecodeError:
            output_results = {}
    else:
        output_results = raw_output or {}
    output_results.update(updates or {})
    payload = {
        "name": task_data.get("name"),
        "type": task_data.get("type"),
        "priority": task_data.get("priority"),
        "dueAt": task_data.get("dueAt"),
        "inputParams": task_data.get("inputParams") or "{}",
        "outputResults": json.dumps(output_results)
    }
    response = requests.put(f"{api_url}/tasks/{task_id}", headers=headers, data=json.dumps(payload), timeout=15)
    response.raise_for_status()


def set_workflow_status(api_url, headers, task_id, workflow_status):
    task_status = to_platform_status(workflow_status)
    update_task_status(api_url, headers, task_id, task_status)
    update_task_input_params(api_url, headers, task_id, {"workflow_status": workflow_status})


def get_subtasks(api_url, headers, task_id):
    response = requests.get(f"{api_url}/tasks/{task_id}/subtasks", headers=headers, timeout=30)
    response.raise_for_status()
    return response.json() or []


def delete_task(api_url, headers, task_id):
    if not task_id:
        return
    response = requests.delete(f"{api_url}/tasks/{task_id}", headers=headers, timeout=30)
    if response.status_code not in (200, 204):
        response.raise_for_status()


def clear_dependencies(api_url, headers, task_id):
    if not task_id:
        return
    response = requests.delete(f"{api_url}/tasks/{task_id}/dependencies", headers=headers, timeout=30)
    if response.status_code in (200, 204, 404):
        return
    response.raise_for_status()


def create_dependencies(api_url, headers, adj):
    for source_id, targets in adj.items():
        for target_id in targets:
            try:
                response = requests.post(
                    f"{api_url}/tasks/{target_id}/dependencies",
                    headers=headers,
                    params={"dependencyTaskId": source_id},
                    timeout=15
                )
                response.raise_for_status()
            except requests.exceptions.RequestException as e:
                raise RuntimeError(f"为任务 {target_id} 添加依赖 {source_id} 失败: {e}")


def report_progress(api_url, headers, task_id, workflow_status, progress, message):
    try:
        body = {
            "workflowStatus": workflow_status,
            "progress": int(progress) if progress is not None else None,
            "commentStage": "分解",
            "commentResult": "INFO",
            "commentMessage": message
        }
        body = {k: v for k, v in body.items() if v is not None and v != ""}
        requests.patch(
            f"{api_url}/tasks/{task_id}/workflow-status",
            headers=headers,
            data=json.dumps(body),
            timeout=15
        ).raise_for_status()
    except Exception as ex:
        pass


def _get_user_management_config():
    api_url = os.getenv("USER_MANAGEMENT_API_URL") or "http://localhost:8081"
    auth_token = os.getenv("USER_MANAGEMENT_AUTH_TOKEN") or os.getenv("AUTH_TOKEN")
    if not auth_token:
        raise ValueError("环境变量 USER_MANAGEMENT_AUTH_TOKEN 或 AUTH_TOKEN 未设置。")
    headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }
    return api_url, headers


def _safe_request(request_fn):
    response = request_fn()
    if response.status_code in (200, 201, 204):
        return response
    if response.status_code in (400, 409):
        return response
    response.raise_for_status()
    return response


def _list_roles(api_url, headers):
    response = requests.get(f"{api_url}/api/rbac/roles", headers=headers, timeout=15)
    response.raise_for_status()
    return response.json() or []


def _list_permissions(api_url, headers):
    response = requests.get(f"{api_url}/api/rbac/permissions", headers=headers, timeout=15)
    response.raise_for_status()
    return response.json() or []


def init_project_roles_and_permissions():
    api_url, headers = _get_user_management_config()
    existing_roles = {item.get("roleName") for item in _list_roles(api_url, headers)}
    existing_permissions = {item.get("permissionName") for item in _list_permissions(api_url, headers)}

    permissions = [
        ("task:create", "创建任务"),
        ("task:assign", "指派任务"),
        ("task:review_final_qa", "终检审核"),
        ("task:reassign_failed", "终检不通过后重新下发"),
        ("task:claim", "领取任务"),
        ("task:update_progress", "更新任务进度"),
        ("task:submit_for_qa", "提交质检"),
        ("task:write_back", "写回成果"),
        ("task:query_pending_qa", "查询待初检任务"),
        ("task:approve", "初检通过"),
        ("task:reject", "初检不通过"),
        ("task:query_final", "查询待终检任务"),
        ("task:approve_final", "终检通过"),
        ("task:reject_final", "终检不通过"),
        ("task:update_status_internal", "系统内部状态更新"),
        ("task:manage_locks", "任务锁管理"),
        ("task:generate_dag", "依赖图生成")
    ]

    for permission_name, description in permissions:
        if permission_name in existing_permissions:
            continue
        payload = {"permissionName": permission_name, "description": description}
        _safe_request(lambda: requests.post(
            f"{api_url}/api/rbac/permissions",
            headers=headers,
            data=json.dumps(payload),
            timeout=15
        ))

    roles = {
        "ProjectLead": {
            "description": "项目负责人",
            "permissions": ["task:create", "task:assign", "task:review_final_qa", "task:reassign_failed"]
        },
        "Operator": {
            "description": "作业人员",
            "permissions": ["task:claim", "task:update_progress", "task:submit_for_qa", "task:write_back"]
        },
        "DepartmentQA": {
            "description": "部门质量检查员",
            "permissions": ["task:query_pending_qa", "task:approve", "task:reject"]
        },
        "FinalQA": {
            "description": "最终质量检查员",
            "permissions": ["task:query_final", "task:approve_final", "task:reject_final"]
        },
        "SystemService": {
            "description": "系统服务",
            "permissions": ["task:update_status_internal", "task:manage_locks", "task:generate_dag"]
        }
    }

    for role_name, role_info in roles.items():
        if role_name not in existing_roles:
            payload = {"roleName": role_name, "description": role_info["description"]}
            _safe_request(lambda: requests.post(
                f"{api_url}/api/rbac/roles",
                headers=headers,
                data=json.dumps(payload),
                timeout=15
            ))
        for permission_name in role_info["permissions"]:
            payload = {"permissionName": permission_name}
            _safe_request(lambda: requests.post(
                f"{api_url}/api/rbac/roles/{role_name}/permissions",
                headers=headers,
                data=json.dumps(payload),
                timeout=15
            ))
