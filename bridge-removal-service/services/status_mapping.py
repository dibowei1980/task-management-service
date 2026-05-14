import logging

logger = logging.getLogger(__name__)

PENDING = "PENDING"
PAUSED = "PAUSED"
IN_PROGRESS = "IN_PROGRESS"
FAILED = "FAILED"
SUBMITTED_FOR_QA = "SUBMITTED_FOR_QA"
COMPLETED = "COMPLETED"

WORKFLOW_STATUS_DEFAULT = "待处理"

IN_PROGRESS_STATUSES = {"处理中", "待初检", "需修改", "待写回", "完成"}
COMPLETED_WORKLOAD_STATUSES = {"待写回", "完成"}

BUSINESS_TO_PLATFORM_STATUS = {
    "待处理": PENDING,
    "已锁定": PAUSED,
    "处理中": IN_PROGRESS,
    "待初检": IN_PROGRESS,
    "需修改": IN_PROGRESS,
    "待写回": IN_PROGRESS,
    "完成": IN_PROGRESS,
    "失败": FAILED,
}


def to_platform_status(business_status: str) -> str:
    return BUSINESS_TO_PLATFORM_STATUS.get(business_status, business_status)


def compute_status_workloads(units: list, unit_workload: float = 1.0) -> dict:
    pending = 0.0
    paused = 0.0
    in_progress = 0.0
    in_progress_completed = 0.0
    failed = 0.0

    for unit in units:
        ws = _get_workflow_status(unit)
        wl = _get_workload(unit, unit_workload)

        if ws == "待处理":
            pending += wl
        elif ws == "已锁定":
            paused += wl
        elif ws == "失败":
            failed += wl
        elif ws in IN_PROGRESS_STATUSES:
            in_progress += wl
            if ws in COMPLETED_WORKLOAD_STATUSES:
                in_progress_completed += wl

    return {
        "PENDING": pending,
        "PAUSED": paused,
        "IN_PROGRESS": in_progress,
        "inProgressCompletedWorkload": in_progress_completed,
        "FAILED": failed,
    }


def should_submit_for_qa(units: list) -> bool:
    if not units:
        return False
    for unit in units:
        ws = _get_workflow_status(unit)
        if ws != "完成":
            return False
    return True


def build_progress_payload(units: list, unit_workload: float = 1.0) -> dict:
    workloads = compute_status_workloads(units, unit_workload)

    if should_submit_for_qa(units):
        total = sum(workloads.values())
        return {
            "workflowStatus": SUBMITTED_FOR_QA,
            "statusWorkloads": {
                SUBMITTED_FOR_QA: total,
            },
            "inProgressCompletedWorkload": 0,
        }

    return {
        "workflowStatus": IN_PROGRESS,
        "statusWorkloads": {
            PENDING: workloads["PENDING"],
            PAUSED: workloads["PAUSED"],
            IN_PROGRESS: workloads["IN_PROGRESS"],
            FAILED: workloads["FAILED"],
        },
        "inProgressCompletedWorkload": workloads["inProgressCompletedWorkload"],
    }


def _get_workflow_status(unit) -> str:
    if isinstance(unit, dict):
        ip = unit.get("input_params", {})
        if isinstance(ip, str):
            try:
                import json
                ip = json.loads(ip)
            except Exception:
                ip = {}
        ws = ip.get("workflow_status") or ip.get("workflowStatus", "")
        if ws:
            return ws
        ws = unit.get("workflow_status", "")
        if ws:
            return ws
    return WORKFLOW_STATUS_DEFAULT


def _get_workload(unit, default: float) -> float:
    if isinstance(unit, dict):
        ip = unit.get("input_params", {})
        if isinstance(ip, str):
            try:
                import json
                ip = json.loads(ip)
            except Exception:
                ip = {}
        wl = ip.get("workload") or unit.get("workload")
        if wl is not None:
            try:
                return float(wl)
            except (TypeError, ValueError):
                pass
    return default
