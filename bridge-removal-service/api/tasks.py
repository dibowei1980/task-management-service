import json
import os
import threading
import traceback
import uuid
from datetime import datetime

from flask import Blueprint, jsonify, request

from api.auth import require_local_auth, require_auth, require_permission
from services.project_service import (
    get_project, project_to_task_response, find_project_by_task_id,
    update_project_fields,
)
from services.job_service import create_job_record, update_job_status, find_latest_job_by_task
from services.callback_service import callback_task_status
from services.status_mapping import to_platform_status

from bridge_removal_task import (
    BridgeRemovalOrchestratorTask,
    BridgeRemovalUnitProcessorTask,
    run_inpaint_fill,
    run_write_back_to_dom,
)

tasks_bp = Blueprint("tasks", __name__)


@tasks_bp.route("/<task_id>", methods=["GET"])
@require_local_auth
def get_task(task_id: str):
    project = get_project(task_id)
    if not project:
        project = find_project_by_task_id(task_id)
    if not project:
        return jsonify({"error": "Task not found"}), 404
    return jsonify(project_to_task_response(project))


@tasks_bp.route("/<task_id>", methods=["PUT"])
@require_local_auth
def update_task(task_id: str):
    project = get_project(task_id)
    if not project:
        return jsonify({"error": "Task not found"}), 404
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


@tasks_bp.route("/<task_id>/workflow-status", methods=["PATCH"])
@require_local_auth
def update_workflow_status(task_id: str):
    project = get_project(task_id)
    if not project:
        return jsonify({"error": "Task not found"}), 404
    body = request.get_json(force=True, silent=True) or {}
    workflow_status = body.get("workflowStatus") or body.get("workflow_status")
    if not workflow_status:
        return jsonify({"error": "workflowStatus is required"}), 400

    input_params = project.get("input_params", {})
    if isinstance(input_params, str):
        try:
            input_params = json.loads(input_params)
        except (json.JSONDecodeError, TypeError):
            input_params = {}

    is_local_unsynced = project.get("source") == "local" and not project.get("tms_synced")
    qa_blocked_transitions = {
        ("IN_PROGRESS", "PENDING_WRITEBACK"),
        ("IN_PROGRESS", "COMPLETED"),
        ("PENDING_WRITEBACK", "COMPLETED"),
    }
    current_ws = input_params.get("workflowStatus") or input_params.get("workflow_status", "")
    if is_local_unsynced and (current_ws, workflow_status) in qa_blocked_transitions:
        return jsonify({"error": "Local unsynced project cannot pass quality check. Submit to TMS first."}), 403

    input_params["workflowStatus"] = workflow_status
    input_params["workflow_status"] = workflow_status

    comment_stage = body.get("commentStage") or body.get("comment_stage")
    comment_result = body.get("commentResult") or body.get("comment_result")
    comment_message = body.get("commentMessage") or body.get("comment_message")
    intermediate_path = body.get("intermediatePath") or body.get("intermediate_path")
    progress = body.get("progress")

    if comment_stage:
        input_params["comment_stage"] = comment_stage
    if comment_result:
        input_params["comment_result"] = comment_result
    if comment_message:
        input_params["comment_message"] = comment_message
    if intermediate_path:
        input_params["intermediate_path"] = intermediate_path
    if progress is not None:
        project["progress"] = progress

    project["input_params"] = input_params

    from services.status_mapping import PENDING, PAUSED, IN_PROGRESS, FAILED, SUBMITTED_FOR_QA, COMPLETED
    VALID_PLATFORM_STATUSES = {PENDING, PAUSED, IN_PROGRESS, FAILED, SUBMITTED_FOR_QA, COMPLETED,
                               "PENDING_QA", "NEEDS_REVISION", "PENDING_WRITEBACK", "ASSIGNED", "RECEIVED"}
    project["status"] = workflow_status if workflow_status in VALID_PLATFORM_STATUSES else project.get("status", PENDING)

    if workflow_status == "COMPLETED":
        project["progress"] = 100
        project["output_results"] = json.dumps(input_params, ensure_ascii=False)

    callback_task_status(task_id, workflow_status, results=project.get("output_results") if workflow_status == "COMPLETED" else None)

    update_project_fields(task_id, {
        "status": project["status"],
        "input_params": input_params,
        "progress": project.get("progress", 0),
        "output_results": project.get("output_results"),
    })

    return jsonify(project_to_task_response(project))


@tasks_bp.route("/<task_id>/dom-locate", methods=["GET"])
@require_local_auth
def dom_locate(task_id: str):
    project = find_project_by_task_id(task_id)
    if not project:
        return jsonify({"error": "Task not found"}), 404

    input_params = project.get("input_params", {})
    bridge_polygon = input_params.get("bridge_polygon") or input_params.get("bridge_polygon_geojson")
    bridge_centerline = input_params.get("bridge_centerline") or input_params.get("bridge_centerline_geojson")
    source_doms = input_params.get("source_doms") or []

    dom_tiles = []
    for dom_path in source_doms:
        try:
            from services.shp_utils import DomTileIndex, dom_tile_info
            info = dom_tile_info(dom_path)
            dom_tiles.append({
                "path": dom_path,
                "bounds": info.get("bounds"),
                "resolution": info.get("resolution"),
            })
        except Exception:
            dom_tiles.append({"path": dom_path, "bounds": None, "resolution": None})

    return jsonify({
        "task_id": task_id,
        "bridge_polygon": bridge_polygon,
        "bridge_centerline": bridge_centerline,
        "source_doms": source_doms,
        "dom_tiles": dom_tiles,
    })


@tasks_bp.route("/<task_id>/dom-file", methods=["GET"])
@require_local_auth
def dom_file(task_id: str):
    from flask import send_file
    project = find_project_by_task_id(task_id)
    if not project:
        return jsonify({"error": "Task not found"}), 404

    input_params = project.get("input_params", {})
    dom_path = request.args.get("path")
    if not dom_path:
        source_doms = input_params.get("source_doms") or []
        if source_doms:
            dom_path = source_doms[0]
    if not dom_path or not os.path.exists(dom_path):
        return jsonify({"error": "DOM file not found"}), 404

    return send_file(dom_path, mimetype="image/tiff")


@tasks_bp.route("/<task_id>/preprocess-segments", methods=["GET"])
@require_local_auth
def preprocess_segments(task_id: str):
    project = find_project_by_task_id(task_id)
    if not project:
        return jsonify({"error": "Task not found"}), 404

    input_params = project.get("input_params", {})
    intermediate_path = input_params.get("intermediate_path") or f"./intermediate/{task_id}"
    segments_dir = os.path.join(intermediate_path, "segments")

    segments = []
    if os.path.exists(segments_dir):
        for name in sorted(os.listdir(segments_dir)):
            seg_path = os.path.join(segments_dir, name)
            if os.path.isdir(seg_path):
                segments.append({"name": name, "path": seg_path})

    return jsonify({"task_id": task_id, "segments": segments, "intermediate_path": intermediate_path})


@tasks_bp.route("/<task_id>/preprocess-file", methods=["GET"])
@require_local_auth
def preprocess_file(task_id: str):
    from flask import send_file
    project = find_project_by_task_id(task_id)
    if not project:
        return jsonify({"error": "Task not found"}), 404

    file_path = request.args.get("path")
    if not file_path or not os.path.exists(file_path):
        return jsonify({"error": "File not found"}), 404

    return send_file(file_path)


@tasks_bp.route("/<task_id>/preprocess-generate", methods=["POST"])
@require_local_auth
@require_permission("task:execute")
def api_preprocess_generate(task_id: str):
    body = request.get_json(force=True, silent=True) or {}
    input_params = body.get("input_params", {})
    overwrite = body.get("overwrite", False)
    max_side_px = body.get("max_side_px", 1024)

    job_id = create_job_record(task_id, "PREPROCESS_GENERATE", input_params)

    def _run():
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
        except Exception as e:
            update_job_status(job_id, "FAILED", error=str(e))

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"job_id": job_id, "status": "STARTED"})


@tasks_bp.route("/<task_id>/execute", methods=["POST"])
@require_auth
@require_permission("task:execute")
def execute_task(task_id: str):
    body = request.get_json(force=True, silent=True) or {}
    task_type = body.get("task_type", "")
    input_params = body.get("input_params", {})

    if task_type not in ("BRIDGE_REMOVAL_BATCH", "BRIDGE_REMOVAL_UNIT"):
        return jsonify({"error": f"不支持的任务类型: {task_type}"}), 400

    job_id = create_job_record(task_id, task_type, input_params)

    def _run():
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
        except Exception as e:
            error_msg = str(e)
            traceback_str = traceback.format_exc()
            update_job_status(job_id, "FAILED", error=f"{error_msg}\n{traceback_str}")

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"job_id": job_id, "status": "STARTED"})


@tasks_bp.route("/<task_id>/mask-generate", methods=["POST"])
@require_local_auth
@require_permission("task:execute")
def mask_generate(task_id: str):
    body = request.get_json(force=True, silent=True) or {}
    input_params = body.get("input_params", {})
    segment_name = body.get("segment_name", "")

    project = find_project_by_task_id(task_id)
    if not project:
        return jsonify({"error": "Task not found"}), 404

    job_id = create_job_record(task_id, "MASK_GENERATE", input_params)

    def _run():
        try:
            update_job_status(job_id, "IN_PROGRESS")
            intermediate_path = input_params.get("intermediate_path") or f"./intermediate/{task_id}"
            from bridge_removal.mask_pipeline import run_mask_pipeline
            result = run_mask_pipeline(
                intermediate_path=intermediate_path,
                segment_name=segment_name,
                input_params=input_params,
            )
            update_job_status(job_id, "COMPLETED", results=result)
        except Exception as e:
            update_job_status(job_id, "FAILED", error=str(e))

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"job_id": job_id, "status": "STARTED"})


@tasks_bp.route("/<task_id>/mask-save", methods=["POST"])
@require_local_auth
@require_permission("task:execute")
def mask_save(task_id: str):
    body = request.get_json(force=True, silent=True) or {}
    mask_data = body.get("mask_data")
    segment_name = body.get("segment_name", "")

    project = find_project_by_task_id(task_id)
    if not project:
        return jsonify({"error": "Task not found"}), 404

    input_params = project.get("input_params", {})
    intermediate_path = input_params.get("intermediate_path") or f"./intermediate/{task_id}"
    mask_dir = os.path.join(intermediate_path, "masks")
    os.makedirs(mask_dir, exist_ok=True)

    mask_filename = f"{segment_name}_mask.png" if segment_name else "edited_mask.png"
    mask_path = os.path.join(mask_dir, mask_filename)

    try:
        import numpy as np
        import cv2
        if isinstance(mask_data, list):
            arr = np.array(mask_data, dtype=np.uint8)
            cv2.imwrite(mask_path, arr)
        elif isinstance(mask_data, str):
            import base64
            img_bytes = base64.b64decode(mask_data)
            with open(mask_path, "wb") as f:
                f.write(img_bytes)
        else:
            return jsonify({"error": "Invalid mask_data format"}), 400

        return jsonify({"task_id": task_id, "mask_path": mask_path, "saved": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@tasks_bp.route("/<task_id>/inpaint-start", methods=["POST"])
@require_local_auth
@require_permission("task:execute")
def inpaint_start(task_id: str):
    body = request.get_json(force=True, silent=True) or {}
    input_params = body.get("input_params", {})

    project = find_project_by_task_id(task_id)
    if not project:
        return jsonify({"error": "Task not found"}), 404

    job_id = create_job_record(task_id, "INPAINT_START", input_params)

    def _run():
        try:
            update_job_status(job_id, "IN_PROGRESS")
            result = run_inpaint_fill(task_id, input_params)
            update_job_status(job_id, "COMPLETED", results=result)
        except Exception as e:
            update_job_status(job_id, "FAILED", error=str(e))

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"job_id": job_id, "status": "STARTED"})


@tasks_bp.route("/<task_id>/inpaint-status", methods=["GET"])
@require_local_auth
def inpaint_status(task_id: str):
    job = find_latest_job_by_task(task_id, "INPAINT_START")
    if not job:
        return jsonify({"task_id": task_id, "status": "NOT_STARTED"})
    return jsonify({"task_id": task_id, "job_id": job["job_id"], "status": job["status"], "results": job.get("results")})


@tasks_bp.route("/<task_id>/inpaint-cancel", methods=["POST"])
@require_local_auth
@require_permission("task:execute")
def inpaint_cancel(task_id: str):
    job = find_latest_job_by_task(task_id, "INPAINT_START")
    if not job or job["status"] != "IN_PROGRESS":
        return jsonify({"task_id": task_id, "status": "NO_ACTIVE_JOB"})
    job["status"] = "CANCELLED"
    return jsonify({"task_id": task_id, "status": "CANCELLED"})


@tasks_bp.route("/<task_id>/inpaint-retry", methods=["POST"])
@require_local_auth
@require_permission("task:execute")
def inpaint_retry(task_id: str):
    return inpaint_start(task_id)


@tasks_bp.route("/<task_id>/inpaint-result", methods=["POST"])
@require_local_auth
@require_permission("task:execute")
def inpaint_result(task_id: str):
    body = request.get_json(force=True, silent=True) or {}
    selected_index = body.get("selected_index", 0)

    project = find_project_by_task_id(task_id)
    if not project:
        return jsonify({"error": "Task not found"}), 404

    input_params = project.get("input_params", {})
    intermediate_path = input_params.get("intermediate_path") or f"./intermediate/{task_id}"
    inpainted_path = os.path.join(intermediate_path, "inpainted_patch.tif")

    if not os.path.exists(inpainted_path):
        return jsonify({"error": "Inpaint result not found"}), 404

    return jsonify({
        "task_id": task_id,
        "selected_index": selected_index,
        "result_path": inpainted_path,
        "status": "SELECTED",
    })


@tasks_bp.route("/<task_id>/inpaint-file", methods=["GET"])
@require_local_auth
def inpaint_file(task_id: str):
    from flask import send_file
    project = find_project_by_task_id(task_id)
    if not project:
        return jsonify({"error": "Task not found"}), 404

    input_params = project.get("input_params", {})
    intermediate_path = input_params.get("intermediate_path") or f"./intermediate/{task_id}"
    inpainted_path = os.path.join(intermediate_path, "inpainted_patch.tif")

    if not os.path.exists(inpainted_path):
        return jsonify({"error": "Inpaint file not found"}), 404

    return send_file(inpainted_path, mimetype="image/tiff")


@tasks_bp.route("/<task_id>/merge-results", methods=["POST"])
@require_local_auth
@require_permission("task:execute")
def merge_results(task_id: str):
    body = request.get_json(force=True, silent=True) or {}
    input_params = body.get("input_params", {})

    project = find_project_by_task_id(task_id)
    if not project:
        return jsonify({"error": "Task not found"}), 404

    job_id = create_job_record(task_id, "MERGE_RESULTS", input_params)

    def _run():
        try:
            update_job_status(job_id, "IN_PROGRESS")
            result = run_write_back_to_dom(task_id, input_params or project.get("input_params", {}))
            update_job_status(job_id, "COMPLETED", results=result)
            update_project_fields(project["project_id"], {"status": "COMPLETED"})
            callback_task_status(task_id, "COMPLETED", results=result)
        except Exception as e:
            update_job_status(job_id, "FAILED", error=str(e))
            callback_task_status(task_id, "FAILED")

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"job_id": job_id, "status": "STARTED"})
