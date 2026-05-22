import json
import logging
import os
import re
import threading
import traceback
import urllib.parse
import uuid
from datetime import datetime

from flask import Blueprint, current_app, request

from api.auth import require_local_auth, require_auth, require_permission
from api.utils import api_ok, api_accepted, api_error
from api.schemas import validate_body, get_validated_body, WorkflowStatusBody, TaskExecuteBody, PreprocessGenerateBody, MaskGenerateBody, MaskSaveBody, InpaintStartBody, InpaintResultBody, MergeResultsBody, ProjectUpdateBody
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


def _run_sam2_pipeline(segment_json_path: str, masks_dir: str, task_id: str, enable_shadow: bool = False) -> dict:
    from bridge_removal.mask_pipeline import run_mask_generation, generate_bridge_masks_from_json
    payload = {
        "segment_json_path": segment_json_path,
        "task_id": task_id,
    }
    payload_text = json.dumps(payload, ensure_ascii=False)
    try:
        result = run_mask_generation(task_id, payload_text)
    except Exception as e:
        logger.warning("SAM2 pipeline failed, falling back to polygon: %s", e)
        return generate_bridge_masks_from_json(segment_json_path, masks_dir, enable_shadow=enable_shadow)
    segments = []
    has_error = False
    if isinstance(result, dict):
        for item in result.get("items", []):
            if item.get("status") == "failed":
                has_error = True
                break
    if has_error:
        logger.warning("SAM2 pipeline returned errors, falling back to polygon")
        return generate_bridge_masks_from_json(segment_json_path, masks_dir, enable_shadow=enable_shadow)
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
            if os.path.exists(mask_path):
                seg_item["resultPath"] = mask_path
                seg_item["resultFileUrl"] = f"/api/v1/tasks/{task_id}/preprocess-file?path={urllib.parse.quote(mask_path, safe='')}"

            segments.append(seg_item)

    all_segment_results_ready = all(s.get("resultFileUrl") for s in segments) if segments else False

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
                    result = _run_sam2_pipeline(item_path, masks_dir, task_id, enable_shadow=enable_shadow)
                else:
                    result = generate_bridge_masks_from_json(item_path, masks_dir, enable_shadow=enable_shadow)
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
                result = _run_sam2_pipeline(segment_json_path, masks_dir, task_id, enable_shadow=enable_shadow)
            else:
                result = generate_bridge_masks_from_json(segment_json_path, masks_dir, enable_shadow=enable_shadow)
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
                result = generate_bridge_masks(segments_dir, masks_dir, enable_shadow=enable_shadow)
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
    mask_data = body.get("mask_data")
    segment_name = body.get("segment_name", "")

    project = find_project_by_task_id(task_id)
    if not project:
        return api_error("not_found", "Task not found", 404)

    input_params = project.get("input_params") or {}
    intermediate_path = _resolve_intermediate_path(project, input_params)
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
            return api_error("validation_error", "Invalid mask_data format", 400)

        return api_ok({"task_id": task_id, "mask_path": mask_path, "saved": True})
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

    job_id = create_job_record(task_id, "INPAINT_START", input_params)

    def _run():
        try:
            update_job_status(job_id, "IN_PROGRESS")
            from bridge_removal.inpaint_gen_Runninghub import qwen_bridge_removal, TaskPollError
            output_path = os.path.join(intermediate_path, "inpainted_patch.tif")
            result_path = qwen_bridge_removal(
                api_key, image_path, removal_mask_path, crop_mask_path, output_path, seed=seed, job_id=job_id
            )
            result = {
                "step": {"name": "inpaint_fill", "status": "completed"},
                "artifacts": {
                    "inpainted_patch_path": result_path,
                    "segment_json_path": segment_json_path,
                    "image_path": image_path,
                    "removal_mask_path": removal_mask_path,
                    "crop_mask_path": crop_mask_path,
                }
            }
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

    threading.Thread(target=_run, daemon=True).start()
    return api_accepted({"job_id": job_id, "status": "STARTED"})


@tasks_bp.route("/<task_id>/inpaint-status", methods=["GET"])
@require_local_auth
def inpaint_status(task_id: str):
    job = find_latest_job_by_task(task_id, "INPAINT_START")
    if not job:
        return api_ok({"task_id": task_id, "status": "NOT_STARTED"})
    return api_ok({"task_id": task_id, "job_id": job["job_id"], "status": job["status"], "results": job.get("results")})


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
@validate_body(InpaintResultBody)
def inpaint_result(task_id: str):
    body = get_validated_body()
    selected_index = body.get("selected_index", 0)

    project = find_project_by_task_id(task_id)
    if not project:
        return api_error("not_found", "Task not found", 404)

    input_params = project.get("input_params") or {}
    intermediate_path = _resolve_intermediate_path(project, input_params)
    inpainted_path = os.path.join(intermediate_path, "inpainted_patch.tif")

    if not os.path.exists(inpainted_path):
        return api_error("not_found", "Inpaint result not found", 404)

    return api_ok({
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
        return api_error("not_found", "Task not found", 404)

    input_params = project.get("input_params") or {}
    intermediate_path = _resolve_intermediate_path(project, input_params)
    inpainted_path = os.path.join(intermediate_path, "inpainted_patch.tif")

    if not os.path.exists(inpainted_path):
        return api_error("not_found", "Inpaint file not found", 404)

    return send_file(inpainted_path, mimetype="image/tiff")


@tasks_bp.route("/<task_id>/merge-results", methods=["POST"])
@require_local_auth
@require_permission("task:execute")
@validate_body(MergeResultsBody)
def merge_results(task_id: str):
    body = get_validated_body()
    input_params = body.get("input_params", {})

    project = find_project_by_task_id(task_id)
    if not project:
        return api_error("not_found", "Task not found", 404)

    job_id = create_job_record(task_id, "MERGE_RESULTS", input_params)

    def _run():
        try:
            update_job_status(job_id, "IN_PROGRESS")
            result = run_write_back_to_dom(task_id, input_params or project.get("input_params") or {})
            update_job_status(job_id, "COMPLETED", results=result)
            update_project_fields(project["project_id"], {"status": "COMPLETED"})
            callback_task_status(task_id, "COMPLETED", results=result)
        except Exception as e:
            update_job_status(job_id, "FAILED", error=str(e))
            callback_task_status(task_id, "FAILED")

    threading.Thread(target=_run, daemon=True).start()
    return api_accepted({"job_id": job_id, "status": "STARTED"})
