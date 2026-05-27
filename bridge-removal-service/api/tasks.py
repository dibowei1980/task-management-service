import json
import logging
import os
import re
import base64
import shutil
import threading
import traceback
import urllib.parse
import uuid
from datetime import datetime

from flask import Blueprint, current_app, request

from api.auth import require_local_auth, require_auth, require_permission
from api.utils import api_ok, api_accepted, api_error
from api.schemas import validate_body, get_validated_body, WorkflowStatusBody, TaskExecuteBody, PreprocessGenerateBody, MaskGenerateBody, MaskSaveBody, InpaintStartBody, InpaintResultBody, MergeResultsBody, ProjectUpdateBody, LocalEditStartBody, LocalEditApplyBody
from services.project_service import (
    get_project, project_to_task_response, find_project_by_task_id,
    update_project_fields,
)
from services.job_service import create_job_record, update_job_status, find_latest_job_by_task, find_jobs_by_project
from services.callback_service import callback_task_status
from services.status_mapping import to_platform_status

from bridge_removal_task import (
    BridgeRemovalOrchestratorTask,
    BridgeRemovalUnitProcessorTask,
    run_inpaint_fill,
    run_write_back_to_dom,
    _get_intermediate_root,
)

tasks_bp = Blueprint("tasks", __name__, url_prefix="/api/v1/tasks")

logger = logging.getLogger(__name__)

_ALLOWED_ROOTS_ENV = os.getenv("BRS_ALLOWED_ROOTS", "")
_ALLOWED_ROOTS: list = []
if _ALLOWED_ROOTS_ENV:
    _ALLOWED_ROOTS = [os.path.realpath(p) for p in _ALLOWED_ROOTS_ENV.split(";") if p.strip()]


def _is_path_allowed(requested_path: str) -> bool:
    if not requested_path:
        return False
    real = os.path.realpath(requested_path)
    allowed_dirs = list(_ALLOWED_ROOTS)
    allowed_dirs.append(os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "intermediate")))
    allowed_dirs.append(os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")))
    intermediate_root = os.getenv("INTERMEDIATE_ROOT", "")
    if intermediate_root:
        allowed_dirs.append(os.path.realpath(intermediate_root))
    for allowed in allowed_dirs:
        if real.startswith(allowed + os.sep) or real == allowed:
            return True
    return False


def _resolve_intermediate_path(project: dict, input_params: dict) -> str:
    task_id = project.get("project_id") or project.get("id") or ""
    intermediate_path = input_params.get("intermediate_path")
    if intermediate_path:
        return intermediate_path
    intermediate_root = input_params.get("intermediate_root")
    if not intermediate_root:
        parent_task_id = project.get("parent_task_id")
        if parent_task_id:
            parent_project = get_project(parent_task_id)
            if parent_project:
                parent_ip = parent_project.get("input_params") or {}
                if isinstance(parent_ip, str):
                    try:
                        parent_ip = json.loads(parent_ip)
                    except (json.JSONDecodeError, TypeError):
                        parent_ip = {}
                intermediate_root = parent_ip.get("intermediate_root")
    default_root = intermediate_root or os.getenv("BRS_INTERMEDIATE_ROOT", "./intermediate")
    parent_task_id = project.get("parent_task_id") or ""
    project_dir = str(parent_task_id) if parent_task_id else ""
    bridge_id = input_params.get("bridge_id") or ""
    try:
        from bridge_removal.vector_reader import sanitize_id
        safe_bridge_id = sanitize_id(bridge_id) if sanitize_id else str(bridge_id).strip()
    except ImportError:
        safe_bridge_id = str(bridge_id).strip()
    if not safe_bridge_id:
        safe_bridge_id = str(task_id)
    return os.path.normpath(os.path.join(str(default_root), project_dir, str(task_id), safe_bridge_id))


def _read_segment_json(json_path: str) -> dict | None:
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _run_sam2_pipeline(segment_json_path: str, masks_dir: str, task_id: str, enable_shadow: bool = False, sam2_dilate_iterations: int = 2, polygon_dilate_iterations: int = 2, light_expand_pixels: int = 1) -> dict:
    from bridge_removal.mask_pipeline import run_mask_generation, generate_bridge_masks_from_json
    payload = {
        "segment_json_path": segment_json_path,
        "task_id": task_id,
    }
    payload_text = json.dumps(payload, ensure_ascii=False)
    try:
        result = run_mask_generation(task_id, payload_text, sam2_dilate_iterations=sam2_dilate_iterations, light_expand_pixels=light_expand_pixels)
    except Exception as e:
        logger.warning("SAM2 pipeline failed, falling back to polygon: %s", e)
        return generate_bridge_masks_from_json(segment_json_path, masks_dir, enable_shadow=enable_shadow, dilate_iterations=polygon_dilate_iterations)
    segments = []
    has_error = False
    if isinstance(result, dict):
        for item in result.get("items", []):
            if item.get("status") == "failed":
                has_error = True
                break
    if has_error:
        logger.warning("SAM2 pipeline returned errors, falling back to polygon")
        return generate_bridge_masks_from_json(segment_json_path, masks_dir, enable_shadow=enable_shadow, dilate_iterations=polygon_dilate_iterations)
    if isinstance(result, dict):
        for item in result.get("items", []):
            seg_entry = {
                "json_path": item.get("segment_json_path", segment_json_path),
                "pipeline": "sam2",
            }
            base_name = item.get("base_name", "")
            output_dir = item.get("output_dir", masks_dir)
            if base_name:
                seg_entry["mask_sam_path"] = os.path.join(output_dir, f"{base_name}_mask_sam.png")
                seg_entry["mask_cut_path"] = os.path.join(output_dir, f"{base_name}_mask_cut.png")
                seg_entry["shadow_mask_path"] = os.path.join(output_dir, f"{base_name}_shadow_mask.png")
                seg_entry["merged_mask_path"] = os.path.join(output_dir, f"{base_name}_mask_with_shadow.png")
                seg_entry["overlay_path"] = os.path.join(output_dir, f"{base_name}_overlay.png")
            if item.get("light_direction"):
                seg_entry["lightDirection"] = item["light_direction"]
            segments.append(seg_entry)
    if not segments:
        segments.append({"json_path": segment_json_path, "pipeline": "sam2", "error": "no_results"})
    return {"segments": segments, "segment_count": len(segments)}


def _resolve_task_dir(project: dict, input_params: dict) -> str:
    intermediate_path = input_params.get("intermediate_path")
    if intermediate_path:
        return os.path.normpath(intermediate_path)
    task_id = project.get("project_id") or project.get("id") or ""
    intermediate_root = input_params.get("intermediate_root")
    if not intermediate_root:
        parent_task_id = project.get("parent_task_id")
        if parent_task_id:
            parent_project = get_project(parent_task_id)
            if parent_project:
                parent_ip = parent_project.get("input_params") or {}
                if isinstance(parent_ip, str):
                    try:
                        parent_ip = json.loads(parent_ip)
                    except (json.JSONDecodeError, TypeError):
                        parent_ip = {}
                intermediate_root = parent_ip.get("intermediate_root")
    default_root = intermediate_root or _get_intermediate_root()
    parent_task_id = project.get("parent_task_id") or ""
    bridge_id = input_params.get("bridge_id") or ""
    safe_bridge_id = re.sub(r'[^\w\-.]', '_', str(bridge_id)) if bridge_id else "bridge"
    project_dir = str(parent_task_id) if parent_task_id else ""
    return os.path.normpath(os.path.join(str(default_root), project_dir, str(task_id), safe_bridge_id))


def _world_to_pixel(world_coords, bounds, width_px, height_px):
    if not bounds or width_px <= 0 or height_px <= 0:
        return None
    min_x, min_y, max_x, max_y = bounds
    scale_x = width_px / (max_x - min_x) if (max_x - min_x) > 0 else 1
    scale_y = height_px / (max_y - min_y) if (max_y - min_y) > 0 else 1
    px = (world_coords[0] - min_x) * scale_x
    py = (max_y - world_coords[1]) * scale_y
    return [px, py]


def _world_poly_to_pixel(geojson, bounds, width_px, height_px):
    if not geojson or not bounds:
        return None
    geom_type = geojson.get("type")
    coords = geojson.get("coordinates")
    if not coords:
        return None
    if geom_type == "LineString":
        result = []
        for pt in coords:
            ppx = _world_to_pixel(pt, bounds, width_px, height_px)
            if ppx:
                result.append(ppx)
        return result if len(result) >= 2 else None
    if geom_type == "Polygon":
        shell = coords[0] if coords else []
        result = []
        for pt in shell:
            ppx = _world_to_pixel(pt, bounds, width_px, height_px)
            if ppx:
                result.append(ppx)
        return result if len(result) >= 3 else None
    return None


def _bbox_overlaps_poly(bbox_geojson, poly_geojson):
    if not bbox_geojson or not poly_geojson:
        return False
    try:
        from shapely.geometry import shape
        a = shape(bbox_geojson)
        b = shape(poly_geojson)
        return a.intersects(b)
    except Exception:
        return False


@tasks_bp.route("/<task_id>", methods=["GET"])
@require_local_auth
def get_task(task_id: str):
    project = get_project(task_id)
    if not project:
        project = find_project_by_task_id(task_id)
    if not project:
        return api_error("not_found", "Task not found", 404)
    resp = project_to_task_response(project)
    current_user = getattr(request, 'current_user', None)
    allowed = True
    if current_user:
        user_perms = current_user.get("permissions", [])
        user_dept = current_user.get("department_id", "")
        created_dept = project.get("created_department_id", "")
        has_global = any(p in user_perms for p in ["project:update_global", "project:update"])
        has_dept = any(p in user_perms for p in ["project:update_department", "project:update"])
        if has_global:
            allowed = True
        elif has_dept:
            allowed = (user_dept == created_dept)
        else:
            allowed = any(p in user_perms for p in ["project:update_own", "project:update"])
    resp["allowed"] = allowed
    return api_ok(resp)


@tasks_bp.route("/<task_id>", methods=["PUT"])
@require_local_auth
@validate_body(ProjectUpdateBody)
def update_task(task_id: str):
    project = get_project(task_id)
    if not project:
        return api_error("not_found", "Task not found", 404)
    body = get_validated_body()
    updatable_fields = [
        "name", "task_name", "status", "priority", "assignee_id",
        "assignee_name", "project_leader_id", "department_id", "department_name",
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
    updated = update_project_fields(task_id, updates)
    return api_ok(project_to_task_response(updated))


@tasks_bp.route("/<task_id>/workflow-status", methods=["PATCH"])
@require_local_auth
@validate_body(WorkflowStatusBody)
def update_workflow_status(task_id: str):
    project = get_project(task_id)
    if not project:
        return api_error("not_found", "Task not found", 404)
    body = get_validated_body()
    workflow_status = body.get("workflow_status")

    input_params = project.get("input_params") or {}
    if isinstance(input_params, str):
        try:
            input_params = json.loads(input_params)
        except (json.JSONDecodeError, TypeError):
            input_params = {}
    if not isinstance(input_params, dict):
        input_params = {}

    is_local_unsynced = project.get("source") == "local" and not project.get("tms_synced")
    qa_blocked_transitions = {
        ("IN_PROGRESS", "PENDING_WRITEBACK"),
        ("IN_PROGRESS", "COMPLETED"),
        ("PENDING_WRITEBACK", "COMPLETED"),
    }
    current_ws = input_params.get("workflowStatus") or input_params.get("workflow_status", "")
    if is_local_unsynced and (current_ws, workflow_status) in qa_blocked_transitions:
        return api_error("qa_blocked", "Local unsynced project cannot pass quality check. Submit to TMS first.", 403)

    input_params["workflowStatus"] = workflow_status
    input_params["workflow_status"] = workflow_status

    comment_stage = body.get("comment_stage")
    comment_result = body.get("comment_result")
    comment_message = body.get("comment_message")
    intermediate_path = body.get("intermediate_path")
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

    return api_ok(project_to_task_response(project))


@tasks_bp.route("/<task_id>/dom-locate", methods=["GET"])
@require_local_auth
def dom_locate(task_id: str):
    project = find_project_by_task_id(task_id)
    if not project:
        return api_error("not_found", "Task not found", 404)

    input_params = project.get("input_params") or {}
    bridge_polygon = input_params.get("bridge_polygon") or input_params.get("bridge_polygon_geojson")
    bridge_centerline = input_params.get("bridge_centerline") or input_params.get("bridge_centerline_geojson")
    source_doms = input_params.get("source_doms") or []
    bridge_geometry_missing = input_params.get("bridge_geometry_missing", False)
    bridge_geometry_missing_reason = input_params.get("bridge_geometry_missing_reason")
    impact_scope = input_params.get("impact_scope")

    parent_task_id = project.get("parent_task_id") or input_params.get("project_id")
    dependency_count = 0
    successor_count = 0
    predecessor_polygons = []
    successor_polygons = []
    if parent_task_id:
        from services.project_service import get_subtasks_local
        siblings = get_subtasks_local(parent_task_id)
        for s in siblings:
            s_ip = s.get("inputParams") or {}
            s_poly = s_ip.get("bridge_polygon") or s_ip.get("bridge_polygon_geojson")
            s_impact = s_ip.get("impact_scope")
            s_id = s.get("id")
            if s_id == task_id:
                continue
            if s_poly and _bbox_overlaps_poly(impact_scope, s_poly):
                if s.get("status") not in ("COMPLETED",):
                    predecessor_polygons.append(s_poly)
                    dependency_count += 1
            if s_poly and _bbox_overlaps_poly(s_impact, bridge_polygon):
                if s.get("status") not in ("COMPLETED",):
                    successor_polygons.append(s_poly)
                    successor_count += 1

    doms = []
    for dom_path in source_doms:
        try:
            from services.shp_utils import dom_tile_info, get_image_size
            info = dom_tile_info(dom_path)
            bounds = info.get("bounds")
            tfw = info.get("tfw")
            width_px, height_px = get_image_size(dom_path)
            bridge_polygon_px = _world_poly_to_pixel(bridge_polygon, bounds, width_px, height_px) if bridge_polygon and bounds else None
            impact_polygon_px = _world_poly_to_pixel(impact_scope, bounds, width_px, height_px) if impact_scope and bounds else None
            predecessor_polygons_px = [_world_poly_to_pixel(p, bounds, width_px, height_px) for p in predecessor_polygons] if bounds else []
            successor_polygons_px = [_world_poly_to_pixel(p, bounds, width_px, height_px) for p in successor_polygons] if bounds else []
            centerline_px = _world_poly_to_pixel(bridge_centerline, bounds, width_px, height_px) if bridge_centerline and bounds else None
            doms.append({
                "path": dom_path,
                "file_url": f"/api/v1/tasks/{task_id}/dom-file?path={dom_path}",
                "width": width_px,
                "height": height_px,
                "tfw": tfw,
                "bridge_polygon_px": bridge_polygon_px,
                "centerline_px": centerline_px,
                "impact_polygon_px": impact_polygon_px,
                "predecessor_bridge_polygons_px": predecessor_polygons_px,
                "successor_bridge_polygons_px": successor_polygons_px,
                "bridge_geometry_missing": bridge_geometry_missing,
                "bridge_geometry_missing_reason": bridge_geometry_missing_reason,
            })
        except Exception:
            doms.append({
                "path": dom_path,
                "file_url": f"/api/v1/tasks/{task_id}/dom-file?path={dom_path}",
                "width": 0,
                "height": 0,
                "tfw": None,
                "bridge_polygon_px": None,
                "centerline_px": None,
                "impact_polygon_px": None,
                "predecessor_bridge_polygons_px": [],
                "successor_bridge_polygons_px": [],
                "bridge_geometry_missing": bridge_geometry_missing,
                "bridge_geometry_missing_reason": bridge_geometry_missing_reason,
            })

    return api_ok({
        "task_id": task_id,
        "dom_count": len(doms),
        "dependency_count": dependency_count,
        "successor_count": successor_count,
        "doms": doms,
    })


@tasks_bp.route("/<task_id>/dom-file", methods=["GET"])
@require_local_auth
def dom_file(task_id: str):
    from flask import send_file
    project = find_project_by_task_id(task_id)
    if not project:
        return api_error("not_found", "Task not found", 404)

    input_params = project.get("input_params") or {}
    dom_path = request.args.get("path")
    if not dom_path:
        source_doms = input_params.get("source_doms") or []
        if source_doms:
            dom_path = source_doms[0]
    if not dom_path or not os.path.exists(dom_path):
        return api_error("not_found", "DOM file not found", 404)

    if not _is_path_allowed(dom_path):
        logger.warning("dom_file 路径遍历拦截: task_id=%s, path=%s", task_id, dom_path)
        return api_error("access_denied", "Access denied: path outside allowed directories", 403)

    return send_file(dom_path, mimetype="image/tiff")


@tasks_bp.route("/<task_id>/preprocess-segments", methods=["GET"])
@require_local_auth
def preprocess_segments(task_id: str):
    project = find_project_by_task_id(task_id)
    if not project:
        return api_error("not_found", "Task not found", 404)

    input_params = project.get("input_params") or {}
    task_dir = _resolve_task_dir(project, input_params)
    segments_dir = os.path.join(task_dir, "segments")

    output_results = project.get("output_results") or {}
    manifest = output_results.get("preprocess_manifest") if isinstance(output_results, dict) else None
    manifest_present = isinstance(manifest, dict)
    manifest_source = "output_results" if manifest_present else None
    manifest_error = None
    manifest_steps = None
    if manifest_present:
        manifest_error = manifest.get("error")
        manifest_steps = manifest.get("steps")

    segments = []

    inpaint_job_map: dict[str, str] = {}
    for j in find_jobs_by_project(project.get("project_id") or project.get("id") or ""):
        if j.get("task_type") != "INPAINT_START":
            continue
        job_results = j.get("results") or {}
        job_artifacts = job_results.get("artifacts") if isinstance(job_results, dict) else {}
        seg_json = job_artifacts.get("segment_json_path", "") if isinstance(job_artifacts, dict) else ""
        if seg_json:
            seg_file_name = seg_json.replace("\\", "/").rsplit("/", 1)[-1] if "/" in seg_json.replace("\\", "/") else seg_json
            seg_name = os.path.splitext(seg_file_name)[0]
            inpaint_job_map[seg_name] = j.get("job_id", "")

    if os.path.exists(segments_dir):
        json_files = sorted(f for f in os.listdir(segments_dir) if f.endswith(".json"))
        for jf in json_files:
            json_path = os.path.join(segments_dir, jf)
            try:
                with open(json_path, "r", encoding="utf-8") as f:
                    seg_data = json.load(f)
            except (json.JSONDecodeError, OSError):
                continue

            img_info = seg_data.get("image_info") or {}
            geometry = seg_data.get("geometry") or {}
            props = seg_data.get("properties") or {}

            img_filename = img_info.get("filename") or jf.replace(".json", ".png")
            img_path = os.path.join(segments_dir, img_filename)
            if not os.path.exists(img_path):
                for ext in (".png", ".tif", ".tiff"):
                    candidate = os.path.join(segments_dir, jf.replace(".json", ext))
                    if os.path.exists(candidate):
                        img_path = candidate
                        break

            pgw_path = os.path.join(segments_dir, jf.replace(".json", ".pgw"))
            tfw = None
            if os.path.exists(pgw_path):
                try:
                    with open(pgw_path, "r", encoding="utf-8") as f:
                        lines = f.read().strip().splitlines()
                    if len(lines) >= 6:
                        tfw = {
                            "a": float(lines[0].strip()),
                            "b": float(lines[1].strip()),
                            "c": float(lines[4].strip()),
                            "d": float(lines[2].strip()),
                            "e": float(lines[3].strip()),
                            "f": float(lines[5].strip()),
                        }
                except (ValueError, OSError):
                    pass

            file_url = f"/api/v1/tasks/{task_id}/preprocess-file?path={urllib.parse.quote(img_path, safe='')}"
            json_url = f"/api/v1/tasks/{task_id}/preprocess-file?path={urllib.parse.quote(json_path, safe='')}"

            bridge_polygon_geo = geometry.get("polygon")
            centerline_geo = geometry.get("centerline")
            center_point_geo = geometry.get("center_point")
            bounds_geo = geometry.get("bounds_geo")

            bridge_polygon_px = None
            centerline_px = None
            center_point_px = None

            if tfw:
                a_val = tfw.get("a", 0)
                b_val = tfw.get("b", 0)
                c_val = tfw.get("c", 0)
                d_val = tfw.get("d", 0)
                e_val = tfw.get("e", 0)
                f_val = tfw.get("f", 0)
                det = a_val * e_val - b_val * d_val

                def _world_to_px(wx, wy):
                    if not det or abs(det) < 1e-12:
                        return None
                    dx = wx - c_val
                    dy = wy - f_val
                    col = (e_val * dx - b_val * dy) / det
                    row = (-d_val * dx + a_val * dy) / det
                    return [col, row]

                def _geojson_coords_to_px(geojson):
                    if not geojson or not isinstance(geojson, dict):
                        return None
                    geo_type = geojson.get("type")
                    coords = geojson.get("coordinates")
                    if not coords:
                        return None
                    if geo_type == "Polygon":
                        result = []
                        for ring in coords:
                            px_ring = []
                            for pt in ring:
                                px = _world_to_px(pt[0], pt[1])
                                if px:
                                    px_ring.append(px)
                            if px_ring:
                                result.append(px_ring)
                        return result[0] if len(result) == 1 else result
                    elif geo_type == "LineString":
                        result = []
                        for pt in coords:
                            px = _world_to_px(pt[0], pt[1])
                            if px:
                                result.append(px)
                        return result
                    elif geo_type == "Point":
                        px = _world_to_px(coords[0], coords[1])
                        return px
                    return None

                bridge_polygon_px = _geojson_coords_to_px(bridge_polygon_geo)
                centerline_px = _geojson_coords_to_px(centerline_geo)
                center_point_px = _geojson_coords_to_px(center_point_geo)

            seg_item = {
                "path": img_path,
                "imagePath": img_path,
                "jsonPath": json_path,
                "fileUrl": file_url,
                "jsonUrl": json_url,
                "width": img_info.get("width", 256),
                "height": img_info.get("height", 256),
                "tfw": tfw,
                "worldFilePath": pgw_path if os.path.exists(pgw_path) else "",
                "bridgePolygonPx": bridge_polygon_px,
                "centerlinePx": centerline_px,
                "centerPointPx": center_point_px,
                "boundsGeo": bounds_geo,
                "bridgeGeometryMissing": props.get("bridge_geometry_missing", False),
                "bridgeGeometryMissingReason": props.get("bridge_geometry_missing_reason"),
                "bridgeId": props.get("bridge_id", ""),
                "segmentId": props.get("segment_id", 1),
                "kind": "segment",
            }

            mask_filename = jf.replace(".json", "_mask.png")
            mask_path = os.path.join(segments_dir, mask_filename)
            if not os.path.exists(mask_path):
                mask_filename = img_filename.replace(".png", "_mask.png").replace(".tif", "_mask.png").replace(".tiff", "_mask.png")
                mask_path = os.path.join(segments_dir, mask_filename)

            seg_base_name = os.path.splitext(jf)[0]
            masks_dir = os.path.join(task_dir, "masks", seg_base_name)

            confirmed_path = ""
            for ext in (".tif", ".png", ".tiff", ".jpg"):
                candidate = os.path.join(masks_dir, f"{seg_base_name}_inpainted_patch{ext}")
                if os.path.isfile(candidate):
                    confirmed_path = candidate
                    break

            batch_dir = os.path.join(masks_dir, f"{seg_base_name}_batch")
            batch_paths = []
            if os.path.isdir(batch_dir):
                for bf in sorted(os.listdir(batch_dir)):
                    if bf.lower().endswith((".png", ".tif", ".tiff", ".jpg")):
                        batch_paths.append(os.path.join(batch_dir, bf))

            if confirmed_path:
                seg_item["resultPath"] = confirmed_path
                seg_item["resultFileUrl"] = f"/api/v1/tasks/{task_id}/preprocess-file?path={urllib.parse.quote(confirmed_path, safe='')}"
                seg_item["inpaintStatus"] = "confirmed"
                seg_item["resultReadable"] = True
                seg_item["resultConfirmed"] = True

            if batch_paths:
                seg_item["batchPaths"] = batch_paths
                seg_item["batchFileUrl"] = f"/api/v1/tasks/{task_id}/preprocess-file?path={urllib.parse.quote(batch_paths[0], safe='')}"
                if not confirmed_path:
                    seg_item["inpaintStatus"] = "completed"
                    seg_item["resultReadable"] = True
                seg_item["hasUnconfirmedBatch"] = True

            if not confirmed_path and not batch_paths and os.path.exists(mask_path):
                seg_item["resultPath"] = mask_path
                seg_item["resultFileUrl"] = f"/api/v1/tasks/{task_id}/preprocess-file?path={urllib.parse.quote(mask_path, safe='')}"
                seg_item["resultReadable"] = True

            if seg_base_name in inpaint_job_map:
                seg_item["inpaintJobId"] = inpaint_job_map[seg_base_name]

            ld_json_path = os.path.join(masks_dir, f"{seg_base_name}_light_direction.json")
            if os.path.isfile(ld_json_path):
                try:
                    with open(ld_json_path, "r", encoding="utf-8") as ld_f:
                        ld_data = json.load(ld_f)
                    if ld_data.get("light_direction"):
                        seg_item["lightDirection"] = ld_data["light_direction"]
                except Exception:
                    pass

            segments.append(seg_item)

    all_segment_results_ready = all(s.get("resultFileUrl") for s in segments) if segments else False

    merged_result_dir = task_dir
    if os.path.isdir(merged_result_dir):
        for mf in sorted(os.listdir(merged_result_dir)):
            if "_merged." in mf and mf.lower().endswith((".png", ".tif", ".tiff", ".jpg")):
                merged_path = os.path.join(merged_result_dir, mf)
                if os.path.isfile(merged_path):
                    merged_world_file = ""
                    merged_base = os.path.splitext(merged_path)[0]
                    for wf_ext in (".pgw", ".tfw", ".jgw"):
                        wf_candidate = merged_base + wf_ext
                        if os.path.isfile(wf_candidate):
                            merged_world_file = wf_candidate
                            break
                    merged_tfw = None
                    if merged_world_file and os.path.isfile(merged_world_file):
                        try:
                            with open(merged_world_file, "r", encoding="utf-8") as wf_r:
                                wf_lines = wf_r.read().strip().splitlines()
                            if len(wf_lines) >= 6:
                                merged_tfw = {
                                    "a": float(wf_lines[0].strip()),
                                    "d": float(wf_lines[1].strip()),
                                    "b": float(wf_lines[2].strip()),
                                    "e": float(wf_lines[3].strip()),
                                    "c": float(wf_lines[4].strip()),
                                    "f": float(wf_lines[5].strip()),
                                }
                        except Exception as wf_err:
                            logger.warning("Failed to parse world file for merged result %s: %s", mf, wf_err)
                    merged_width = 512
                    merged_height = 512
                    try:
                        from services.shp_utils import get_image_size
                        w, h = get_image_size(merged_path)
                        if w and h:
                            merged_width = w
                            merged_height = h
                    except Exception:
                        pass
                    segments.append({
                        "path": merged_path,
                        "imagePath": merged_path,
                        "worldFilePath": merged_world_file,
                        "fileUrl": f"/api/v1/tasks/{task_id}/preprocess-file?path={urllib.parse.quote(merged_path, safe='')}",
                        "width": merged_width,
                        "height": merged_height,
                        "tfw": merged_tfw,
                        "resultPath": merged_path,
                        "resultFileUrl": f"/api/v1/tasks/{task_id}/preprocess-file?path={urllib.parse.quote(merged_path, safe='')}",
                        "resultReadable": True,
                        "resultConfirmed": True,
                        "segmentId": mf,
                        "kind": "merged_result",
                        "inpaintStatus": "confirmed",
                    })

    return api_ok({
        "task_id": task_id,
        "segments": segments,
        "intermediate_path": task_dir,
        "manifest_present": manifest_present,
        "manifest_source": manifest_source,
        "manifest_error": manifest_error,
        "manifest_steps": manifest_steps,
        "segment_count": len(segments),
        "all_segment_results_ready": all_segment_results_ready,
    })


@tasks_bp.route("/<task_id>/preprocess-file", methods=["GET"])
@require_local_auth
def preprocess_file(task_id: str):
    from flask import send_file
    project = find_project_by_task_id(task_id)
    if not project:
        return api_error("not_found", "Task not found", 404)

    file_path = request.args.get("path")
    if not file_path or not os.path.exists(file_path):
        return api_error("not_found", "File not found", 404)

    if not _is_path_allowed(file_path):
        logger.warning("preprocess_file 路径遍历拦截: task_id=%s, path=%s", task_id, file_path)
        return api_error("access_denied", "Access denied: path outside allowed directories", 403)

    return send_file(file_path)


@tasks_bp.route("/<task_id>/preprocess-generate", methods=["POST"])
@require_local_auth
@require_permission("task:execute")
@validate_body(PreprocessGenerateBody)
def api_preprocess_generate(task_id: str):
    body = get_validated_body()
    input_params = body.get("input_params") or {}
    overwrite = body.get("overwrite", False)
    max_side_px = body.get("max_side_px", 1024)

    if not input_params:
        existing = get_project(task_id)
        if existing:
            db_params = existing.get("input_params") or {}
            if isinstance(db_params, str):
                try:
                    db_params = json.loads(db_params)
                except (json.JSONDecodeError, TypeError):
                    db_params = {}
            input_params = db_params

    job_id = create_job_record(task_id, "PREPROCESS_GENERATE", input_params)

    app = current_app._get_current_object()

    def _run():
        with app.app_context():
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
    return api_accepted({"job_id": job_id, "status": "STARTED"})


@tasks_bp.route("/<task_id>/execute", methods=["POST"])
@require_auth
@require_permission("task:execute")
@validate_body(TaskExecuteBody)
def execute_task(task_id: str):
    body = get_validated_body()
    existing = get_project(task_id)
    if not existing:
        return api_error("not_found", f"Task {task_id} not found", 404)

    task_type = body.get("task_type") or existing.get("task_type", "")
    input_params = body.get("input_params") or existing.get("input_params", {})

    if task_type not in ("BRIDGE_REMOVAL_BATCH", "BRIDGE_REMOVAL_UNIT"):
        return api_error("invalid_task_type", f"Unsupported task type: {task_type}", 400)

    job_id = create_job_record(task_id, task_type, input_params)
    update_project_fields(task_id, {"job_id": job_id, "status": "IN_PROGRESS"})

    app = current_app._get_current_object()

    def _run():
        with app.app_context():
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
                task_status = task.get_status()
                update_job_status(job_id, task_status, results=results)
                if task_status == "COMPLETED":
                    update_project_fields(task_id, {"status": task_status, "progress": 100})
                else:
                    update_project_fields(task_id, {"status": task_status})

                parent_task_id = existing.get("parent_task_id")
                if parent_task_id and task_type == "BRIDGE_REMOVAL_BATCH":
                    parent_project = get_project(parent_task_id)
                    if parent_project and parent_project.get("category") == "PROJECT":
                        if task_status == "COMPLETED":
                            update_project_fields(parent_task_id, {"status": "IN_PROGRESS", "progress": 0})
                        elif task_status == "FAILED":
                            update_project_fields(parent_task_id, {"status": "FAILED"})
            except Exception as e:
                error_msg = str(e)
                traceback_str = traceback.format_exc()
                update_job_status(job_id, "FAILED", error=f"{error_msg}\n{traceback_str}")
                update_project_fields(task_id, {"status": "FAILED"})

    threading.Thread(target=_run, daemon=True).start()
    return api_accepted({"job_id": job_id, "status": "STARTED"})


@tasks_bp.route("/<task_id>/mask-generate", methods=["POST"])
@require_local_auth
@require_permission("task:execute")
@validate_body(MaskGenerateBody)
def mask_generate(task_id: str):
    body = get_validated_body()
    input_params = body.get("input_params", {})
    segment_name = body.get("segment_name", "")
    segment_json_path = body.get("segment_json_path", "")
    batch = body.get("batch") or []

    project = find_project_by_task_id(task_id)
    if not project:
        return api_error("not_found", "Task not found", 404)

    try:
        db_input_params = project.get("input_params") or {}
        if isinstance(db_input_params, str):
            try:
                db_input_params = json.loads(db_input_params)
            except (json.JSONDecodeError, TypeError):
                db_input_params = {}
        merged_params = {**db_input_params, **input_params}
        task_dir = _resolve_task_dir(project, merged_params)
        masks_dir = os.path.join(task_dir, "masks")
        if not os.path.isdir(masks_dir):
            os.makedirs(masks_dir, exist_ok=True)

        from bridge_removal.mask_pipeline import generate_bridge_masks_from_json, generate_bridge_masks, is_big_bridge, _sam2_available

        sam2_ok = _sam2_available()
        if not sam2_ok:
            logger.info("SAM2 not available, all segments will use polygon pipeline")

        enable_shadow = bool(merged_params.get("enable_shadow", False))
        polygon_dilate_iterations = int(merged_params.get("polygon_dilate_iterations", 2))
        sam2_dilate_iterations = int(merged_params.get("sam2_dilate_iterations", 2))
        light_expand_pixels = int(merged_params.get("sam2_light_expand_pixels", 1))

        all_segments = []
        errors = []

        if batch:
            for item in batch:
                item_path = item.get("segment_json_path", "")
                if not item_path or not os.path.isfile(item_path):
                    errors.append({"segment_json_path": item_path, "error": "file_not_found"})
                    continue
                seg_data = _read_segment_json(item_path)
                big = is_big_bridge(seg_data) if seg_data else False
                use_sam2 = sam2_ok and big
                if use_sam2:
                    result = _run_sam2_pipeline(item_path, masks_dir, task_id, enable_shadow=enable_shadow, sam2_dilate_iterations=sam2_dilate_iterations, polygon_dilate_iterations=polygon_dilate_iterations, light_expand_pixels=light_expand_pixels)
                else:
                    result = generate_bridge_masks_from_json(item_path, masks_dir, enable_shadow=enable_shadow, dilate_iterations=polygon_dilate_iterations)
                    for seg in result.get("segments", []):
                        if big and not sam2_ok:
                            seg["pipeline"] = "polygon_sam2_unavailable"
                        else:
                            seg["pipeline"] = "polygon"
                if result.get("error"):
                    errors.append({"segment_json_path": item_path, "error": result["error"]})
                else:
                    valid_segs = []
                    for seg in result.get("segments", []):
                        missing = []
                        for key in ("mask_sam_path", "mask_cut_path", "merged_mask_path", "overlay_path"):
                            p = seg.get(key, "")
                            if p and not os.path.isfile(p):
                                missing.append(key)
                        if missing:
                            seg["write_errors"] = missing
                        valid_segs.append(seg)
                    all_segments.extend(valid_segs)
        elif segment_json_path and os.path.isfile(segment_json_path):
            seg_data = _read_segment_json(segment_json_path)
            big = is_big_bridge(seg_data) if seg_data else False
            use_sam2 = sam2_ok and big
            if use_sam2:
                result = _run_sam2_pipeline(segment_json_path, masks_dir, task_id, enable_shadow=enable_shadow, sam2_dilate_iterations=sam2_dilate_iterations, polygon_dilate_iterations=polygon_dilate_iterations, light_expand_pixels=light_expand_pixels)
            else:
                result = generate_bridge_masks_from_json(segment_json_path, masks_dir, enable_shadow=enable_shadow, dilate_iterations=polygon_dilate_iterations)
                for seg in result.get("segments", []):
                    if big and not sam2_ok:
                        seg["pipeline"] = "polygon_sam2_unavailable"
                    else:
                        seg["pipeline"] = "polygon"
            if result.get("error"):
                return api_ok({"mask_manifest": {"error": result["error"]}})
            all_segments = result.get("segments", [])
        else:
            segments_dir = os.path.join(task_dir, "segments")
            if os.path.isdir(segments_dir):
                result = generate_bridge_masks(segments_dir, masks_dir, enable_shadow=enable_shadow, dilate_iterations=polygon_dilate_iterations)
                if result.get("error"):
                    return api_ok({"mask_manifest": {"error": result["error"]}})
                all_segments = result.get("segments", [])
            else:
                return api_error("segments_not_found", "No segments directory or segment_json_path provided", 400)

        pipeline_modes = []
        for seg in all_segments:
            p = seg.get("pipeline", "")
            if p and p not in pipeline_modes:
                pipeline_modes.append(p)
        pipeline_label = "/".join(pipeline_modes) if pipeline_modes else "polygon"

        manifest = {
            "artifacts": {
                "segment_count": len(all_segments),
                "pipeline_mode": pipeline_label,
            },
            "segments": all_segments,
        }
        if errors:
            manifest["errors"] = errors

        return api_ok({"mask_manifest": manifest})
    except Exception as e:
        logger.exception("mask_generate failed: %s", e)
        return api_error("mask_generate_failed", str(e), 500)


@tasks_bp.route("/<task_id>/mask-save", methods=["POST"])
@require_local_auth
@require_permission("task:execute")
@validate_body(MaskSaveBody)
def mask_save(task_id: str):
    body = get_validated_body()
    segment_json_path = body.get("segment_json_path", "")
    mask_png_base64 = body.get("mask_png_base64", "")
    mask_cut_png_base64 = body.get("mask_cut_png_base64", "")

    project = find_project_by_task_id(task_id)
    if not project:
        return api_error("not_found", "Task not found", 404)

    if not segment_json_path:
        return api_error("validation_error", "segment_json_path is required", 400)

    normalized = segment_json_path.replace("\\", "/")
    last_slash = normalized.rfind("/")
    if last_slash < 0:
        return api_error("validation_error", "Invalid segment_json_path format", 400)

    seg_dir = normalized[:last_slash]
    mask_dir = re.sub(r"/segments$", "/masks", seg_dir, flags=re.IGNORECASE)
    base_name = os.path.splitext(os.path.basename(normalized))[0]
    seg_mask_dir = os.path.join(mask_dir, base_name)
    os.makedirs(seg_mask_dir, exist_ok=True)

    mask_path = os.path.join(seg_mask_dir, f"{base_name}_mask_with_shadow.png")
    mask_cut_path = os.path.join(seg_mask_dir, f"{base_name}_mask_cut_with_shadow.png")

    try:
        import base64 as b64mod

        img_bytes = b64mod.b64decode(mask_png_base64)
        with open(mask_path, "wb") as f:
            f.write(img_bytes)

        if mask_cut_png_base64:
            cut_bytes = b64mod.b64decode(mask_cut_png_base64)
            with open(mask_cut_path, "wb") as f:
                f.write(cut_bytes)

        result = {"task_id": task_id, "mask_path": mask_path, "saved": True}
        if mask_cut_png_base64:
            result["mask_cut_path"] = mask_cut_path
        return api_ok(result)
    except Exception as e:
        logger.exception("mask_save failed: %s", e)
        return api_error("mask_save_failed", "Failed to save mask", 500)


@tasks_bp.route("/<task_id>/inpaint-start", methods=["POST"])
@require_local_auth
@require_permission("task:execute")
@validate_body(InpaintStartBody)
def inpaint_start(task_id: str):
    body = get_validated_body()
    input_params = body.get("input_params") or {}
    inpaint_count = body.get("count", 1)

    project = find_project_by_task_id(task_id)
    if not project:
        return api_error("not_found", "Task not found", 404)

    db_input_params = project.get("input_params") or {}
    if isinstance(db_input_params, str):
        try:
            db_input_params = json.loads(db_input_params)
        except (json.JSONDecodeError, TypeError):
            db_input_params = {}
    merged_params = {**db_input_params, **input_params}

    segment_json_path = body.get("segment_json_path", "")
    image_path = body.get("image_path", "")
    removal_mask_path = body.get("removal_mask_path", "")
    crop_mask_path = body.get("crop_mask_path", "")
    previous_result_path = body.get("previous_result_path", "")
    previous_world_file_path = body.get("previous_world_file_path", "")
    current_world_file_path = body.get("current_world_file_path", "")

    if not image_path:
        image_path = merged_params.get("image_path", "")
    if not segment_json_path:
        segment_json_path = merged_params.get("segment_json_path", "")
    if not removal_mask_path:
        removal_mask_path = merged_params.get("removal_mask_path", "")
    if not crop_mask_path:
        crop_mask_path = merged_params.get("crop_mask_path", "")

    intermediate_path = _resolve_intermediate_path(project, merged_params)
    os.makedirs(intermediate_path, exist_ok=True)

    seg_base_name = ""
    if segment_json_path:
        normalized_seg = segment_json_path.replace("\\", "/")
        seg_file_name = normalized_seg.rsplit("/", 1)[-1] if "/" in normalized_seg else normalized_seg
        seg_base_name = os.path.splitext(seg_file_name)[0]

    if seg_base_name:
        seg_mask_dir = os.path.join(intermediate_path, "masks", seg_base_name)
        os.makedirs(seg_mask_dir, exist_ok=True)
    else:
        seg_mask_dir = intermediate_path

    api_key = merged_params.get("runninghub_api_key", "") or os.getenv("RUNNINGHUB_API_KEY", "")
    if not api_key:
        return api_error("config_error", "RunningHub API Key 未配置，请设置环境变量 RUNNINGHUB_API_KEY 或在 input_params 中配置 runninghub_api_key", 400)

    if not image_path or not os.path.isfile(image_path):
        return api_error("bad_request", f"原始影像路径无效: {image_path}", 400)
    if not removal_mask_path or not os.path.isfile(removal_mask_path):
        return api_error("bad_request", f"移除掩膜路径无效: {removal_mask_path}", 400)
    if not crop_mask_path or not os.path.isfile(crop_mask_path):
        return api_error("bad_request", f"裁剪掩膜路径无效: {crop_mask_path}", 400)

    seed = str(merged_params.get("seed", ""))
    blur_radius = str(body.get("blur_radius", merged_params.get("blur_radius", 2)))
    expand = str(body.get("expand", merged_params.get("expand", 3)))

    job_id = create_job_record(task_id, "INPAINT_START", input_params)

    from bridge_removal.inpaint_gen_Runninghub import run_webapp, TaskPollError, run_batch_with_pool, _aggregate_batch_results
    app = current_app._get_current_object()

    def _run():
        with app.app_context():
            overlap_temp_files = []
            effective_image_path = image_path
            effective_removal_mask_path = removal_mask_path
            effective_crop_mask_path = crop_mask_path
            try:
                update_job_status(job_id, "IN_PROGRESS")
                if previous_result_path and previous_world_file_path and current_world_file_path:
                    missing_files = []
                    if not os.path.isfile(previous_result_path):
                        missing_files.append(f"前段成果影像({previous_result_path})")
                    if not os.path.isfile(previous_world_file_path):
                        missing_files.append(f"前段world file({previous_world_file_path})")
                    if not os.path.isfile(current_world_file_path):
                        missing_files.append(f"当前段world file({current_world_file_path})")
                    if missing_files:
                        raise RuntimeError(f"前段成果叠加失败：文件不存在 - {', '.join(missing_files)}")
                    try:
                        from bridge_removal.overlap_fix import run as overlap_fix_run
                        overlap_payload = {
                            "previous_result_path": previous_result_path,
                            "previous_world_file_path": previous_world_file_path,
                            "current_image_path": image_path,
                            "current_world_file_path": current_world_file_path,
                            "mask1_path": removal_mask_path,
                            "mask2_path": crop_mask_path,
                        }
                        exit_code, overlap_result = overlap_fix_run(overlap_payload)
                        if exit_code == 0 and overlap_result.get("status") == "ok":
                            effective_image_path = overlap_result.get("temp_image_path", image_path)
                            effective_removal_mask_path = overlap_result.get("temp_mask1_path", removal_mask_path)
                            effective_crop_mask_path = overlap_result.get("temp_mask2_path", crop_mask_path)
                            overlap_temp_files = overlap_result.get("generated_temp_files", [])
                            logger.info("Overlap fix applied for segment %s: %d overlap pixels", seg_base_name, overlap_result.get("overlap_pixel_count", 0))
                        else:
                            raise RuntimeError(f"前段成果叠加失败：{overlap_result.get('code', 'UNKNOWN')} - {overlap_result.get('message', '未知原因')}")
                    except RuntimeError:
                        raise
                    except Exception as ofe:
                        raise RuntimeError(f"前段成果叠加失败：{ofe}") from ofe
                batch_dir = os.path.join(seg_mask_dir, f"{seg_base_name}_batch")
                if os.path.isdir(batch_dir):
                    import shutil
                    shutil.rmtree(batch_dir, ignore_errors=True)
                os.makedirs(batch_dir, exist_ok=True)
                args_list = []
                for i in range(1, inpaint_count + 1):
                    out_path = os.path.join(batch_dir, f"{i}.png")
                    params = {
                        "original_image": effective_image_path,
                        "removal_mask": effective_removal_mask_path,
                        "crop_mask": effective_crop_mask_path,
                    }
                    if seed:
                        params["seed"] = seed
                    params["blur_radius"] = blur_radius
                    params["expand"] = expand
                    args_list.append((api_key, "bridge_removal", params, out_path, job_id))
                results, errors = run_batch_with_pool(run_webapp, args_list)
                batch_id = job_id or str(uuid.uuid4())
                success, payload = _aggregate_batch_results(batch_id, results, errors)
                output_paths = [r for r in results if r]
                result = {
                    "step": {"name": "inpaint_fill", "status": "completed" if success else "partial"},
                    "artifacts": {
                        "output_paths": output_paths,
                        "segment_json_path": segment_json_path,
                        "image_path": image_path,
                        "removal_mask_path": removal_mask_path,
                        "crop_mask_path": crop_mask_path,
                    }
                }
                if not success:
                    update_job_status(job_id, "FAILED", error=str(payload.get("error_message", "BATCH_ALL_FAILED")), results=result)
                    return
                if errors and any(e is not None for e in errors):
                    result["step"]["status"] = "partial"
                update_job_status(job_id, "COMPLETED", results=result)
            except TaskPollError as e:
                error_result = {
                    "step": {"name": "inpaint_fill", "status": "failed"},
                    "error": e.reason,
                    "error_code": "CANCELLED" if e.status == "cancelled" else "TASK_FAILED",
                    "task_id": e.task_id or "",
                }
                update_job_status(job_id, "FAILED", error=str(e.reason), results=error_result)
            except Exception as e:
                logger.exception("Inpaint failed for task %s", task_id)
                update_job_status(job_id, "FAILED", error=str(e))
            finally:
                for tmp in overlap_temp_files:
                    try:
                        if os.path.exists(tmp):
                            os.remove(tmp)
                    except Exception:
                        pass

    threading.Thread(target=_run, daemon=True).start()
    return api_accepted({"job_id": job_id, "status": "STARTED"})


@tasks_bp.route("/<task_id>/inpaint-status", methods=["GET"])
@require_local_auth
def inpaint_status(task_id: str):
    job = find_latest_job_by_task(task_id, "INPAINT_START")
    if not job:
        return api_ok({"task_id": task_id, "status": "NOT_STARTED"})
    status = job["status"]
    results = job.get("results") or {}
    artifacts = results.get("artifacts") if isinstance(results, dict) else {}
    batch_output_paths = artifacts.get("output_paths", []) if isinstance(artifacts, dict) else []
    image_path = artifacts.get("image_path", "") if isinstance(artifacts, dict) else ""
    response = {
        "task_id": task_id,
        "job_id": job["job_id"],
        "status": status,
        "results": results,
        "outputPaths": batch_output_paths,
        "imagePath": image_path,
        "originalImagePath": image_path,
        "error": job.get("error"),
    }
    return api_ok(response)


@tasks_bp.route("/<task_id>/inpaint-cancel", methods=["POST"])
@require_local_auth
@require_permission("task:execute")
def inpaint_cancel(task_id: str):
    job = find_latest_job_by_task(task_id, "INPAINT_START")
    if not job or job["status"] != "IN_PROGRESS":
        return api_ok({"task_id": task_id, "status": "NO_ACTIVE_JOB"})
    job["status"] = "CANCELLED"

    project = find_project_by_task_id(task_id)
    api_key = ""
    if project:
        db_ip = project.get("input_params") or {}
        if isinstance(db_ip, str):
            try:
                db_ip = json.loads(db_ip)
            except (json.JSONDecodeError, TypeError):
                db_ip = {}
        api_key = db_ip.get("runninghub_api_key", "") or os.getenv("RUNNINGHUB_API_KEY", "")

    cancel_results = []
    if api_key:
        try:
            from bridge_removal.inpaint_gen_Runninghub import clear_pool_and_cancel_runninghub_tasks
            cancel_results = clear_pool_and_cancel_runninghub_tasks(api_key, job.get("job_id"))
        except Exception as e:
            logger.warning("Failed to cancel RunningHub tasks: %s", e)

    return api_ok({"task_id": task_id, "status": "CANCELLED", "cancel_results": cancel_results})


@tasks_bp.route("/<task_id>/inpaint-retry", methods=["POST"])
@require_local_auth
@require_permission("task:execute")
def inpaint_retry(task_id: str):
    return inpaint_start(task_id)


@tasks_bp.route("/<task_id>/inpaint-result", methods=["POST"])
@require_local_auth
@require_permission("task:execute")
def inpaint_result(task_id: str):
    job_id = request.args.get("jobId", "").strip()
    selected_index = int(request.args.get("index", "0"))

    project = find_project_by_task_id(task_id)
    if not project:
        return api_error("not_found", "Task not found", 404)

    job = None
    if job_id:
        from services.job_service import get_job
        job = get_job(job_id)
    if not job:
        job = find_latest_job_by_task(task_id, "INPAINT_START")

    output_paths = []
    if job:
        results = job.get("results") or {}
        artifacts = results.get("artifacts") if isinstance(results, dict) else {}
        output_paths = artifacts.get("output_paths", []) if isinstance(artifacts, dict) else []

    chosen_path = ""
    if output_paths and 0 <= selected_index < len(output_paths):
        chosen_path = output_paths[selected_index]

    if not chosen_path or not os.path.isfile(chosen_path):
        return api_error("not_found", "Inpaint result not found", 404)

    seg_base_name = ""
    segment_json_path = ""
    if job:
        results = job.get("results") or {}
        artifacts = results.get("artifacts") if isinstance(results, dict) else {}
        segment_json_path = artifacts.get("segment_json_path", "") if isinstance(artifacts, dict) else ""
        if segment_json_path:
            normalized_seg = segment_json_path.replace("\\", "/")
            seg_file_name = normalized_seg.rsplit("/", 1)[-1] if "/" in normalized_seg else normalized_seg
            seg_base_name = os.path.splitext(seg_file_name)[0]

    confirmed_path = ""
    if seg_base_name:
        input_params = project.get("input_params") or {}
        intermediate_path = _resolve_intermediate_path(project, input_params)
        seg_mask_dir = os.path.join(intermediate_path, "masks", seg_base_name)
        os.makedirs(seg_mask_dir, exist_ok=True)
        _, src_ext = os.path.splitext(chosen_path)
        if not src_ext:
            src_ext = ".png"
        confirmed_path = os.path.join(seg_mask_dir, f"{seg_base_name}_inpainted_patch{src_ext}")
        if chosen_path != confirmed_path:
            import shutil
            shutil.copy2(chosen_path, confirmed_path)

        segments_dir = os.path.join(intermediate_path, "segments")
        src_world_file = ""
        for wf_ext in (".pgw", ".tfw", ".jgw"):
            wf_candidate = os.path.join(segments_dir, seg_base_name + wf_ext)
            if os.path.isfile(wf_candidate):
                src_world_file = wf_candidate
                break
        if src_world_file and os.path.isfile(confirmed_path):
            try:
                import cv2 as _cv2
                src_img = _cv2.imread(confirmed_path, _cv2.IMREAD_UNCHANGED)
                result_h, result_w = src_img.shape[:2] if src_img is not None else (0, 0)
            except Exception:
                result_w, result_h = 0, 0
            try:
                with open(src_world_file, "r", encoding="utf-8") as wf:
                    wf_lines = wf.read().strip().splitlines()
                if len(wf_lines) >= 6:
                    a = float(wf_lines[0].strip())
                    d = float(wf_lines[1].strip())
                    b = float(wf_lines[2].strip())
                    e = float(wf_lines[3].strip())
                    c = float(wf_lines[4].strip())
                    f_val = float(wf_lines[5].strip())
                    if result_w > 0 and result_h > 0:
                        seg_img_path = ""
                        for ext in (".tif", ".png", ".tiff", ".jpg"):
                            candidate = os.path.join(segments_dir, seg_base_name + ext)
                            if os.path.isfile(candidate):
                                seg_img_path = candidate
                                break
                        if seg_img_path:
                            try:
                                orig_img = _cv2.imread(seg_img_path, _cv2.IMREAD_UNCHANGED)
                                orig_h, orig_w = orig_img.shape[:2] if orig_img is not None else (0, 0)
                            except Exception:
                                orig_w, orig_h = 0, 0
                            if orig_w > 0 and orig_h > 0 and (orig_w != result_w or orig_h != result_h):
                                scale_x = result_w / orig_w
                                scale_y = result_h / orig_h
                                a = a * scale_x
                                d = d * scale_x
                                b = b * scale_y
                                e = e * scale_y
                    dst_wf_ext = ".pgw" if src_ext.lower() in (".png",) else ".tfw"
                    dst_world_file = os.path.join(seg_mask_dir, f"{seg_base_name}_inpainted_patch{dst_wf_ext}")
                    with open(dst_world_file, "w", encoding="utf-8") as wf_out:
                        wf_out.write(f"{a:.12f}\n{d:.12f}\n{b:.12f}\n{e:.12f}\n{c:.12f}\n{f_val:.12f}\n")
            except Exception as wf_err:
                logger.warning("Failed to copy/adjust world file for %s: %s", seg_base_name, wf_err)

    return api_ok({
        "task_id": task_id,
        "selected_index": selected_index,
        "result_path": confirmed_path or chosen_path,
        "status": "succeeded",
    })


@tasks_bp.route("/<task_id>/inpaint-file", methods=["GET"])
@require_local_auth
def inpaint_file(task_id: str):
    from flask import send_file
    project = find_project_by_task_id(task_id)
    if not project:
        return api_error("not_found", "Task not found", 404)

    file_path = request.args.get("path", "").strip()
    if file_path and os.path.isfile(file_path):
        mime = "image/tiff" if file_path.lower().endswith((".tif", ".tiff")) else "image/png"
        return send_file(file_path, mimetype=mime)

    input_params = project.get("input_params") or {}
    intermediate_path = _resolve_intermediate_path(project, input_params)
    inpainted_path = ""
    for ext in (".tif", ".png", ".tiff", ".jpg"):
        candidate = os.path.join(intermediate_path, f"inpainted_patch{ext}")
        if os.path.isfile(candidate):
            inpainted_path = candidate
            break

    if not inpainted_path:
        return api_error("not_found", "Inpaint file not found", 404)

    mime = "image/tiff" if inpainted_path.lower().endswith((".tif", ".tiff")) else "image/png"
    return send_file(inpainted_path, mimetype=mime)


_LOCAL_EDIT_CROP_HALF = 256
_LOCAL_EDIT_WEBAPP_ID = "2058840264650874881"
_LOCAL_EDIT_WEBAPP_NAME = "bridge_local_edit"
_LOCAL_EDIT_MAX_SMUDGE = 480


def _ensure_local_edit_webapp():
    from bridge_removal.runninghub_config import get_webapp_config
    existing = get_webapp_config(_LOCAL_EDIT_WEBAPP_NAME)
    if not existing:
        logger.warning("bridge_local_edit webapp 配置未找到，请检查 runninghub_webapps.json")


@tasks_bp.route("/<task_id>/local-edit-start", methods=["POST"])
@require_local_auth
@require_permission("task:execute")
@validate_body(LocalEditStartBody)
def local_edit_start(task_id: str):
    import cv2
    import numpy as np
    body = get_validated_body()
    image_path = body.get("image_path", "")
    mask_data_b64 = body.get("mask_data", "")
    prompt = body.get("prompt", "")
    num_candidates = body.get("num_candidates", 1)
    crop_bounds_str = body.get("crop_bounds", "")
    input_params = body.get("input_params") or {}

    project = find_project_by_task_id(task_id)
    if not project:
        return api_error("not_found", "Task not found", 404)

    db_input_params = project.get("input_params") or {}
    if isinstance(db_input_params, str):
        try:
            db_input_params = json.loads(db_input_params)
        except (json.JSONDecodeError, TypeError):
            db_input_params = {}
    merged_params = {**db_input_params, **input_params}

    if not image_path or not os.path.isfile(image_path):
        return api_error("bad_request", f"原始影像路径无效: {image_path}", 400)

    if not mask_data_b64:
        return api_error("bad_request", "掩膜数据不能为空", 400)

    crop_bounds = None
    if crop_bounds_str:
        try:
            parts = [int(v) for v in crop_bounds_str.split(",")]
            if len(parts) == 4 and all(v >= 0 for v in parts):
                crop_bounds = tuple(parts)
        except (ValueError, TypeError):
            pass
    if not crop_bounds or len(crop_bounds) != 4:
        return api_error("bad_request", "裁剪范围格式错误，需要 x,y,w,h", 400)

    crop_x, crop_y, crop_w, crop_h = crop_bounds
    if crop_w > _LOCAL_EDIT_MAX_SMUDGE or crop_h > _LOCAL_EDIT_MAX_SMUDGE:
        return api_error("bad_request", f"涂抹范围超过{_LOCAL_EDIT_MAX_SMUDGE}像素限制", 400)

    intermediate_path = _resolve_intermediate_path(project, merged_params)
    local_edit_dir = os.path.join(intermediate_path, "local_edit")
    os.makedirs(local_edit_dir, exist_ok=True)

    try:
        mask_bytes = base64.b64decode(mask_data_b64)
        mask_arr = np.frombuffer(mask_bytes, dtype=np.uint8)
        mask_img = cv2.imdecode(mask_arr, cv2.IMREAD_UNCHANGED)
    except Exception:
        return api_error("bad_request", "掩膜数据解码失败", 400)
    if mask_img is None:
        return api_error("bad_request", "掩膜数据解码为空", 400)

    if mask_img.ndim == 3:
        mask_img = cv2.cvtColor(mask_img, cv2.COLOR_BGR2GRAY) if mask_img.shape[2] == 3 else cv2.cvtColor(mask_img, cv2.COLOR_BGRA2GRAY)
    _, mask_binary = cv2.threshold(mask_img, 127, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(mask_binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return api_error("bad_request", "掩膜中没有检测到涂抹区域", 400)
    all_pts = np.vstack(contours)
    smudge_x, smudge_y, smudge_w, smudge_h = cv2.boundingRect(all_pts)
    if smudge_w > _LOCAL_EDIT_MAX_SMUDGE or smudge_h > _LOCAL_EDIT_MAX_SMUDGE:
        return api_error("bad_request", f"涂抹范围({smudge_w}x{smudge_h})超过{_LOCAL_EDIT_MAX_SMUDGE}像素限制", 400)

    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        return api_error("bad_request", f"无法读取原始影像: {image_path}", 400)
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    elif img.shape[2] == 4:
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)

    center_x = smudge_x + smudge_w // 2
    center_y = smudge_y + smudge_h // 2
    cx = max(0, center_x - _LOCAL_EDIT_CROP_HALF)
    cy = max(0, center_y - _LOCAL_EDIT_CROP_HALF)
    cx2 = min(img.shape[1], center_x + _LOCAL_EDIT_CROP_HALF)
    cy2 = min(img.shape[0], center_y + _LOCAL_EDIT_CROP_HALF)
    cw = cx2 - cx
    ch = cy2 - cy

    cropped_img = img[cy:cy2, cx:cx2]
    cropped_mask = mask_binary[cy:cy2, cx:cx2]

    effective_crop_bounds = (cx, cy, cw, ch, 1.0)

    temp_crop_path = os.path.join(local_edit_dir, "crop_image.png")
    temp_mask_path = os.path.join(local_edit_dir, "crop_mask.png")
    from bridge_removal.image_utils import safe_imwrite
    safe_imwrite(temp_crop_path, cropped_img)
    safe_imwrite(temp_mask_path, cropped_mask)

    api_key = merged_params.get("runninghub_api_key", "") or os.getenv("RUNNINGHUB_API_KEY", "")
    if not api_key:
        return api_error("config_error", "RunningHub API Key 未配置", 400)

    _ensure_local_edit_webapp()

    job_id = create_job_record(task_id, "LOCAL_EDIT_START", input_params)
    app = current_app._get_current_object()

    def _run():
        temp_files = [temp_mask_path]
        try:
            with app.app_context():
                update_job_status(job_id, "IN_PROGRESS")
                from bridge_removal.inpaint_gen_Runninghub import run_webapp, TaskPollError, run_batch_with_pool, _aggregate_batch_results
                batch_dir = os.path.join(local_edit_dir, "candidates")
                if os.path.isdir(batch_dir):
                    import shutil
                    shutil.rmtree(batch_dir, ignore_errors=True)
                os.makedirs(batch_dir, exist_ok=True)
                args_list = []
                for i in range(1, num_candidates + 1):
                    out_path = os.path.join(batch_dir, f"{i}.png")
                    params = {
                        "image": temp_crop_path,
                        "mask": temp_mask_path,
                        "prompt": prompt or "移除桥梁恢复原始地面",
                    }
                    args_list.append((api_key, _LOCAL_EDIT_WEBAPP_NAME, params, out_path, job_id))
                results, errors = run_batch_with_pool(run_webapp, args_list)
                batch_id = job_id or str(uuid.uuid4())
                success, payload = _aggregate_batch_results(batch_id, results, errors)
                output_paths = [r for r in results if r]
                result = {
                    "step": {"name": "local_edit", "status": "completed" if success else "partial"},
                    "artifacts": {
                        "output_paths": output_paths,
                        "crop_bounds": {"x": effective_crop_bounds[0], "y": effective_crop_bounds[1], "w": effective_crop_bounds[2], "h": effective_crop_bounds[3], "scale": effective_crop_bounds[4]},
                        "original_image_path": image_path,
                        "crop_image_path": temp_crop_path,
                    }
                }
                if not success:
                    update_job_status(job_id, "FAILED", error=str(payload.get("error_message", "BATCH_ALL_FAILED")), results=result)
                    return
                update_job_status(job_id, "COMPLETED", results=result)
        except TaskPollError as e:
            error_result = {"step": {"name": "local_edit", "status": "failed"}, "error": e.reason, "error_code": "CANCELLED" if e.status == "cancelled" else "TASK_FAILED"}
            try:
                with app.app_context():
                    update_job_status(job_id, "FAILED", error=str(e.reason), results=error_result)
            except Exception:
                pass
        except Exception as e:
            logger.exception("Local edit failed for task %s", task_id)
            error_result = {"step": {"name": "local_edit", "status": "failed"}, "error": str(e)}
            try:
                with app.app_context():
                    update_job_status(job_id, "FAILED", error=str(e), results=error_result)
            except Exception:
                pass
        finally:
            for f in temp_files:
                try:
                    if os.path.isfile(f):
                        os.unlink(f)
                except OSError:
                    pass

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    return api_accepted({"job_id": job_id, "task_id": task_id})


@tasks_bp.route("/<task_id>/local-edit-status", methods=["GET"])
@require_local_auth
def local_edit_status(task_id: str):
    job = find_latest_job_by_task(task_id, "LOCAL_EDIT_START")
    if not job:
        return api_ok({"status": "none", "outputPaths": []})
    status = (job.get("status") or "").upper()
    results = job.get("results") or {}
    artifacts = results.get("artifacts") or {}
    output_paths = artifacts.get("output_paths") or []
    crop_bounds = artifacts.get("crop_bounds") or {}
    original_image_path = artifacts.get("original_image_path") or ""
    crop_image_path = artifacts.get("crop_image_path") or ""
    error = results.get("error") or job.get("error") or ""
    return api_ok({
        "jobId": job.get("job_id", ""),
        "status": status.lower() if status else "pending",
        "outputPaths": output_paths,
        "cropBounds": crop_bounds,
        "originalImagePath": original_image_path,
        "cropImagePath": crop_image_path,
        "error": error,
    })


@tasks_bp.route("/<task_id>/local-edit-apply", methods=["POST"])
@require_local_auth
@require_permission("task:execute")
@validate_body(LocalEditApplyBody)
def local_edit_apply(task_id: str):
    import cv2
    body = get_validated_body()
    job_id = body.get("job_id", "")
    result_index = body.get("result_index", 0)
    crop_bounds_str = body.get("crop_bounds", "")
    original_image_path = body.get("original_image_path", "")

    project = find_project_by_task_id(task_id)
    if not project:
        return api_error("not_found", "Task not found", 404)

    if not job_id:
        return api_error("bad_request", "job_id 不能为空", 400)

    job = find_latest_job_by_task(task_id, "LOCAL_EDIT_START")
    if not job:
        return api_error("not_found", "Local edit job not found", 404)

    results = job.get("results") or {}
    artifacts = results.get("artifacts") or {}
    output_paths = artifacts.get("output_paths") or []
    job_crop_bounds = artifacts.get("crop_bounds") or {}
    job_original = artifacts.get("original_image_path") or ""

    if result_index < 0 or result_index >= len(output_paths):
        return api_error("bad_request", f"结果索引无效: {result_index}", 400)

    result_path = output_paths[result_index]
    if not result_path or not os.path.isfile(result_path):
        return api_error("bad_request", f"结果图像路径无效: {result_path}", 400)

    if crop_bounds_str:
        try:
            parts = [int(v) for v in crop_bounds_str.split(",")]
            if len(parts) == 4:
                cb = {"x": parts[0], "y": parts[1], "w": parts[2], "h": parts[3], "scale": job_crop_bounds.get("scale", 1.0)}
            else:
                cb = job_crop_bounds
        except (ValueError, TypeError):
            cb = job_crop_bounds
    else:
        cb = job_crop_bounds

    orig_path = original_image_path or job_original
    if not orig_path or not os.path.isfile(orig_path):
        return api_error("bad_request", f"原始影像路径无效: {orig_path}", 400)

    result_img = cv2.imread(result_path)
    if result_img is None:
        return api_error("bad_request", "无法读取结果图像", 400)

    original_img = cv2.imread(orig_path)
    if original_img is None:
        return api_error("bad_request", "无法读取原始影像", 400)

    crop_x = int(cb.get("x", 0))
    crop_y = int(cb.get("y", 0))
    crop_w = int(cb.get("w", 0))
    crop_h = int(cb.get("h", 0))
    scale = float(cb.get("scale", 1.0))

    if crop_w <= 0 or crop_h <= 0:
        return api_error("bad_request", "裁剪范围无效", 400)

    result_roi = cv2.resize(result_img, (crop_w, crop_h), interpolation=cv2.INTER_LINEAR)

    orig_h, orig_w = original_img.shape[:2]
    paste_x = max(0, min(crop_x, orig_w - 1))
    paste_y = max(0, min(crop_y, orig_h - 1))
    paste_x2 = min(crop_x + crop_w, orig_w)
    paste_y2 = min(crop_y + crop_h, orig_h)
    paste_w = paste_x2 - paste_x
    paste_h = paste_y2 - paste_y

    if paste_w <= 0 or paste_h <= 0:
        return api_error("bad_request", "粘贴范围超出图像边界", 400)

    blended = original_img.copy()
    roi = result_roi[:paste_h, :paste_w]
    blended[paste_y:paste_y2, paste_x:paste_x2] = roi

    intermediate_path = _resolve_intermediate_path(project, project.get("input_params") or {})
    local_edit_dir = os.path.join(intermediate_path, "local_edit")
    os.makedirs(local_edit_dir, exist_ok=True)

    orig_size_before = os.path.getsize(orig_path)
    backup_path = os.path.join(local_edit_dir, f"backup_{uuid.uuid4().hex[:8]}_{os.path.basename(orig_path)}")
    shutil.copy2(orig_path, backup_path)

    from bridge_removal.image_utils import safe_imwrite
    write_ok = safe_imwrite(orig_path, blended)
    if not write_ok:
        logger.error("safe_imwrite failed for %s after local edit apply", orig_path)
        return api_error("internal_error", f"写入合并影像失败: {orig_path}", 500)

    orig_size_after = os.path.getsize(orig_path)
    mtime = os.path.getmtime(orig_path)
    logger.info(
        "local-edit-apply: overwrote %s (size %d->%d, mtime=%.1f, backup=%s)",
        orig_path, orig_size_before, orig_size_after, mtime, backup_path,
    )

    return api_ok({
        "task_id": task_id,
        "result_path": orig_path,
        "original_image_path": orig_path,
        "backup_path": backup_path,
        "mtime": mtime,
        "status": "succeeded",
    })


@tasks_bp.route("/<task_id>/local-edit-file", methods=["GET"])
@require_local_auth
def local_edit_file(task_id: str):
    from flask import send_file
    path = request.args.get("path", "").strip()
    if not path or not os.path.isfile(path):
        return api_error("not_found", "File not found", 404)
    mime = "image/tiff" if path.lower().endswith((".tif", ".tiff")) else "image/png"
    return send_file(path, mimetype=mime)


@tasks_bp.route("/<task_id>/merge-results", methods=["POST"])
@require_local_auth
@require_permission("task:execute")
@validate_body(MergeResultsBody)
def merge_results(task_id: str):
    body = get_validated_body()
    overwrite = body.get("overwrite", False)
    input_params = body.get("input_params", {})

    project = find_project_by_task_id(task_id)
    if not project:
        return api_error("not_found", "Task not found", 404)

    merged_params = {**(project.get("input_params") or {}), **input_params}
    intermediate_path = _resolve_intermediate_path(project, merged_params)
    masks_dir = os.path.join(intermediate_path, "masks")

    if not os.path.isdir(masks_dir):
        return api_error("no_segments", "No segment data found", 400)

    segment_result_paths = []
    segment_world_file_paths = []
    seg_dirs = sorted([
        d for d in os.listdir(masks_dir)
        if os.path.isdir(os.path.join(masks_dir, d))
    ])

    for seg_name in seg_dirs:
        seg_dir = os.path.join(masks_dir, seg_name)
        confirmed_path = ""
        for ext in (".tif", ".png", ".tiff", ".jpg"):
            candidate = os.path.join(seg_dir, f"{seg_name}_inpainted_patch{ext}")
            if os.path.isfile(candidate):
                confirmed_path = candidate
                break
        if not confirmed_path:
            return api_error(
                "missing_result",
                f"Segment '{seg_name}' has no confirmed result. Please confirm all segment results before merging.",
                400,
            )
        segment_result_paths.append(confirmed_path)

        world_file_path = ""
        for wf_ext in (".pgw", ".tfw", ".jgw"):
            wf_candidate = os.path.join(seg_dir, f"{seg_name}_inpainted_patch{wf_ext}")
            if os.path.isfile(wf_candidate):
                world_file_path = wf_candidate
                break
        if not world_file_path:
            img_base = os.path.splitext(confirmed_path)[0]
            for wf_ext in (".pgw", ".tfw", ".jgw"):
                wf_candidate = img_base + wf_ext
                if os.path.isfile(wf_candidate):
                    world_file_path = wf_candidate
                    break
        if not world_file_path:
            segments_dir = os.path.join(intermediate_path, "segments")
            for wf_ext in (".pgw", ".tfw", ".jgw"):
                wf_candidate = os.path.join(segments_dir, seg_name + wf_ext)
                if os.path.isfile(wf_candidate):
                    src_wf = wf_candidate
                    try:
                        with open(src_wf, "r", encoding="utf-8") as wf_r:
                            wf_lines = wf_r.read().strip().splitlines()
                        if len(wf_lines) >= 6:
                            a = float(wf_lines[0].strip())
                            d_val = float(wf_lines[1].strip())
                            b = float(wf_lines[2].strip())
                            e = float(wf_lines[3].strip())
                            c = float(wf_lines[4].strip())
                            f_val = float(wf_lines[5].strip())
                            try:
                                import cv2 as _cv2
                                result_img = _cv2.imread(confirmed_path, _cv2.IMREAD_UNCHANGED)
                                result_h, result_w = result_img.shape[:2] if result_img is not None else (0, 0)
                            except Exception:
                                result_w, result_h = 0, 0
                            if result_w > 0 and result_h > 0:
                                seg_img_path = ""
                                for ext in (".tif", ".png", ".tiff", ".jpg"):
                                    candidate = os.path.join(segments_dir, seg_name + ext)
                                    if os.path.isfile(candidate):
                                        seg_img_path = candidate
                                        break
                                if seg_img_path:
                                    try:
                                        orig_img = _cv2.imread(seg_img_path, _cv2.IMREAD_UNCHANGED)
                                        orig_h, orig_w = orig_img.shape[:2] if orig_img is not None else (0, 0)
                                    except Exception:
                                        orig_w, orig_h = 0, 0
                                    if orig_w > 0 and orig_h > 0 and (orig_w != result_w or orig_h != result_h):
                                        scale_x = result_w / orig_w
                                        scale_y = result_h / orig_h
                                        a = a * scale_x
                                        d_val = d_val * scale_x
                                        b = b * scale_y
                                        e = e * scale_y
                            _, result_ext = os.path.splitext(confirmed_path)
                            dst_wf_ext = ".pgw" if result_ext.lower() in (".png",) else ".tfw"
                            dst_wf = os.path.join(seg_dir, f"{seg_name}_inpainted_patch{dst_wf_ext}")
                            with open(dst_wf, "w", encoding="utf-8") as wf_w:
                                wf_w.write(f"{a:.12f}\n{d_val:.12f}\n{b:.12f}\n{e:.12f}\n{c:.12f}\n{f_val:.12f}\n")
                            world_file_path = dst_wf
                    except Exception as wf_err:
                        logger.warning("Failed to generate world file from source for %s: %s", seg_name, wf_err)
                    break
        if not world_file_path:
            return api_error(
                "missing_world_file",
                f"Segment '{seg_name}' has no world file. Cannot merge without coordinate information.",
                400,
            )
        segment_world_file_paths.append(world_file_path)

    output_filename = f"{os.path.basename(intermediate_path)}_merged.png"
    output_path = os.path.join(intermediate_path, output_filename)

    if os.path.isfile(output_path) and not overwrite:
        return api_ok({
            "status": "need_confirm",
            "message": "合并成果已存在，确认覆盖后继续合并？",
            "output_path": output_path,
        })

    try:
        from bridge_removal.merge_results import run as merge_run
        payload = {
            "output_path": output_path,
            "segment_result_paths": segment_result_paths,
            "segment_world_file_paths": segment_world_file_paths,
        }
        exit_code, result = merge_run(payload)
        if exit_code != 0:
            err_msg = result.get("message", "合并失败")
            err_code = result.get("code", "MERGE_FAILED")
            if result.get("missing_segments"):
                err_msg = f"缺失分段成果文件: {', '.join(result['missing_segments'])}"
            if result.get("traceback"):
                logger.error("Merge failed for task %s:\n%s", task_id, result["traceback"])
            return api_error(err_code, err_msg, 500)

        result["status"] = "succeeded"
        result["outputPath"] = result.pop("output_path", output_path)
        if "output_world_file_path" in result:
            result["outputWorldFilePath"] = result.pop("output_world_file_path")
        return api_ok(result)

    except Exception as e:
        logger.error("Merge failed for task %s: %s", task_id, traceback.format_exc())
        return api_error("merge_failed", str(e), 500)
