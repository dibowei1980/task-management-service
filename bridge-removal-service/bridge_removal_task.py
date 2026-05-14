
import os
import sys
import json
import requests
import uuid
import time
from base_task import BaseTask

WORKFLOW_STATUS_MAP = {
    "待处理": "PENDING",
    "已锁定": "PAUSED",
    "处理中": "IN_PROGRESS",
    "待初检": "PAUSED",
    "需修改": "PAUSED",
    "初检通过": "PAUSED",
    "待终检": "PAUSED",
    "已归档": "COMPLETED"
}

WORKFLOW_STATUS_DEFAULT = "待处理"

def run_automation_processing(task_id, input_params):
    intermediate_root = input_params.get("intermediate_root") or input_params.get("intermediate_path") or "./intermediate"
    intermediate_path = os.path.join(intermediate_root, str(task_id))
    os.makedirs(intermediate_path, exist_ok=True)

    shp_path = input_params.get("bridge_vector") or input_params.get("shp_file_path")
    bridge_feature = input_params.get("bridge_feature") or {}
    record_index = bridge_feature.get("record_index") or bridge_feature.get("recordIndex")
    bridge_id = input_params.get("bridge_id") or (bridge_feature.get("properties") or {}).get("bridge_id")
    bridge_polygon = input_params.get("bridge_polygon") or input_params.get("bridge_polygon_geojson")
    bridge_centerline = input_params.get("bridge_centerline") or input_params.get("bridge_centerline_geojson")
    bridge_props = bridge_feature.get("properties") if isinstance(bridge_feature, dict) else None
    if not isinstance(bridge_props, dict):
        bridge_props = {}

    source_doms = input_params.get("source_doms") or []
    if not isinstance(source_doms, list):
        source_doms = []
    max_side_px = input_params.get("max_side_px") or input_params.get("segments_max_side_px") or input_params.get("preprocess_max_side_px") or 1024
    try:
        max_side_px = int(max_side_px)
    except Exception:
        max_side_px = 1024

    try:
        from bridge_removal.pipeline import (
            build_bridge_geojson_from_input,
            build_bridge_geojson_from_shp,
            generate_segments_from_dom_sources,
            write_bridge_geojson,
        )

        if isinstance(bridge_polygon, dict) and bridge_polygon.get("type"):
            safe_id, bridge_geojson = build_bridge_geojson_from_input(
                bridge_polygon_geojson=bridge_polygon,
                bridge_centerline_geojson=bridge_centerline if isinstance(bridge_centerline, dict) else None,
                properties=bridge_props,
                bridge_id=bridge_id,
                record_index=int(record_index) if record_index else None,
            )
        else:
            if not shp_path or not record_index:
                return {
                    "step": {"name": "automation_processing", "status": "failed"},
                    "artifacts": {"segments": []},
                    "error": "缺少 bridge_polygon 或 bridge_vector/shp_file_path + bridge_feature.record_index，无法生成分段数据包",
                }
            safe_id, bridge_geojson = build_bridge_geojson_from_shp(shp_path, int(record_index), bridge_id=bridge_id)
        geojson_path = write_bridge_geojson(intermediate_path, safe_id, bridge_geojson)
        segments_dir, saved_segments = generate_segments_from_dom_sources(
            intermediate_path=intermediate_path,
            bridge_geojson=bridge_geojson,
            source_doms=source_doms,
            max_side_px=max_side_px,
        )
        return {
            "step": {"name": "automation_processing", "status": "completed"},
            "artifacts": {
                "segments": saved_segments,
                "bridge_geojson_path": geojson_path,
                "automation_output_dir": segments_dir,
            },
        }
    except Exception as ex:
        return {
            "step": {"name": "automation_processing", "status": "failed"},
            "artifacts": {"segments": []},
            "error": str(ex),
        }

def run_interactive_correction(task_id, input_params):
    intermediate_path = input_params.get("intermediate_path") or f"./intermediate/{task_id}"
    return {
        "step": {"name": "interactive_correction", "status": "completed"},
        "artifacts": {
            "correction_output_dir": os.path.join(intermediate_path, "correction")
        }
    }

def run_department_qa(task_id, input_params):
    return {
        "step": {"name": "department_qa", "status": "completed"},
        "artifacts": {}
    }

def run_write_back(task_id, input_params):
    return {
        "step": {"name": "write_back", "status": "completed"},
        "artifacts": {}
    }

def run_final_qa(task_id, input_params):
    return {
        "step": {"name": "final_qa", "status": "completed"},
        "artifacts": {}
    }

def run_inpaint_fill(task_id, input_params):
    intermediate_path = input_params.get("intermediate_path") or f"./intermediate/{task_id}"
    return {
        "step": {"name": "inpaint_fill", "status": "completed"},
        "artifacts": {
            "inpainted_patch_path": os.path.join(intermediate_path, "inpainted_patch.tif")
        }
    }

def run_write_back_to_dom(task_id, input_params):
    source_doms = input_params.get("source_doms") or []
    writeback_outputs = []
    for dom_path in source_doms:
        writeback_outputs.append({
            "source_dom": dom_path,
            "output_dom": dom_path
        })
    return {
        "step": {"name": "write_back_to_dom", "status": "completed"},
        "artifacts": {
            "writeback_outputs": writeback_outputs
        }
    }

def _expand_bbox(bbox, distance):
    if not bbox or len(bbox) < 4:
        return bbox
    d = float(distance or 0.0)
    return [bbox[0] - d, bbox[1] - d, bbox[2] + d, bbox[3] + d]

def _polygon_from_bbox(bbox):
    return {
        "type": "Polygon",
        "coordinates": [[
            [bbox[0], bbox[1]],
            [bbox[2], bbox[1]],
            [bbox[2], bbox[3]],
            [bbox[0], bbox[3]],
            [bbox[0], bbox[1]]
        ]]
    }

def _validate_shp_components(shp_file_path):
    if not shp_file_path or not isinstance(shp_file_path, str):
        raise ValueError("输入参数 'shp_file_path' 未提供。")
    if not shp_file_path.lower().endswith(".shp"):
        raise ValueError("桥梁矢量文件（SHP）路径必须以 .shp 结尾。")
    base = shp_file_path[:-4]
    shx_path = base + ".shx"
    dbf_path = base + ".dbf"
    missing = []
    for p in (shp_file_path, shx_path, dbf_path):
        if not os.path.exists(p):
            missing.append(p)
    if missing:
        raise ValueError("SHP 缺少核心文件: " + ", ".join(missing))
    return shp_file_path, shx_path, dbf_path

def _list_dom_tiles(dom_dir):
    if not dom_dir or not isinstance(dom_dir, str):
        raise ValueError("输入参数 'dom_dir' 未提供。")
    if not os.path.exists(dom_dir) or not os.path.isdir(dom_dir):
        raise ValueError(f"DOM目录不存在: {dom_dir}")
    tiles = []
    for name in os.listdir(dom_dir):
        lower = name.lower()
        if lower.endswith(".tif") or lower.endswith(".tiff"):
            tiles.append(os.path.join(dom_dir, name))
    tiles.sort()
    if not tiles:
        raise ValueError(f"DOM目录未找到.tif/.tiff文件: {dom_dir}")
    return tiles

def _read_tfw(tfw_path):
    with open(tfw_path, "r", encoding="utf-8") as f:
        lines = [l.strip() for l in f.readlines() if l.strip()]
    if len(lines) < 6:
        raise ValueError(f"TFW格式无效: {tfw_path}")
    a = float(lines[0])
    d = float(lines[1])
    b = float(lines[2])
    e = float(lines[3])
    c = float(lines[4])
    f_ = float(lines[5])
    return a, d, b, e, c, f_

def _get_image_size(path):
    lower = str(path).lower()
    if lower.endswith(".tif") or lower.endswith(".tiff"):
        try:
            import tifffile
            with tifffile.TiffFile(path) as tif:
                page = tif.pages[0]
                return int(page.imagewidth), int(page.imagelength)
        except Exception:
            pass
    try:
        import cv2
        img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
        if img is None:
            raise ValueError(f"无法读取影像: {path}")
        h, w = img.shape[:2]
        return int(w), int(h)
    except Exception as ex:
        raise ValueError(f"无法读取影像尺寸: {path}") from ex

def _world_file_extension_for_image_path(path):
    lower = str(path or "").lower()
    if lower.endswith(".png"):
        return ".pgw"
    if lower.endswith(".tif") or lower.endswith(".tiff"):
        return ".tfw"
    return ".tfw"

def _dom_tile_info(dom_path):
    ext = _world_file_extension_for_image_path(dom_path)
    world_file_path = os.path.splitext(dom_path)[0] + ext
    if not os.path.exists(world_file_path):
        fallback_ext = ".pgw" if ext == ".tfw" else ".tfw"
        fallback = os.path.splitext(dom_path)[0] + fallback_ext
        if os.path.exists(fallback):
            world_file_path = fallback
        else:
            raise ValueError(f"DOM缺少坐标描述文件: {world_file_path}")
    a, d, b, e, c, f_ = _read_tfw(world_file_path)
    resolution = abs(a)
    width, height = _get_image_size(dom_path)
    x_tl = c
    y_tl = f_
    x_br = a * width + b * height + c
    y_br = d * width + e * height + f_
    bounds = [min(x_tl, x_br), min(y_tl, y_br), max(x_tl, x_br), max(y_tl, y_br)]
    return {"bounds": bounds, "resolution": resolution}

class _DomTileIndex:
    def __init__(self, dom_paths):
        self.dom_paths = [p for p in (dom_paths or []) if isinstance(p, str) and p.strip()]
        self._cache = {}

    def info(self, dom_path):
        if dom_path in self._cache:
            return self._cache[dom_path]
        info = _dom_tile_info(dom_path)
        self._cache[dom_path] = info
        return info

    def filter_by_bbox(self, bbox):
        result = []
        for p in self.dom_paths:
            try:
                info = self.info(p)
            except Exception:
                continue
            if _bbox_overlaps(bbox, info.get("bounds")):
                result.append(p)
        return result

    def min_resolution(self, dom_paths):
        res = None
        for p in dom_paths:
            try:
                r = float(self.info(p).get("resolution") or 0.0)
            except Exception:
                continue
            if r <= 0:
                continue
            if res is None or r < res:
                res = r
        return res

def _parse_strategy(value, default_value):
    if not value:
        return default_value
    s = str(value).strip().upper()
    if s in ("ASC", "DESC", "OVERWRITE", "SKIP"):
        return s
    if s in ("从小到大", "SMALL_TO_LARGE", "SMALL2LARGE", "S2L"):
        return "ASC"
    if s in ("从大到小", "LARGE_TO_SMALL", "LARGE2SMALL", "L2S"):
        return "DESC"
    if s in ("覆盖", "覆盖现有子任务"):
        return "OVERWRITE"
    if s in ("跳过", "跳过现有子任务"):
        return "SKIP"
    return default_value

def _bridge_sort_key(bridge_id):
    if bridge_id is None:
        return (1, "")
    s = str(bridge_id).strip()
    digits = "".join([c for c in s if c.isdigit()])
    if digits:
        try:
            return (0, int(digits))
        except Exception:
            return (1, s)
    return (1, s)

def _read_dbf_records(dbf_path):
    with open(dbf_path, "rb") as f:
        header = f.read(32)
        if len(header) < 32:
            raise ValueError("DBF 文件头无效")
        num_records = int.from_bytes(header[4:8], "little", signed=False)
        header_len = int.from_bytes(header[8:10], "little", signed=False)
        record_len = int.from_bytes(header[10:12], "little", signed=False)
        field_desc_len = header_len - 33
        if field_desc_len < 0 or field_desc_len % 32 != 0:
            raise ValueError("DBF 字段描述无效")
        field_count = field_desc_len // 32
        fields = []
        for _ in range(field_count):
            desc = f.read(32)
            name_raw = desc[0:11].split(b"\x00", 1)[0]
            name = name_raw.decode("ascii", errors="ignore").strip()
            field_type = chr(desc[11])
            length = desc[16]
            decimal = desc[17]
            fields.append((name, field_type, length, decimal))
        terminator = f.read(1)
        if terminator != b"\r":
            raise ValueError("DBF 终止符无效")
        records = []
        for _ in range(num_records):
            rec = f.read(record_len)
            if len(rec) < record_len:
                break
            if rec[0:1] == b"*":
                continue
            offset = 1
            item = {}
            for name, field_type, length, decimal in fields:
                raw = rec[offset:offset+length]
                offset += length
                text = raw.decode("utf-8", errors="ignore").strip()
                item[name] = text
            records.append(item)
        return records

def _read_shp_record_bboxes(shp_path):
    bboxes = []
    with open(shp_path, "rb") as f:
        header = f.read(100)
        if len(header) < 100:
            raise ValueError("SHP 文件头无效")
        while True:
            rec_header = f.read(8)
            if len(rec_header) < 8:
                break
            content_len_words = int.from_bytes(rec_header[4:8], "big", signed=False)
            content_len = content_len_words * 2
            rec = f.read(content_len)
            if len(rec) < content_len:
                break
            if len(rec) < 4:
                bboxes.append(None)
                continue
            shape_type = int.from_bytes(rec[0:4], "little", signed=True)
            if shape_type == 0:
                bboxes.append(None)
                continue
            if shape_type in (3, 5, 13, 15, 23, 25):
                if len(rec) < 36:
                    bboxes.append(None)
                    continue
                xmin = _read_le_double(rec, 4)
                ymin = _read_le_double(rec, 12)
                xmax = _read_le_double(rec, 20)
                ymax = _read_le_double(rec, 28)
                bboxes.append([xmin, ymin, xmax, ymax])
                continue
            if shape_type in (1, 11, 21):
                if len(rec) < 20:
                    bboxes.append(None)
                    continue
                x = _read_le_double(rec, 4)
                y = _read_le_double(rec, 12)
                bboxes.append([x, y, x, y])
                continue
            bboxes.append(None)
    return bboxes

def _read_shp_record_geometries(shp_path):
    geoms = []
    with open(shp_path, "rb") as f:
        header = f.read(100)
        if len(header) < 100:
            raise ValueError("SHP 文件头无效")
        while True:
            rec_header = f.read(8)
            if len(rec_header) < 8:
                break
            content_len_words = int.from_bytes(rec_header[4:8], "big", signed=False)
            content_len = content_len_words * 2
            rec = f.read(content_len)
            if len(rec) < content_len:
                break
            if len(rec) < 4:
                geoms.append(None)
                continue
            shape_type = int.from_bytes(rec[0:4], "little", signed=True)
            if shape_type == 0:
                geoms.append(None)
                continue
            if shape_type in (5, 15, 25):
                geom = _parse_shp_polygon_geometry(rec)
                geoms.append(geom)
                continue
            if shape_type in (1,):
                if len(rec) < 20:
                    geoms.append(None)
                    continue
                x = _read_le_double(rec, 4)
                y = _read_le_double(rec, 12)
                geoms.append({"type": "Point", "coordinates": [x, y]})
                continue
            geoms.append(None)
    return geoms

def _parse_shp_polygon_geometry(rec):
    if len(rec) < 44:
        return None
    num_parts = int.from_bytes(rec[36:40], "little", signed=True)
    num_points = int.from_bytes(rec[40:44], "little", signed=True)
    if num_parts <= 0 or num_points <= 0:
        return None
    parts_offset = 44
    parts_bytes = num_parts * 4
    points_offset = parts_offset + parts_bytes
    if len(rec) < points_offset + num_points * 16:
        return None
    parts = []
    for i in range(num_parts):
        start = int.from_bytes(rec[parts_offset + i*4:parts_offset + (i+1)*4], "little", signed=True)
        parts.append(start)
    parts.append(num_points)
    points = []
    for i in range(num_points):
        off = points_offset + i * 16
        x = _read_le_double(rec, off)
        y = _read_le_double(rec, off + 8)
        points.append([x, y])
    rings_or_lines = []
    for i in range(num_parts):
        s = parts[i]
        e = parts[i + 1]
        seg = points[s:e]
        if not seg:
            continue
        first = seg[0]
        last = seg[-1]
        if first[0] != last[0] or first[1] != last[1]:
            seg = seg + [first]
        rings_or_lines.append(seg)
    if not rings_or_lines:
        return None
    return {"type": "Polygon", "coordinates": rings_or_lines}

def _read_le_double(buf, offset):
    import struct
    return struct.unpack("<d", buf[offset:offset+8])[0]

def build_dependency_graph(units_with_scope):
    adj = {unit['id']: [] for unit in units_with_scope}
    in_degree = {unit['id']: 0 for unit in units_with_scope}
    items = []
    for unit in units_with_scope:
        bbox = _extract_bbox_from_geometry(unit.get("scope"))
        items.append({"id": unit["id"], "bbox": bbox})

    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            left = items[i]
            right = items[j]
            if _bbox_overlaps(left["bbox"], right["bbox"]):
                adj[left["id"]].append(right["id"])
                in_degree[right["id"]] += 1

    return adj, in_degree

def _extract_bbox_from_geometry(geometry):
    if geometry is None:
        return None
    if isinstance(geometry, dict):
        if "bbox" in geometry and geometry["bbox"]:
            return _normalize_bbox(geometry["bbox"])
        if geometry.get("type") == "Feature":
            return _extract_bbox_from_geometry(geometry.get("geometry"))
        coordinates = geometry.get("coordinates")
        return _bbox_from_coordinates(coordinates)
    return None

def _normalize_bbox(bbox):
    if not bbox or len(bbox) < 4:
        return None
    return [bbox[0], bbox[1], bbox[2], bbox[3]]

def _bbox_from_coordinates(coordinates):
    points = _flatten_coordinates(coordinates)
    if not points:
        return None
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return [min(xs), min(ys), max(xs), max(ys)]

def _flatten_coordinates(coords):
    if coords is None:
        return []
    if isinstance(coords, (list, tuple)) and coords:
        first = coords[0]
        if isinstance(first, (int, float)) and len(coords) >= 2:
            return [(coords[0], coords[1])]
        points = []
        for item in coords:
            points.extend(_flatten_coordinates(item))
        return points
    return []

def _bbox_overlaps(left, right):
    if not left or not right:
        return False
    return not (
        left[2] < right[0] or
        right[2] < left[0] or
        left[3] < right[1] or
        right[3] < left[1]
    )

def _merge_step_result(manifest, step_result):
    if not step_result:
        return
    step = step_result.get("step")
    if step:
        err = step_result.get("error")
        if err is not None:
            step["error"] = err
        manifest["steps"].append(step)
    artifacts = step_result.get("artifacts")
    if artifacts:
        manifest["artifacts"].update(artifacts)

def _filter_operation_subtasks(subtasks):
    if not subtasks:
        return []
    filtered = []
    for t in subtasks:
        if not t:
            continue
        category = t.get("category")
        if category and str(category).upper() == "SYSTEM_TASK":
            continue
        filtered.append(t)
    return filtered

class BridgeRemovalOrchestratorTask(BaseTask):
    """
    桥梁去除批处理任务的编排器。
    遵循“DOM桥梁去除项目设计方案.md”中的定义，负责任务分解、依赖构建和状态初始化。
    """

    def execute(self):
        self._log("开始执行桥梁去除任务分解...")

        if self.input_params.get("init_project_rbac"):
            init_project_roles_and_permissions()

        if self.input_params.get("simulate_end_to_end"):
            api_url, headers = self._get_api_config()
            simulate_end_to_end_flow(api_url, headers, self.input_params)
            self.results["simulation"] = "completed"
            return

        api_url, headers = self._get_api_config()
        
        # 清理历史运行信息（qa_feedback），确保只显示本次运行信息
        try:
            self._update_task_metadata_via_api(api_url, headers, self.task_id, {"qa_feedback": []})
        except Exception as ex:
            self._log(f"清理历史运行信息失败(忽略): {ex}")

        self._report_progress(api_url, headers, "处理中", 1, "开始分解：正在读取输入参数与DOM索引")
        shp_file_path = self.input_params.get("shp_file_path")
        if not shp_file_path:
            raise ValueError("输入参数 'shp_file_path' 未提供。")

        order_strategy = _parse_strategy(self.input_params.get("decompose_order_strategy"), "ASC")
        overwrite_strategy = _parse_strategy(self.input_params.get("decompose_overwrite_strategy"), "SKIP")

        dom_sources = self.input_params.get("source_doms")
        if not isinstance(dom_sources, list) or not dom_sources:
            dom_dir = self.input_params.get("dom_dir")
            dom_sources = _list_dom_tiles(dom_dir)
        dom_index = _DomTileIndex(dom_sources)
        self._report_progress(api_url, headers, "处理中", 8, f"DOM索引就绪：候选DOM数量 {len(dom_sources)}")

        parent_task_id = self.input_params.get("project_id") or self.task_id
        self._report_progress(api_url, headers, "处理中", 10, "开始检查已存在子任务")
        existing_subtasks = self._get_subtasks_via_api(api_url, headers, parent_task_id)
        existing_subtasks = _filter_operation_subtasks(existing_subtasks)
        existing_by_bridge_id = self._index_subtasks_by_bridge_id(existing_subtasks)

        task_units = self._create_task_units_from_shp(api_url, headers, shp_file_path, dom_sources, dom_index, parent_task_id)
        if not task_units:
            self.results["message"] = "SHP 文件中未找到有效要素，无法创建任务单元。"
            self._report_progress(api_url, headers, "已归档", 100, "分解结束：SHP中未找到有效要素")
            return
        self._report_progress(api_url, headers, "处理中", 18, f"SHP解析完成：桥梁要素数量 {len(task_units)}")

        units_to_create = []
        deleted_existing = 0
        skipped_existing = 0
        for unit in task_units:
            unit_params = _parse_input_params(unit.get("inputParams"))
            bridge_id = unit_params.get("bridge_id")
            existed_list = existing_by_bridge_id.get(str(bridge_id)) if bridge_id is not None else None
            if existed_list:
                if overwrite_strategy == "OVERWRITE":
                    for existed in existed_list:
                        self._delete_task_via_api(api_url, headers, existed.get("id"))
                        deleted_existing += 1
                    existing_by_bridge_id.pop(str(bridge_id), None)
                    units_to_create.append(unit)
                else:
                    skipped_existing += 1
                    continue
            else:
                units_to_create.append(unit)

        self._report_progress(
            api_url,
            headers,
            "处理中",
            25,
            f"子任务生成计划：待创建 {len(units_to_create)}，覆盖删除 {deleted_existing}，跳过 {skipped_existing}"
        )

        if units_to_create:
            created_tasks = self._create_subtasks_via_api(api_url, headers, units_to_create)
        else:
            created_tasks = []
        created_task_ids = {t.get("id") for t in (created_tasks or []) if t and t.get("id")}

        all_subtasks = self._get_subtasks_via_api(api_url, headers, parent_task_id)
        all_subtasks = _filter_operation_subtasks(all_subtasks)
        if not all_subtasks:
            self.results["message"] = "未找到子任务（创建/获取失败）。"
            self._report_progress(api_url, headers, "已归档", 100, "分解结束：未找到子任务（创建/获取失败）")
            return
        self._report_progress(api_url, headers, "处理中", 78, f"子任务创建/获取完成：当前总数 {len(all_subtasks)}")

        # 1. 任务分解：确定需要创建、覆盖或跳过的任务单元
        initial_statuses = {}
        if overwrite_strategy == "OVERWRITE":
            for t in all_subtasks:
                try:
                    self._recompute_scope_and_source_doms(api_url, headers, t, dom_sources, dom_index)
                except Exception as ex:
                    self._log(f"更新子任务DOM/impact_scope失败: taskId={t.get('id')}, err={ex}")
            self._report_progress(api_url, headers, "处理中", 88, "已更新子任务 impact_scope 与 source_doms")
        else:
            if created_task_ids:
                for t in all_subtasks:
                    if t.get("id") not in created_task_ids:
                        continue
                    try:
                        self._recompute_scope_and_source_doms(api_url, headers, t, dom_sources, dom_index)
                    except Exception as ex:
                        self._log(f"更新新增子任务DOM/impact_scope失败: taskId={t.get('id')}, err={ex}")
                self._report_progress(api_url, headers, "处理中", 88, f"已更新新增子任务 impact_scope 与 source_doms（{len(created_task_ids)}）")
            else:
                self._report_progress(api_url, headers, "处理中", 88, "未新增子任务：跳过策略")

        # 2. 分割步骤：作为分解的后续步骤执行
        # 分割步骤可能会更新任务的 impact_scope，因此必须在依赖计算之前执行
        preprocess_overwrite = (overwrite_strategy == "OVERWRITE")
        if preprocess_overwrite:
            ids = [t.get("id") for t in all_subtasks if t and t.get("id")]
            self._report_progress(api_url, headers, "处理中", 90, f"开始分割{len(ids)}个子任务")
            self._run_segmentation_step(api_url, headers, ids, overwrite=True)
        else:
            ids = [t.get("id") for t in all_subtasks if t and t.get("id") in created_task_ids]
            if ids:
                self._report_progress(api_url, headers, "处理中", 90, f"开始分割新增子任务{len(ids)}个")
                self._run_segmentation_step(api_url, headers, ids, overwrite=False)
            else:
                self._report_progress(api_url, headers, "处理中", 90, "未新增子任务：跳过分割步骤")
        
        # 重新获取所有子任务，以确保 impact_scope 是分割步骤更新后的最新值
        all_subtasks = self._get_subtasks_via_api(api_url, headers, parent_task_id)
        all_subtasks = _filter_operation_subtasks(all_subtasks)

        # 3. 依赖构建与状态初始化
        rebuild_all = self.input_params.get("rebuild_dependencies_after_segmentation")
        if rebuild_all is None:
            rebuild_all = True
        if rebuild_all:
            for t in all_subtasks:
                try:
                    self._clear_dependencies_via_api(api_url, headers, t.get("id"))
                except Exception as ex:
                    self._report_progress(api_url, headers, "处理中", 92, f"清理子任务依赖失败: taskId={t.get('id')}, err={ex}")
            self._report_progress(api_url, headers, "处理中", 92, "已清理旧依赖关系")

            initial_statuses = self._determine_initial_statuses(api_url, headers, all_subtasks, order_strategy)
            self._update_subtask_statuses_via_api(api_url, headers, initial_statuses)
            self._report_progress(api_url, headers, "处理中", 98, "已构建依赖并设置子任务初始状态")

        self.results["created_subtask_count"] = len(units_to_create)
        self.results["subtask_initial_statuses"] = initial_statuses
        self._log(f"任务分解与分割完成：新建 {len(units_to_create)} 个子任务，当前总数 {len(all_subtasks)}。")
        self._report_progress(
            api_url,
            headers,
            "处理中",
            100,
            f"分解与分割完成：新建 {len(units_to_create)} 个子任务，当前总数 {len(all_subtasks)}"
        )
    def _get_task(self, api_url, headers, task_id):
        response = requests.get(f"{api_url}/tasks/{task_id}", headers=headers, timeout=15)
        response.raise_for_status()
        return response.json()

    def _run_segmentation_step(self, api_url, headers, task_ids, overwrite=False):
        """执行分割步骤：批量生成分段数据包"""
        ids = [tid for tid in (task_ids or []) if tid]
        if not ids:
            return
        
        self._log("开始执行分割步骤（生成分段数据包）...")
        self._report_progress(api_url, headers, "处理中", 90, f"开始执行分割步骤（生成分段数据包）...")
        
        max_side_px = self.input_params.get("preprocess_max_side_px") or 1024
        try:
            max_side_px = int(max_side_px)
        except Exception:
            max_side_px = 1024

        timeout_seconds = self.input_params.get("preprocess_api_timeout_sec") or 220
        try:
            timeout_seconds = int(timeout_seconds)
        except Exception:
            timeout_seconds = 220

        total = len(ids)
        errors = []
        for idx, task_id in enumerate(ids):
            self._report_progress(api_url, headers, "处理中", 90, f"正在执行分割（生成数据包）：{idx+1}/{total}")
            err = None
            try:
                resp = requests.post(
                    f"{api_url}/tasks/{task_id}/preprocess-generate",
                    headers=headers,
                    params={"maxSidePx": max_side_px},
                    timeout=timeout_seconds
                )
                if resp.status_code not in (200, 201):
                    err = f"HTTP {resp.status_code}"
                else:
                    data = resp.json() if resp.content else {}
                    manifest_error = data.get("manifestError")
                    if manifest_error:
                        err = str(manifest_error)
                    else:
                        try:
                            self._update_impact_scope_from_preprocess(api_url, headers, task_id)
                        except Exception as ex:
                            err = str(ex)
            except Exception as ex:
                err = str(ex)
            if err:
                errors.append({"task_id": task_id, "error": err})
                self._report_progress(api_url, headers, "处理中", 90, f"任务 {task_id} 分割失败: {err}")
                self._log(f"任务 {task_id} 分割失败: {err}")

        if errors:
            self._update_task_output_results(api_url, headers, self.task_id, {"segmentation_errors": errors})
            raise RuntimeError(f"分割失败: {len(errors)}/{total}")

    def _update_impact_scope_from_preprocess(self, api_url, headers, task_id):
        task_data = self._get_task(api_url, headers, task_id)
        raw_output = task_data.get("outputResults") or "{}"
        if isinstance(raw_output, str):
            try:
                output_results = json.loads(raw_output)
            except json.JSONDecodeError:
                output_results = {}
        else:
            output_results = raw_output or {}
        manifest = output_results.get("preprocess_manifest") or {}
        artifacts = manifest.get("artifacts") if isinstance(manifest, dict) else {}
        segments = artifacts.get("segments") if isinstance(artifacts, dict) else None
        if not segments:
            return False
        min_x, min_y = float("inf"), float("inf")
        max_x, max_y = float("-inf"), float("-inf")
        has_valid_bbox = False
        for seg in segments:
            if not isinstance(seg, dict):
                continue
            bbox = seg.get("bbox")
            if bbox and len(bbox) >= 4:
                bbox = _normalize_bbox(bbox)
                min_x = min(min_x, bbox[0])
                min_y = min(min_y, bbox[1])
                max_x = max(max_x, bbox[2])
                max_y = max(max_y, bbox[3])
                has_valid_bbox = True
        if not has_valid_bbox:
            return False
        merged_bbox = [min_x, min_y, max_x, max_y]
        new_impact_scope = _polygon_from_bbox(merged_bbox)
        self._update_task_input_params(api_url, headers, task_id, {"impact_scope": new_impact_scope})
        return True

    def _update_task_input_params(self, api_url, headers, task_id, updates):
        response = requests.get(f"{api_url}/tasks/{task_id}", headers=headers, timeout=15)
        response.raise_for_status()
        task_data = response.json()
        input_params = _parse_input_params(task_data.get("inputParams"))
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
        
    def _determine_created_task_dependencies_and_statuses(self, api_url, headers, tasks, order_strategy, created_task_ids):
        if not tasks or not created_task_ids:
            return {}

        task_by_id = {t.get("id"): t for t in (tasks or []) if t and t.get("id")}
        units = []
        for t in tasks:
            tid = t.get("id")
            params = _parse_input_params(t.get("inputParams"))
            scope = params.get("impact_scope")
            if not scope:
                feature = params.get("bridge_feature")
                bbox = _extract_bbox_from_geometry(feature)
                scope = _polygon_from_bbox(bbox) if bbox else None
            bridge_id = params.get("bridge_id")
            units.append({
                "id": tid,
                "bridge_id": bridge_id,
                "bbox": _extract_bbox_from_geometry(scope),
                "is_created": tid in created_task_ids
            })

        units_sorted = sorted(units, key=lambda x: _bridge_sort_key(x.get("bridge_id")), reverse=(order_strategy == "DESC"))
        adj = {u["id"]: [] for u in units_sorted}
        predecessors_for_created = {tid: set() for tid in created_task_ids}

        for i in range(len(units_sorted)):
            for j in range(i + 1, len(units_sorted)):
                left = units_sorted[i]
                right = units_sorted[j]
                if not _bbox_overlaps(left.get("bbox"), right.get("bbox")):
                    continue
                left_created = left.get("is_created")
                right_created = right.get("is_created")
                if right_created and not left_created:
                    adj[left["id"]].append(right["id"])
                    predecessors_for_created[right["id"]].add(left["id"])
                elif left_created and not right_created:
                    adj[right["id"]].append(left["id"])
                    predecessors_for_created[left["id"]].add(right["id"])
                elif left_created and right_created:
                    adj[left["id"]].append(right["id"])
                    predecessors_for_created[right["id"]].add(left["id"])

        created_adj = {}
        for source_id, targets in adj.items():
            filtered = [t for t in targets if t in created_task_ids]
            if filtered:
                created_adj[source_id] = filtered
        if created_adj:
            self._create_dependencies_via_api(api_url, headers, created_adj)

        def _is_predecessor_satisfied(task_obj):
            if not task_obj:
                return False
            status = task_obj.get("status")
            if status == "COMPLETED":
                return True
            if task_obj.get("type") != "BRIDGE_REMOVAL_UNIT":
                return False
            params = _parse_input_params(task_obj.get("inputParams"))
            ws = params.get("workflow_status")
            if not ws:
                return False
            return ws in ("待初检", "初检通过", "待终检", "已归档")

        created_statuses = {}
        for tid in created_task_ids:
            preds = predecessors_for_created.get(tid) or set()
            satisfied = True
            for pid in preds:
                if not _is_predecessor_satisfied(task_by_id.get(pid)):
                    satisfied = False
                    break
            workflow_status = "待处理" if satisfied else "已锁定"
            task_status = WORKFLOW_STATUS_MAP.get(workflow_status, "PENDING")
            created_statuses[tid] = {"task_status": task_status, "workflow_status": workflow_status}
        return created_statuses

    def _report_progress(self, api_url, headers, workflow_status, progress, message):
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
                f"{api_url}/tasks/{self.task_id}/workflow-status",
                headers=headers,
                data=json.dumps(body),
                timeout=15
            ).raise_for_status()
        except Exception as ex:
            self._log(f"上报分解进度失败(忽略): {ex}")

    def _get_api_config(self):
        api_url = os.getenv("TASK_MANAGEMENT_API_URL")
        auth_token = os.getenv("AUTH_TOKEN")
        if not api_url or not auth_token:
            raise ValueError("环境变量 TASK_MANAGEMENT_API_URL 或 AUTH_TOKEN 未设置。")
        headers = {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
        return api_url, headers

    def _create_task_units_from_shp(self, api_url, headers, shp_file_path, dom_sources, dom_index: _DomTileIndex, parent_task_id):
        shp_path, shx_path, dbf_path = _validate_shp_components(shp_file_path)
        self._log(f"正在从 '{shp_path}' 读取桥梁矢量特征（SHP）...")
        self._report_progress(api_url, headers, "处理中", 12, "开始解析SHP桥梁要素")
        try:
            bboxes = _read_shp_record_bboxes(shp_path)
            geoms = _read_shp_record_geometries(shp_path)
            records = _read_dbf_records(dbf_path)

        except Exception as e:
            raise IOError(f"读取或解析SHP文件 '{shp_path}' 失败: {e}")

        units = []
        count = min(len(bboxes), len(records))
        self._report_progress(api_url, headers, "处理中", 13, f"SHP读取完成：记录数 {count}")
        report_every = 1
        if count >= 200:
            report_every = max(1, count // 20)
        elif count >= 50:
            report_every = max(1, count // 10)
        for i in range(count):
            bbox = bboxes[i] if i < len(bboxes) else None
            if not bbox:
                continue
            bridge_geom = geoms[i] if i < len(geoms) else None
            bridge_polygon = bridge_geom if isinstance(bridge_geom, dict) and bridge_geom.get("type") == "Polygon" else None
            geometry_missing = bridge_polygon is None
            geometry_missing_reason = None
            if geometry_missing:
                if isinstance(bridge_geom, dict) and bridge_geom.get("type"):
                    geometry_missing_reason = f"not_polygon:{bridge_geom.get('type')}"
                else:
                    geometry_missing_reason = "missing_or_unparsed"
            properties = records[i] if i < len(records) else {}
            if isinstance(properties, dict):
                length_value = None
                for key in ("Shape_Leng", "Shape_Len", "SHAPE_LENG", "SHAPE_LEN", "shape_leng", "shape_len", "length", "LENGTH", "Length", "len", "LEN", "长度"):
                    if key in properties and properties.get(key) not in (None, ""):
                        length_value = properties.get(key)
                        break
                if length_value is not None and properties.get("length") in (None, ""):
                    properties["length"] = length_value
            bridge_id = properties.get("bridge_id") or properties.get("BRIDGE_ID") or properties.get("id") or f"bridge_{i+1}"
            candidate_doms = dom_index.filter_by_bbox(bbox)
            if not candidate_doms:
                candidate_doms = dom_sources
            resolution = dom_index.min_resolution(candidate_doms) or 0.5
            expand_distance = float(resolution) * 512.0
            expanded_bbox = _expand_bbox(bbox, expand_distance)
            impact_scope = _polygon_from_bbox(expanded_bbox)
            filtered_doms = dom_index.filter_by_bbox(expanded_bbox)
            if not filtered_doms:
                filtered_doms = candidate_doms
            intermediate_root = self.input_params.get("intermediate_root") or "/mnt/intermediate"
            centerline_geojson = None
            centerline_missing_reason = None
            bridge_width = None
            bridge_length = None
            if bridge_polygon is not None:
                try:
                    from bridge_removal.vector_reader import compute_centerline_from_polygon
                    shapely_geometry = __import__("shapely.geometry", fromlist=["Polygon", "mapping"])
                    Polygon = getattr(shapely_geometry, "Polygon")
                    mapping = getattr(shapely_geometry, "mapping")
                    shape = getattr(shapely_geometry, "shape")
                    coords = bridge_polygon.get("coordinates") or []
                    shell = coords[0] if len(coords) > 0 else None
                    holes = coords[1:] if len(coords) > 1 else []
                    if not shell:
                        raise ValueError("polygon_coordinates_missing")
                    poly = Polygon(shell, holes)
                    centerline_geojson = mapping(compute_centerline_from_polygon(poly))
                    centerline_geom = shape(centerline_geojson)
                    centerline_len = float(centerline_geom.length) if centerline_geom is not None else 0.0
                    if centerline_len > 0:
                        bridge_length = centerline_len
                        bridge_width = float(poly.area) / centerline_len
                except Exception as ex:
                    centerline_missing_reason = str(ex)
            if isinstance(properties, dict) and bridge_length is not None and properties.get("length") in (None, ""):
                properties["length"] = bridge_length
            if isinstance(properties, dict) and bridge_width is not None and properties.get("bridge_width") in (None, ""):
                properties["bridge_width"] = bridge_width

            input_params = {
                "workflow_status": WORKFLOW_STATUS_DEFAULT,
                "bridge_id": bridge_id,
                "bridge_length": bridge_length,
                "bridge_width": bridge_width,
                "bridge_polygon": bridge_polygon,
                "bridge_centerline": centerline_geojson,
                "bridge_centerline_missing": centerline_geojson is None,
                "bridge_centerline_missing_reason": centerline_missing_reason,
                "bridge_geometry_missing": geometry_missing,
                "bridge_geometry_missing_reason": geometry_missing_reason,
                "impact_scope": impact_scope,
                "bridge_vector": shp_path,
                "bridge_feature": {"bbox": bbox, "record_index": i + 1, "properties": properties},
                "source_doms": filtered_doms,
                "qa_feedback": []
            }
            unit = {
                "name": f"桥梁处理 - {bridge_id}",
                "type": "BRIDGE_REMOVAL_UNIT",
                "parentTaskId": parent_task_id,
                "inputParams": json.dumps(input_params)
            }
            units.append(unit)
            if count > 0 and (i == 0 or i == count - 1 or (i + 1) % report_every == 0):
                progress = 12 + int((i + 1) * 5 / count)
                progress = min(17, max(12, progress))
                self._report_progress(api_url, headers, "处理中", progress, f"SHP解析进度 {i+1}/{count}")
        self._log(f"从SHP文件中分解出 {len(units)} 个任务单元。")
        return units


    def _create_subtasks_via_api(self, api_url, headers, task_units):
        """通过API为每个任务单元创建子任务。"""
        created_tasks = []
        total = len(task_units) if task_units else 0
        report_every = 1
        if total >= 200:
            report_every = max(1, total // 20)
        elif total >= 50:
            report_every = max(1, total // 10)
        for unit in task_units:
            self._log(f"正在为 '{unit['name']}' 创建API任务...")
            try:
                response = requests.post(f"{api_url}/tasks", headers=headers, data=json.dumps(unit), timeout=15)
                response.raise_for_status()
                task_data = response.json()
                created_tasks.append(task_data)
                idx = len(created_tasks)
                if total > 0 and (idx == 1 or idx == total or idx % report_every == 0):
                    progress = 30 + int(45 * idx / total)
                    self._report_progress(api_url, headers, "处理中", progress, f"创建子任务中：{idx}/{total}")
                self._log(f"成功创建任务 {task_data.get('id')}。")
            except requests.exceptions.RequestException as e:
                raise RuntimeError(f"为 '{unit['name']}' 创建子任务时API调用失败: {e}")
        return created_tasks

    def _determine_initial_statuses(self, api_url, headers, tasks, order_strategy):
        """构建依赖图并确定每个任务的初始状态。"""
        if not tasks:
            return {}
            
        self._log("正在计算影响范围并构建依赖图...")
        units_with_scope = []
        for task in tasks:
            input_params = _parse_input_params(task.get("inputParams"))
            scope = input_params.get('impact_scope')
            if not scope:
                feature = input_params.get('bridge_feature')
                bbox = _extract_bbox_from_geometry(feature)
                scope = _polygon_from_bbox(bbox) if bbox else None
            bridge_id = input_params.get("bridge_id")
            units_with_scope.append({'id': task['id'], 'scope': scope, 'bridge_id': bridge_id})
        
        units_sorted = sorted(units_with_scope, key=lambda x: _bridge_sort_key(x.get("bridge_id")), reverse=(order_strategy == "DESC"))
        adj, in_degree = build_dependency_graph(units_sorted)
        self._create_dependencies_via_api(api_url, headers, adj)
        self._log(f"依赖图入度: {in_degree}")

        initial_statuses = {}
        for task_id, degree in in_degree.items():
            if degree == 0:
                workflow_status = "待处理"
            else:
                workflow_status = "已锁定"
            task_status = WORKFLOW_STATUS_MAP.get(workflow_status, "PENDING")
            initial_statuses[task_id] = {
                "task_status": task_status,
                "workflow_status": workflow_status
            }
        return initial_statuses

    def _get_subtasks_via_api(self, api_url, headers, task_id):
        response = requests.get(f"{api_url}/tasks/{task_id}/subtasks", headers=headers, timeout=30)
        response.raise_for_status()
        return response.json() or []

    def _delete_task_via_api(self, api_url, headers, task_id):
        if not task_id:
            return
        response = requests.delete(f"{api_url}/tasks/{task_id}", headers=headers, timeout=30)
        if response.status_code not in (200, 204):
            response.raise_for_status()

    def _clear_dependencies_via_api(self, api_url, headers, task_id):
        if not task_id:
            return
        response = requests.delete(f"{api_url}/tasks/{task_id}/dependencies", headers=headers, timeout=30)
        if response.status_code in (200, 204, 404):
            return
        response.raise_for_status()

    def _index_subtasks_by_bridge_id(self, subtasks):
        result = {}
        for t in subtasks or []:
            params = _parse_input_params(t.get("inputParams"))
            bridge_id = params.get("bridge_id")
            if bridge_id is None:
                continue
            key = str(bridge_id)
            if key not in result:
                result[key] = []
            result[key].append(t)
        return result

    def _recompute_scope_and_source_doms(self, api_url, headers, task_data, dom_sources, dom_index: _DomTileIndex):
        params = _parse_input_params(task_data.get("inputParams"))
        bridge_feature = params.get("bridge_feature") or {}
        bbox = bridge_feature.get("bbox") or _extract_bbox_from_geometry(bridge_feature)
        if not bbox:
            return

        candidate = dom_index.filter_by_bbox(bbox)
        if not candidate:
            candidate = dom_sources
        resolution = dom_index.min_resolution(candidate) or 0.5
        expand_distance = float(resolution) * 512.0
        expanded_bbox = _expand_bbox(bbox, expand_distance)
        impact_scope = _polygon_from_bbox(expanded_bbox)
        filtered = dom_index.filter_by_bbox(expanded_bbox)
        if not filtered:
            filtered = candidate

        updates = {"source_doms": filtered, "impact_scope": impact_scope}
        self._update_task_metadata_via_api(api_url, headers, task_data.get("id"), updates)

    def _create_dependencies_via_api(self, api_url, headers, adj):
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

    def _update_subtask_statuses_via_api(self, api_url, headers, initial_statuses):
        """通过API批量或逐个更新子任务的初始状态。"""
        self._log("正在通过API设置子任务的初始状态...")
        for task_id, status_info in initial_statuses.items():
            task_status = status_info.get("task_status", "PENDING")
            workflow_status = status_info.get("workflow_status", WORKFLOW_STATUS_DEFAULT)
            try:
                response = requests.patch(
                    f"{api_url}/tasks/{task_id}/status",
                    headers=headers,
                    params={"status": task_status},
                    timeout=15
                )
                response.raise_for_status()
                self._update_task_metadata_via_api(api_url, headers, task_id, {"workflow_status": workflow_status})
                self._log(f"成功将任务 {task_id} 状态更新为 '{task_status}'，流程状态为 '{workflow_status}'。")
            except requests.exceptions.RequestException as e:
                # 在实际生产中，这里可能需要一个补偿事务或重试逻辑
                raise RuntimeError(f"更新任务 {task_id} 状态为 '{task_status}' 时API调用失败: {e}")

    def _update_task_metadata_via_api(self, api_url, headers, task_id, updates):
        response = requests.get(f"{api_url}/tasks/{task_id}", headers=headers, timeout=15)
        response.raise_for_status()
        task_data = response.json()
        input_params = _parse_input_params(task_data.get("inputParams"))
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

class BridgeRemovalUnitProcessorTask(BaseTask):
    def execute(self):
        api_url, headers = self._get_api_config()
        task_data = self._get_task(api_url, headers, self.task_id)
        input_params = _parse_input_params(task_data.get("inputParams"))

        workflow_status = input_params.get("workflow_status") or WORKFLOW_STATUS_DEFAULT

        intermediate_path = input_params.get("intermediate_path") or f"./intermediate/{self.task_id}"
        os.makedirs(intermediate_path, exist_ok=True)
        if input_params.get("intermediate_path") != intermediate_path:
            self._update_task_input_params(api_url, headers, self.task_id, {"intermediate_path": intermediate_path})

        manifest = {
            "manifest_version": 1,
            "task_id": self.task_id,
            "steps": [],
            "artifacts": {
                "segments": [],
                "masks": {},
                "shadow": {},
                "final_mask_path": None,
                "writeback": {}
            }
        }

        merged_mask_path = os.path.join(intermediate_path, "merged_mask.png")
        inpainted_patch_path = os.path.join(intermediate_path, "inpainted_patch.tif")
        writeback_output_paths = []

        if workflow_status in ("待处理", "已锁定"):
            workflow_status = "处理中"
            self._update_workflow_status(api_url, headers, self.task_id, workflow_status)
            self._update_task_status(api_url, headers, self.task_id, "IN_PROGRESS")

        _merge_step_result(manifest, run_automation_processing(self.task_id, input_params))
        _merge_step_result(manifest, run_interactive_correction(self.task_id, input_params))

        if any((s or {}).get("status") == "failed" for s in (manifest.get("steps") or [])):
            self._update_task_output_results(api_url, headers, self.task_id, {"manifest": manifest})
            self._update_workflow_status(api_url, headers, self.task_id, "需修改")
            self._update_task_status(api_url, headers, self.task_id, "PAUSED")
            self.results["manifest"] = manifest
            return

        if "segments" not in manifest["artifacts"] or manifest["artifacts"]["segments"] is None:
            manifest["artifacts"]["segments"] = []

        manifest["steps"].append({"name": "merge_masks", "status": "completed"})
        manifest["artifacts"]["final_mask_path"] = merged_mask_path

        _merge_step_result(manifest, run_inpaint_fill(self.task_id, input_params))
        if "inpainted_patch_path" not in manifest["artifacts"]:
            manifest["artifacts"]["inpainted_patch_path"] = inpainted_patch_path

        _merge_step_result(manifest, run_write_back_to_dom(self.task_id, input_params))
        writeback_outputs = manifest["artifacts"].get("writeback_outputs")
        if writeback_outputs is None:
            writeback_outputs = writeback_output_paths
        manifest["artifacts"]["writeback"]["outputs"] = writeback_outputs
        if "writeback_outputs" in manifest["artifacts"]:
            del manifest["artifacts"]["writeback_outputs"]

        self._update_task_output_results(api_url, headers, self.task_id, {"manifest": manifest})
        self._update_workflow_status(api_url, headers, self.task_id, "待初检")
        self._update_task_status(api_url, headers, self.task_id, "PAUSED")

        self.results["manifest"] = manifest

    def preprocess_segmentation(self, api_url, headers, intermediate_root=None, overwrite=False, param_overrides=None):
        """执行分割预处理：准备环境、生成分段、更新Scope"""
        task_id = self.task_id
        
        # 1. 获取最新任务数据
        task_data = self._get_task(api_url, headers, task_id)
        input_params = _parse_input_params(task_data.get("inputParams"))
        if param_overrides:
            input_params.update(param_overrides)
        self.input_params = input_params

        # 2. 检查覆盖策略
        raw_output = task_data.get("outputResults") or "{}"
        output_results = raw_output if isinstance(raw_output, dict) else (json.loads(raw_output) if isinstance(raw_output, str) else {})
        if not overwrite and output_results.get("preprocess_manifest"):
            return False

        # 3. 准备环境 (路径、中心线、Config)
        bridge_id = input_params.get("bridge_id") or ""
        try:
            from bridge_removal.vector_reader import sanitize_id
            safe_bridge_id = sanitize_id(bridge_id) if sanitize_id else str(bridge_id).strip()
        except ImportError:
            safe_bridge_id = str(bridge_id).strip()
        if not safe_bridge_id:
            safe_bridge_id = str(task_id)

        default_root = intermediate_root or "./intermediate"
        intermediate_path = input_params.get("intermediate_path") or os.path.join(str(default_root), str(task_id), safe_bridge_id)
        
        if input_params.get("intermediate_path") != intermediate_path:
            self._update_task_input_params(api_url, headers, task_id, {"intermediate_path": intermediate_path})
            input_params["intermediate_path"] = intermediate_path
        
        if not os.path.exists(intermediate_path):
            os.makedirs(intermediate_path, exist_ok=True)

        # 计算中心线
        bridge_centerline = input_params.get("bridge_centerline") or input_params.get("bridge_centerline_geojson")
        bridge_polygon = input_params.get("bridge_polygon") or input_params.get("bridge_polygon_geojson")
        
        if not bridge_centerline and bridge_polygon:
            try:
                from bridge_removal.vector_reader import compute_centerline_from_polygon
                shapely_geometry = __import__("shapely.geometry", fromlist=["Polygon", "mapping"])
                Polygon = getattr(shapely_geometry, "Polygon")
                mapping = getattr(shapely_geometry, "mapping")
                coords = bridge_polygon.get("coordinates") or []
                shell = coords[0] if len(coords) > 0 else None
                holes = coords[1:] if len(coords) > 1 else []
                if shell:
                    poly = Polygon(shell, holes)
                    bridge_centerline = mapping(compute_centerline_from_polygon(poly))
                    self._update_task_input_params(api_url, headers, task_id, {"bridge_centerline": bridge_centerline})
                    input_params["bridge_centerline"] = bridge_centerline
            except Exception as ex:
                self._log(f"任务 {task_id} 计算中心线失败: {ex}")

        # 写入 config.json
        config_data = {
            "task_id": task_id,
            "bridge_id": bridge_id,
            "intermediate_path": intermediate_path,
            "bridge_polygon": bridge_polygon,
            "bridge_centerline": bridge_centerline,
            "source_doms": input_params.get("source_doms") or [],
            "max_side_px": input_params.get("preprocess_max_side_px") or 1024,
            "bridge_feature": input_params.get("bridge_feature")
        }
        try:
            with open(os.path.join(intermediate_path, "segmentation_config.json"), "w", encoding="utf-8") as f:
                json.dump(config_data, f, indent=2, ensure_ascii=False)
        except Exception as ex:
            self._log(f"任务 {task_id} 写入 config 失败: {ex}")

        # 4. 执行分割
        manifest = {"task_id": task_id, "steps": [], "artifacts": {}}
        try:
            process_result = run_automation_processing(task_id, input_params)
            _merge_step_result(manifest, process_result)

            # 5. 更新 Impact Scope
            if process_result.get("artifacts") and process_result["artifacts"].get("segments"):
                segments = process_result["artifacts"]["segments"]
                if segments:
                    min_x, min_y = float('inf'), float('inf')
                    max_x, max_y = float('-inf'), float('-inf')
                    has_valid_bbox = False
                    for seg in segments:
                        bbox = seg.get("bbox")
                        if bbox and len(bbox) >= 4:
                            min_x = min(min_x, bbox[0])
                            min_y = min(min_y, bbox[1])
                            max_x = max(max_x, bbox[2])
                            max_y = max(max_y, bbox[3])
                            has_valid_bbox = True
                    
                    if has_valid_bbox:
                        merged_bbox = [min_x, min_y, max_x, max_y]
                        new_impact_scope = _polygon_from_bbox(merged_bbox)
                        self._update_task_input_params(api_url, headers, task_id, {"impact_scope": new_impact_scope})
                        self._log(f"任务 {task_id} impact_scope 更新: {merged_bbox}")

            self._update_task_output_results(api_url, headers, task_id, {"preprocess_manifest": manifest})
            return True
        except Exception as ex:
            _merge_step_result(manifest, {"step": {"name": "preprocess_pipeline", "status": "failed"}, "error": str(ex), "artifacts": {}})
            self._update_task_output_results(api_url, headers, task_id, {"preprocess_manifest": manifest})
            self._log(f"任务 {task_id} 分割失败: {ex}")
            raise ex

    def _get_api_config(self):
        api_url = os.getenv("TASK_MANAGEMENT_API_URL")
        auth_token = os.getenv("AUTH_TOKEN")
        if not api_url or not auth_token:
            raise ValueError("环境变量 TASK_MANAGEMENT_API_URL 或 AUTH_TOKEN 未设置。")
        headers = {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
        return api_url, headers

    def _get_task(self, api_url, headers, task_id):
        response = requests.get(f"{api_url}/tasks/{task_id}", headers=headers, timeout=15)
        response.raise_for_status()
        return response.json()

    def _update_task_status(self, api_url, headers, task_id, task_status):
        response = requests.patch(
            f"{api_url}/tasks/{task_id}/status",
            headers=headers,
            params={"status": task_status},
            timeout=15
        )
        response.raise_for_status()

    def _update_workflow_status(self, api_url, headers, task_id, workflow_status):
        self._update_task_input_params(api_url, headers, task_id, {"workflow_status": workflow_status})

    def _update_task_input_params(self, api_url, headers, task_id, updates):
        response = requests.get(f"{api_url}/tasks/{task_id}", headers=headers, timeout=15)
        response.raise_for_status()
        task_data = response.json()
        input_params = _parse_input_params(task_data.get("inputParams"))
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

    def _update_task_output_results(self, api_url, headers, task_id, updates):
        response = requests.get(f"{api_url}/tasks/{task_id}", headers=headers, timeout=15)
        response.raise_for_status()
        task_data = response.json()
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

def _parse_input_params(raw_input_params):
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

def _get_task(api_url, headers, task_id):
    response = requests.get(f"{api_url}/tasks/{task_id}", headers=headers, timeout=15)
    response.raise_for_status()
    return response.json()

def _update_task_status(api_url, headers, task_id, task_status):
    response = requests.patch(
        f"{api_url}/tasks/{task_id}/status",
        headers=headers,
        params={"status": task_status},
        timeout=15
    )
    response.raise_for_status()

def _update_task_input_params(api_url, headers, task_id, updates):
    task_data = _get_task(api_url, headers, task_id)
    input_params = _parse_input_params(task_data.get("inputParams"))
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

def _update_task_output_results(api_url, headers, task_id, updates):
    task_data = _get_task(api_url, headers, task_id)
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

def _set_workflow_status(api_url, headers, task_id, workflow_status):
    task_status = WORKFLOW_STATUS_MAP.get(workflow_status, "PENDING")
    _update_task_status(api_url, headers, task_id, task_status)
    _update_task_input_params(api_url, headers, task_id, {"workflow_status": workflow_status})

def _build_unit_manifest(task_id, input_params):
    manifest = {"task_id": task_id, "steps": [], "artifacts": {}}
    _merge_step_result(manifest, run_automation_processing(task_id, input_params))
    _merge_step_result(manifest, run_interactive_correction(task_id, input_params))
    manifest["steps"].append({"name": "merge_masks", "status": "completed"})
    manifest["artifacts"]["merged_mask_path"] = os.path.join(input_params.get("intermediate_path") or f"./intermediate/{task_id}", "merged_mask.png")
    _merge_step_result(manifest, run_inpaint_fill(task_id, input_params))
    _merge_step_result(manifest, run_write_back_to_dom(task_id, input_params))
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
        unit_params = _parse_input_params(raw_input_params)
        if not unit_params.get("intermediate_path"):
            unit_params["intermediate_path"] = f"./intermediate/{task_id}"
            _update_task_input_params(api_url, headers, task_id, {"intermediate_path": unit_params["intermediate_path"]})

        _set_workflow_status(api_url, headers, task_id, "处理中")
        manifest = _build_unit_manifest(task_id, unit_params)
        _update_task_output_results(api_url, headers, task_id, {"manifest": manifest})
        _set_workflow_status(api_url, headers, task_id, "待初检")

        if simulate_rework and task_id == first_unit_id:
            qa_feedback = unit_params.get("qa_feedback") or []
            qa_feedback.append({"stage": "初检", "result": "不通过", "message": "需要补充修正"})
            _update_task_input_params(api_url, headers, task_id, {"qa_feedback": qa_feedback})
            _set_workflow_status(api_url, headers, task_id, "需修改")
            _set_workflow_status(api_url, headers, task_id, "待初检")

        _set_workflow_status(api_url, headers, task_id, "初检通过")
        _set_workflow_status(api_url, headers, task_id, "待终检")

        if simulate_final_reject and task_id == first_unit_id:
            qa_feedback = unit_params.get("qa_feedback") or []
            qa_feedback.append({"stage": "终检", "result": "不通过", "message": "终检抽查不通过"})
            _update_task_input_params(api_url, headers, task_id, {"qa_feedback": qa_feedback})
            _set_workflow_status(api_url, headers, task_id, "需修改")
        else:
            _set_workflow_status(api_url, headers, task_id, "已归档")

    _update_task_output_results(api_url, headers, batch_task_id, {"simulation": "completed"})

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
    input_params = _parse_input_params(task.get("inputParams"))
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
    task_status = WORKFLOW_STATUS_MAP.get(workflow_status, "PENDING")
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
        unit_params = _parse_input_params(task.get("inputParams"))
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
            qa_feedback = _parse_input_params(task.get("inputParams")).get("qa_feedback") or []
            qa_feedback.append({"stage": "终检", "result": "不通过", "message": "终检抽查不通过"})
            _local_update_task_input_params(task, {"qa_feedback": qa_feedback})
            _local_set_workflow_status(task, "需修改")
        else:
            _local_set_workflow_status(task, "已归档")

    _local_update_task_output_results(batch_task, {"simulation": "completed"})
    summary = []
    for task in subtasks:
        input_params = _parse_input_params(task.get("inputParams"))
        summary.append({
            "id": task.get("id"),
            "status": task.get("status"),
            "workflow_status": input_params.get("workflow_status")
        })
    return {
        "batch_id": batch_task.get("id"),
        "batch_status": batch_task.get("status"),
        "subtask_count": len(subtasks),
        "subtasks": summary
    }

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("用法: python bridge_removal_task.py <task_id> '<input_params_json>'")
        print("或:   python bridge_removal_task.py <task_id> '@<input_params_json_file>'")
        print("示例: python bridge_removal_task.py 'batch-uuid-123' '{\"shp_file_path\": \"d:/data/bridges.shp\"}'")
        sys.exit(1)

    task_id_arg = sys.argv[1]
    input_params_json_arg = sys.argv[2]

    try:
        if isinstance(input_params_json_arg, str) and input_params_json_arg.startswith("@"):
            file_path = input_params_json_arg[1:]
            with open(file_path, "r", encoding="utf-8") as f:
                input_params_json_arg = f.read()
        input_params_arg = json.loads(input_params_json_arg)
    except json.JSONDecodeError:
        print("错误: 输入参数不是有效的JSON字符串。")
        sys.exit(1)

    if input_params_arg.get("simulate_offline") or task_id_arg == "offline":
        summary = simulate_end_to_end_flow_local(input_params_arg)
        print(json.dumps(summary, ensure_ascii=False))
        sys.exit(0)

    if not os.getenv("TASK_MANAGEMENT_API_URL") or not os.getenv("AUTH_TOKEN"):
        print("\n错误: 请设置 TASK_MANAGEMENT_API_URL 和 AUTH_TOKEN 环境变量。")
        sys.exit(1)

    api_url = os.getenv("TASK_MANAGEMENT_API_URL")
    auth_token = os.getenv("AUTH_TOKEN")
    headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }
    try:
        response = requests.get(f"{api_url}/tasks/{task_id_arg}", headers=headers, timeout=15)
        response.raise_for_status()
        task_data = response.json()
        task_type = task_data.get("type")
    except requests.exceptions.RequestException as e:
        print(f"错误: 获取任务详情失败: {e}")
        sys.exit(1)

    if task_type == "BRIDGE_REMOVAL_BATCH":
        task = BridgeRemovalOrchestratorTask(task_id=task_id_arg, input_params=input_params_arg)
        task.run()
    elif task_type == "BRIDGE_REMOVAL_UNIT":
        task = BridgeRemovalUnitProcessorTask(task_id=task_id_arg, input_params=input_params_arg)
        task.run()
    else:
        print(f"错误: 不支持的任务类型: {task_type}")
        sys.exit(1)
