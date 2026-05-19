import json
import logging
import os
import threading
import time

import requests

from services.status_mapping import to_platform_status

logger = logging.getLogger(__name__)

_task_management_available = False
_tms_registered = False
_registration_lock = threading.Lock()
_retry_thread = None
_stop_event = threading.Event()

TMS_RETRY_INTERVAL = int(os.getenv("TMS_RETRY_INTERVAL", "30"))


def is_tms_available():
    return _task_management_available


def is_tms_registered():
    return _tms_registered


def is_local_mode():
    return not _task_management_available


def callback_task_status(task_id, workflow_status, results=None):
    global _task_management_available
    if not _task_management_available:
        logger.debug(f"Skipped callback for task {task_id}: task-management-service unavailable")
        return
    tms_url = os.getenv("TASK_MANAGEMENT_API_URL", "http://127.0.0.1:8082/api")
    tms_token = os.getenv("TASK_MANAGEMENT_AUTH_TOKEN", "internal-automation-token")
    callback_url = f"{tms_url}/tasks/{task_id}/workflow-status"
    headers = {
        "Authorization": f"Bearer {tms_token}",
        "Content-Type": "application/json"
    }
    platform_status = to_platform_status(workflow_status)
    payload = {
        "workflowStatus": platform_status,
    }
    if results:
        if isinstance(results, dict):
            results = json.dumps(results, ensure_ascii=False)
        payload["results"] = results
    try:
        resp = requests.patch(callback_url, json=payload, headers=headers, timeout=10)
        logger.info(f"Callback task {task_id} status={platform_status}: {resp.status_code}")
    except Exception as e:
        logger.warning(f"Callback failed for task {task_id} (non-critical): {e}")


def check_task_management():
    global _task_management_available
    tms_url = os.getenv("TASK_MANAGEMENT_API_URL", "http://127.0.0.1:8082/api")
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
    global _task_management_available, _tms_registered
    with _registration_lock:
        tms_url = os.getenv("TASK_MANAGEMENT_API_URL", "http://127.0.0.1:8082/api")
        if not tms_url.endswith("/api"):
            tms_url = tms_url + "/api"
        tms_token = os.getenv("TASK_MANAGEMENT_AUTH_TOKEN", "")
        brs_port = int(os.getenv("BRIDGE_REMOVAL_PORT", "5050"))
        brs_url = os.getenv("BRIDGE_REMOVAL_SERVICE_URL", f"http://localhost:{brs_port}")
        sso_client_id = os.getenv("SSO_CLIENT_ID", "bridge-removal-service")
        register_url = f"{tms_url}/external-systems/register"
        payload = {
            "systemId": "bridge-removal-app",
            "displayName": "桥梁去除系统",
            "serviceUrl": brs_url,
            "ssoClientId": sso_client_id,
            "dashboardUrl": os.getenv("BRIDGE_DASHBOARD_URL", "http://127.0.0.1:5174"),
            "supportedTaskTypes": ["BRIDGE_REMOVAL_BATCH", "BRIDGE_REMOVAL_UNIT"],
            "callbackPath": "/api/v1/projects/{id}/execute"
        }
        try:
            reg_headers = {"Content-Type": "application/json"}
            if tms_token:
                reg_headers["Authorization"] = f"Bearer {tms_token}"
            resp = requests.post(register_url, json=payload, headers=reg_headers, timeout=10)
            if resp.status_code in (200, 201):
                _task_management_available = True
                _tms_registered = True
                logger.info("Registered with task-management-service: %s", resp.status_code)
            else:
                _task_management_available = False
                _tms_registered = False
                logger.warning("TMS registration returned %s: %s", resp.status_code, resp.text[:200])
        except Exception as e:
            _task_management_available = False
            _tms_registered = False
            logger.warning("Failed to register with task-management-service (local project mode): %s", e)


def _retry_loop():
    while not _stop_event.is_set():
        _stop_event.wait(TMS_RETRY_INTERVAL)
        if _stop_event.is_set():
            break
        if not _tms_registered:
            logger.info("Retrying TMS registration...")
            register_with_task_management()
        elif not _task_management_available:
            check_task_management()
            if _task_management_available:
                logger.info("TMS connection restored")


def start_tms_retry_thread():
    global _retry_thread
    if _retry_thread is not None and _retry_thread.is_alive():
        return
    _stop_event.clear()
    _retry_thread = threading.Thread(target=_retry_loop, daemon=True, name="tms-retry")
    _retry_thread.start()
    logger.info("TMS retry thread started (interval=%ds)", TMS_RETRY_INTERVAL)


def stop_tms_retry_thread():
    _stop_event.set()
    if _retry_thread is not None:
        _retry_thread.join(timeout=5)
