import json
import os

import requests
from flask import current_app

from services.status_mapping import to_platform_status

_task_management_available = False


def callback_task_status(task_id, workflow_status, results=None):
    global _task_management_available
    if not _task_management_available:
        current_app.logger.debug(f"Skipped callback for task {task_id}: task-management-service unavailable")
        return
    tms_url = os.getenv("TASK_MANAGEMENT_API_URL", "http://localhost:8082/api")
    tms_token = os.getenv("TASK_MANAGEMENT_AUTH_TOKEN", "internal-automation-token")
    callback_url = f"{tms_url}/tasks/{task_id}/workflow-status"
    headers = {
        "Authorization": f"Bearer {tms_token}",
        "Content-Type": "application/json"
    }
    platform_status = to_platform_status(workflow_status)
    payload = {
        "workflowStatus": platform_status,
        "workflow_status": platform_status,
    }
    if results:
        if isinstance(results, dict):
            results = json.dumps(results, ensure_ascii=False)
        payload["results"] = results
    try:
        resp = requests.patch(callback_url, json=payload, headers=headers, timeout=10)
        current_app.logger.info(f"Callback task {task_id} status={platform_status}: {resp.status_code}")
    except Exception as e:
        current_app.logger.warning(f"Callback failed for task {task_id} (non-critical): {e}")


def check_task_management():
    global _task_management_available
    tms_url = os.getenv("TASK_MANAGEMENT_API_URL", "http://localhost:8082/api")
    tms_token = os.getenv("TASK_MANAGEMENT_AUTH_TOKEN", "internal-automation-token")
    try:
        resp = requests.get(
            f"{tms_url.replace('/api', '')}/actuator/health",
            headers={"Authorization": f"Bearer {tms_token}"},
            timeout=5,
        )
        _task_management_available = resp.status_code == 200
    except Exception:
        _task_management_available = False
    return _task_management_available


def register_with_task_management():
    global _task_management_available
    tms_url = os.getenv("TASK_MANAGEMENT_API_URL", "http://localhost:8082/api")
    brs_port = int(os.getenv("BRIDGE_REMOVAL_PORT", "5050"))
    brs_url = os.getenv("BRIDGE_REMOVAL_SERVICE_URL", f"http://localhost:{brs_port}")
    sso_client_id = os.getenv("SSO_CLIENT_ID", "bridge-removal-service")
    register_url = f"{tms_url}/external-systems/register"
    payload = {
        "systemId": "bridge-removal-app",
        "displayName": "桥梁去除系统",
        "serviceUrl": brs_url,
        "ssoClientId": sso_client_id,
        "dashboardUrl": os.getenv("BRIDGE_DASHBOARD_URL", "http://localhost:5174"),
        "supportedTaskTypes": ["BRIDGE_REMOVAL_BATCH", "BRIDGE_REMOVAL_UNIT"],
        "callbackPath": "/api/projects/{id}/execute"
    }
    try:
        resp = requests.post(register_url, json=payload, timeout=10)
        _task_management_available = True
        current_app.logger.info(f"Registered with task-management-service: {resp.status_code}")
    except Exception as e:
        _task_management_available = False
        current_app.logger.warning(f"Failed to register with task-management-service (service will run independently): {e}")
