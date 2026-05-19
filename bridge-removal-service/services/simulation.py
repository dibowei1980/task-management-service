import json
import os
import time
import uuid

import requests

from services.geo_utils import polygon_from_bbox, extract_bbox_from_geometry
from services.shp_utils import DomTileIndex, list_dom_tiles, validate_shp_components, read_shp_record_bboxes, read_shp_record_geometries, read_dbf_records, bridge_sort_key, parse_strategy
from services.tms_api import (
    parse_input_params, get_task, update_task_status, update_task_input_params,
    update_task_output_results, set_workflow_status, get_subtasks,
    get_api_config,
)
from services.dependency import build_dependency_graph, merge_step_result, filter_operation_subtasks
from services.status_mapping import to_platform_status, WORKFLOW_STATUS_DEFAULT


def _build_unit_manifest(task_id, input_params):
    from bridge_removal_task import run_automation_processing, run_interactive_correction, run_inpaint_fill, run_write_back_to_dom
    manifest = {"task_id": task_id, "steps": [], "artifacts": {}}
    merge_step_result(manifest, run_automation_processing(task_id, input_params))
    merge_step_result(manifest, run_interactive_correction(task_id, input_params))
    manifest["steps"].append({"name": "merge_masks", "status": "completed"})
    manifest["artifacts"]["merged_mask_path"] = os.path.join(input_params.get("intermediate_path") or f"./intermediate/{task_id}", "merged_mask.png")
    merge_step_result(manifest, run_inpaint_fill(task_id, input_params))
    merge_step_result(manifest, run_write_back_to_dom(task_id, input_params))
    return manifest


def simulate_end_to_end_flow(api_url, headers, input_params):
    batch_task_id = input_params.get("batch_task_id")
    if not batch_task_id:
        batch_payload = {
            "name": input_params.get("batch_name") or "DOM桥梁去除批任务",
            "type": "BRIDGE_REMOVAL_BATCH",
            "inputParams": json.dumps({
                "shp_file_path": input_params.get("shp_file_path"),
                "source_doms": input_params.get("source_doms"),
                "intermediate_root": input_params.get("intermediate_root") or "/mnt/intermediate",
                "init_project_rbac": False
            })
        }
        response = requests.post(f"{api_url}/tasks", headers=headers, data=json.dumps(batch_payload), timeout=15)
        response.raise_for_status()
        batch_task_id = response.json().get("id")
        if not batch_task_id:
            raise RuntimeError("创建批任务失败，未返回任务ID。")

    requests.post(f"{api_url}/tasks/{batch_task_id}/execute", headers=headers, timeout=15).raise_for_status()

    subtasks = []
    for _ in range(5):
        response = requests.get(f"{api_url}/tasks/{batch_task_id}/subtasks", headers=headers, timeout=15)
        response.raise_for_status()
        subtasks = response.json() or []
        if subtasks:
            break
        time.sleep(1)

    if not subtasks:
        raise RuntimeError("未获取到子任务，无法模拟流程。")

    simulate_rework = input_params.get("simulate_rework", True)
    simulate_final_reject = input_params.get("simulate_final_reject", True)
    first_unit_id = subtasks[0].get("id")

    for task in subtasks:
        task_id = task.get("id")
        raw_input_params = task.get("inputParams")
        unit_params = parse_input_params(raw_input_params)
        if not unit_params.get("intermediate_path"):
            unit_params["intermediate_path"] = f"./intermediate/{task_id}"
            update_task_input_params(api_url, headers, task_id, {"intermediate_path": unit_params["intermediate_path"]})

        set_workflow_status(api_url, headers, task_id, "处理中")
        manifest = _build_unit_manifest(task_id, unit_params)
        update_task_output_results(api_url, headers, task_id, {"manifest": manifest})
        set_workflow_status(api_url, headers, task_id, "待初检")

        if simulate_rework and task_id == first_unit_id:
            qa_feedback = unit_params.get("qa_feedback") or []
            qa_feedback.append({"stage": "初检", "result": "不通过", "message": "需要补充修正"})
            update_task_input_params(api_url, headers, task_id, {"qa_feedback": qa_feedback})
            set_workflow_status(api_url, headers, task_id, "需修改")
            set_workflow_status(api_url, headers, task_id, "待初检")

        set_workflow_status(api_url, headers, task_id, "初检通过")
        set_workflow_status(api_url, headers, task_id, "待终检")

        if simulate_final_reject and task_id == first_unit_id:
            qa_feedback = unit_params.get("qa_feedback") or []
            qa_feedback.append({"stage": "终检", "result": "不通过", "message": "终检抽查不通过"})
            update_task_input_params(api_url, headers, task_id, {"qa_feedback": qa_feedback})
            set_workflow_status(api_url, headers, task_id, "需修改")
        else:
            set_workflow_status(api_url, headers, task_id, "已归档")

    update_task_output_results(api_url, headers, batch_task_id, {"simulation": "completed"})


def _create_local_task(task_type, name, input_params):
    return {
        "id": str(uuid.uuid4()),
        "name": name,
        "type": task_type,
        "status": "PENDING",
        "inputParams": json.dumps(input_params or {}),
        "outputResults": "{}"
    }


def _local_update_task_status(task, task_status):
    task["status"] = task_status


def _local_update_task_input_params(task, updates):
    input_params = parse_input_params(task.get("inputParams"))
    input_params.update(updates or {})
    task["inputParams"] = json.dumps(input_params)


def _local_update_task_output_results(task, updates):
    raw_output = task.get("outputResults") or "{}"
    if isinstance(raw_output, str):
        try:
            output_results = json.loads(raw_output)
        except json.JSONDecodeError:
            output_results = {}
    else:
        output_results = raw_output or {}
    output_results.update(updates or {})
    task["outputResults"] = json.dumps(output_results)


def _local_set_workflow_status(task, workflow_status):
    task_status = to_platform_status(workflow_status)
    _local_update_task_status(task, task_status)
    _local_update_task_input_params(task, {"workflow_status": workflow_status})


def simulate_end_to_end_flow_local(input_params):
    batch_input = {
        "shp_file_path": input_params.get("shp_file_path"),
        "source_doms": input_params.get("source_doms"),
        "intermediate_root": input_params.get("intermediate_root") or "./intermediate",
        "init_project_rbac": False
    }
    batch_task = _create_local_task(
        "BRIDGE_REMOVAL_BATCH",
        input_params.get("batch_name") or "DOM桥梁去除批任务",
        batch_input
    )
    source_doms = input_params.get("source_doms") or []
    if not source_doms:
        unit_count = input_params.get("unit_count") or 3
        source_doms = [f"dummy_dom_{index+1}.tif" for index in range(unit_count)]

    subtasks = []
    for index, dom_path in enumerate(source_doms):
        unit_input = {
            "source_doms": [dom_path],
            "intermediate_path": os.path.join(input_params.get("intermediate_root") or "./intermediate", f"unit_{index+1}"),
            "workflow_status": WORKFLOW_STATUS_DEFAULT
        }
        subtask = _create_local_task(
            "BRIDGE_REMOVAL_UNIT",
            f"桥梁去除单元-{index+1}",
            unit_input
        )
        subtasks.append(subtask)

    simulate_rework = input_params.get("simulate_rework", True)
    simulate_final_reject = input_params.get("simulate_final_reject", True)
    first_unit_id = subtasks[0].get("id") if subtasks else None

    for task in subtasks:
        task_id = task.get("id")
        unit_params = parse_input_params(task.get("inputParams"))
        _local_set_workflow_status(task, "处理中")
        manifest = _build_unit_manifest(task_id, unit_params)
        _local_update_task_output_results(task, {"manifest": manifest})
        _local_set_workflow_status(task, "待初检")

        if simulate_rework and task_id == first_unit_id:
            qa_feedback = unit_params.get("qa_feedback") or []
            qa_feedback.append({"stage": "初检", "result": "不通过", "message": "需要补充修正"})
            _local_update_task_input_params(task, {"qa_feedback": qa_feedback})
            _local_set_workflow_status(task, "需修改")
            _local_set_workflow_status(task, "待初检")

        _local_set_workflow_status(task, "初检通过")
        _local_set_workflow_status(task, "待终检")

        if simulate_final_reject and task_id == first_unit_id:
            qa_feedback = parse_input_params(task.get("inputParams")).get("qa_feedback") or []
            qa_feedback.append({"stage": "终检", "result": "不通过", "message": "终检抽查不通过"})
            _local_update_task_input_params(task, {"qa_feedback": qa_feedback})
            _local_set_workflow_status(task, "需修改")
        else:
            _local_set_workflow_status(task, "已归档")

    _local_update_task_output_results(batch_task, {"simulation": "completed"})
    summary = []
    for task in subtasks:
        ip = parse_input_params(task.get("inputParams"))
        summary.append({
            "id": task.get("id"),
            "status": task.get("status"),
            "workflow_status": ip.get("workflow_status")
        })
    return {
        "batch_id": batch_task.get("id"),
        "batch_status": batch_task.get("status"),
        "subtask_count": len(subtasks),
        "subtasks": summary
    }