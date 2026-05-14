
import os
import sys
import json
import requests
import uuid
import time
from base_task import BaseTask
from services.status_mapping import to_platform_status, WORKFLOW_STATUS_DEFAULT
from services.geo_utils import expand_bbox, polygon_from_bbox, normalize_bbox, extract_bbox_from_geometry
from services.shp_utils import (
    validate_shp_components, list_dom_tiles, DomTileIndex,
    parse_strategy, bridge_sort_key,
    read_dbf_records, read_shp_record_bboxes, read_shp_record_geometries,
)
from services.tms_api import (
    parse_input_params, get_api_config, get_task as _api_get_task,
    update_task_status as _api_update_task_status,
    update_task_input_params as _api_update_task_input_params,
    update_task_output_results as _api_update_task_output_results,
    set_workflow_status as _api_set_workflow_status,
    get_subtasks as _api_get_subtasks,
    delete_task as _api_delete_task,
    clear_dependencies as _api_clear_dependencies,
    create_dependencies as _api_create_dependencies,
    report_progress as _api_report_progress,
    init_project_roles_and_permissions,
)
from services.dependency import build_dependency_graph, merge_step_result, filter_operation_subtasks
from services.simulation import simulate_end_to_end_flow, simulate_end_to_end_flow_local

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
            api_url, headers = get_api_config()
            simulate_end_to_end_flow(api_url, headers, self.input_params)
            self.results["simulation"] = "completed"
            return

        api_url, headers = get_api_config()
        
        # 清理历史运行信息（qa_feedback），确保只显示本次运行信息
        try:
            _api_update_task_input_params(api_url, headers, self.task_id, {"qa_feedback": []})
        except Exception as ex:
            self._log(f"清理历史运行信息失败(忽略): {ex}")

        _api_report_progress(api_url, headers, self.task_id, "处理中", 1, "开始分解：正在读取输入参数与DOM索引")
        shp_file_path = self.input_params.get("shp_file_path")
        if not shp_file_path:
            raise ValueError("输入参数 'shp_file_path' 未提供。")

        order_strategy = parse_strategy(self.input_params.get("decompose_order_strategy"), "ASC")
        overwrite_strategy = parse_strategy(self.input_params.get("decompose_overwrite_strategy"), "SKIP")

        dom_sources = self.input_params.get("source_doms")
        if not isinstance(dom_sources, list) or not dom_sources:
            dom_dir = self.input_params.get("dom_dir")
            dom_sources = list_dom_tiles(dom_dir)
        dom_index = DomTileIndex(dom_sources)
        _api_report_progress(api_url, headers, self.task_id, "处理中", 8, f"DOM索引就绪：候选DOM数量 {len(dom_sources)}")

        parent_task_id = self.input_params.get("project_id") or self.task_id
        _api_report_progress(api_url, headers, self.task_id, "处理中", 10, "开始检查已存在子任务")
        existing_subtasks = _api_get_subtasks(api_url, headers, parent_task_id)
        existing_subtasks = filter_operation_subtasks(existing_subtasks)
        existing_by_bridge_id = self._index_subtasks_by_bridge_id(existing_subtasks)

        task_units = self._create_task_units_from_shp(api_url, headers, shp_file_path, dom_sources, dom_index, parent_task_id)
        if not task_units:
            self.results["message"] = "SHP 文件中未找到有效要素，无法创建任务单元。"
            _api_report_progress(api_url, headers, self.task_id, "已归档", 100, "分解结束：SHP中未找到有效要素")
            return
        _api_report_progress(api_url, headers, self.task_id, "处理中", 18, f"SHP解析完成：桥梁要素数量 {len(task_units)}")

        units_to_create = []
        deleted_existing = 0
        skipped_existing = 0
        for unit in task_units:
            unit_params = parse_input_params(unit.get("inputParams"))
            bridge_id = unit_params.get("bridge_id")
            existed_list = existing_by_bridge_id.get(str(bridge_id)) if bridge_id is not None else None
            if existed_list:
                if overwrite_strategy == "OVERWRITE":
                    for existed in existed_list:
                        _api_delete_task(api_url, headers, existed.get("id"))
                        deleted_existing += 1
                    existing_by_bridge_id.pop(str(bridge_id), None)
                    units_to_create.append(unit)
                else:
                    skipped_existing += 1
                    continue
            else:
                units_to_create.append(unit)

        _api_report_progress(
            api_url,
            headers,
            self.task_id,
            "处理中",
            25,
            f"子任务生成计划：待创建 {len(units_to_create)}，覆盖删除 {deleted_existing}，跳过 {skipped_existing}"
        )

        if units_to_create:
            created_tasks = self._create_subtasks_via_api(api_url, headers, units_to_create)
        else:
            created_tasks = []
        created_task_ids = {t.get("id") for t in (created_tasks or []) if t and t.get("id")}

        all_subtasks = _api_get_subtasks(api_url, headers, parent_task_id)
        all_subtasks = filter_operation_subtasks(all_subtasks)
        if not all_subtasks:
            self.results["message"] = "未找到子任务（创建/获取失败）。"
            _api_report_progress(api_url, headers, self.task_id, "已归档", 100, "分解结束：未找到子任务（创建/获取失败）")
            return
        _api_report_progress(api_url, headers, self.task_id, "处理中", 78, f"子任务创建/获取完成：当前总数 {len(all_subtasks)}")

        # 1. 任务分解：确定需要创建、覆盖或跳过的任务单元
        initial_statuses = {}
        if overwrite_strategy == "OVERWRITE":
            for t in all_subtasks:
                try:
                    self._recompute_scope_and_source_doms(api_url, headers, t, dom_sources, dom_index)
                except Exception as ex:
                    self._log(f"更新子任务DOM/impact_scope失败: taskId={t.get('id')}, err={ex}")
            _api_report_progress(api_url, headers, self.task_id, "处理中", 88, "已更新子任务 impact_scope 与 source_doms")
        else:
            if created_task_ids:
                for t in all_subtasks:
                    if t.get("id") not in created_task_ids:
                        continue
                    try:
                        self._recompute_scope_and_source_doms(api_url, headers, t, dom_sources, dom_index)
                    except Exception as ex:
                        self._log(f"更新新增子任务DOM/impact_scope失败: taskId={t.get('id')}, err={ex}")
                _api_report_progress(api_url, headers, self.task_id, "处理中", 88, f"已更新新增子任务 impact_scope 与 source_doms（{len(created_task_ids)}）")
            else:
                _api_report_progress(api_url, headers, self.task_id, "处理中", 88, "未新增子任务：跳过策略")

        # 2. 分割步骤：作为分解的后续步骤执行
        # 分割步骤可能会更新任务的 impact_scope，因此必须在依赖计算之前执行
        preprocess_overwrite = (overwrite_strategy == "OVERWRITE")
        if preprocess_overwrite:
            ids = [t.get("id") for t in all_subtasks if t and t.get("id")]
            _api_report_progress(api_url, headers, self.task_id, "处理中", 90, f"开始分割{len(ids)}个子任务")
            self._run_segmentation_step(api_url, headers, ids, overwrite=True)
        else:
            ids = [t.get("id") for t in all_subtasks if t and t.get("id") in created_task_ids]
            if ids:
                _api_report_progress(api_url, headers, self.task_id, "处理中", 90, f"开始分割新增子任务{len(ids)}个")
                self._run_segmentation_step(api_url, headers, ids, overwrite=False)
            else:
                _api_report_progress(api_url, headers, self.task_id, "处理中", 90, "未新增子任务：跳过分割步骤")
        
        # 重新获取所有子任务，以确保 impact_scope 是分割步骤更新后的最新值
        all_subtasks = _api_get_subtasks(api_url, headers, parent_task_id)
        all_subtasks = filter_operation_subtasks(all_subtasks)

        # 3. 依赖构建与状态初始化
        rebuild_all = self.input_params.get("rebuild_dependencies_after_segmentation")
        if rebuild_all is None:
            rebuild_all = True
        if rebuild_all:
            for t in all_subtasks:
                try:
                    _api_clear_dependencies(api_url, headers, t.get("id"))
                except Exception as ex:
                    _api_report_progress(api_url, headers, self.task_id, "处理中", 92, f"清理子任务依赖失败: taskId={t.get('id')}, err={ex}")
            _api_report_progress(api_url, headers, self.task_id, "处理中", 92, "已清理旧依赖关系")

            initial_statuses = self._determine_initial_statuses(api_url, headers, all_subtasks, order_strategy)
            self._update_subtask_statuses_via_api(api_url, headers, initial_statuses)
            _api_report_progress(api_url, headers, self.task_id, "处理中", 98, "已构建依赖并设置子任务初始状态")

        self.results["created_subtask_count"] = len(units_to_create)
        self.results["subtask_initial_statuses"] = initial_statuses
        self._log(f"任务分解与分割完成：新建 {len(units_to_create)} 个子任务，当前总数 {len(all_subtasks)}。")
        _api_report_progress(
            api_url,
            headers,
            self.task_id,
            "处理中",
            100,
            f"分解与分割完成：新建 {len(units_to_create)} 个子任务，当前总数 {len(all_subtasks)}"
        )

    def _run_segmentation_step(self, api_url, headers, task_ids, overwrite=False):
        """执行分割步骤：批量生成分段数据包"""
        ids = [tid for tid in (task_ids or []) if tid]
        if not ids:
            return
        
        self._log("开始执行分割步骤（生成分段数据包）...")
        _api_report_progress(api_url, headers, self.task_id, "处理中", 90, f"开始执行分割步骤（生成分段数据包）...")
        
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
            _api_report_progress(api_url, headers, self.task_id, "处理中", 90, f"正在执行分割（生成数据包）：{idx+1}/{total}")
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
                _api_report_progress(api_url, headers, self.task_id, "处理中", 90, f"任务 {task_id} 分割失败: {err}")
                self._log(f"任务 {task_id} 分割失败: {err}")

        if errors:
            _api_update_task_output_results(api_url, headers, self.task_id, {"segmentation_errors": errors})
            raise RuntimeError(f"分割失败: {len(errors)}/{total}")

    def _update_impact_scope_from_preprocess(self, api_url, headers, task_id):
        task_data = _api_get_task(api_url, headers, task_id)
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
                bbox = normalize_bbox(bbox)
                min_x = min(min_x, bbox[0])
                min_y = min(min_y, bbox[1])
                max_x = max(max_x, bbox[2])
                max_y = max(max_y, bbox[3])
                has_valid_bbox = True
        if not has_valid_bbox:
            return False
        merged_bbox = [min_x, min_y, max_x, max_y]
        new_impact_scope = polygon_from_bbox(merged_bbox)
        _api_update_task_input_params(api_url, headers, task_id, {"impact_scope": new_impact_scope})
        return True

        
    def _determine_created_task_dependencies_and_statuses(self, api_url, headers, tasks, order_strategy, created_task_ids):
        if not tasks or not created_task_ids:
            return {}

        task_by_id = {t.get("id"): t for t in (tasks or []) if t and t.get("id")}
        units = []
        for t in tasks:
            tid = t.get("id")
            params = parse_input_params(t.get("inputParams"))
            scope = params.get("impact_scope")
            if not scope:
                feature = params.get("bridge_feature")
                bbox = extract_bbox_from_geometry(feature)
                scope = polygon_from_bbox(bbox) if bbox else None
            bridge_id = params.get("bridge_id")
            units.append({
                "id": tid,
                "bridge_id": bridge_id,
                "bbox": extract_bbox_from_geometry(scope),
                "is_created": tid in created_task_ids
            })

        units_sorted = sorted(units, key=lambda x: bridge_sort_key(x.get("bridge_id")), reverse=(order_strategy == "DESC"))
        adj = {u["id"]: [] for u in units_sorted}
        predecessors_for_created = {tid: set() for tid in created_task_ids}

        for i in range(len(units_sorted)):
            for j in range(i + 1, len(units_sorted)):
                left = units_sorted[i]
                right = units_sorted[j]
                if not bbox_overlaps(left.get("bbox"), right.get("bbox")):
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
            _api_create_dependencies(api_url, headers, created_adj)

        def _is_predecessor_satisfied(task_obj):
            if not task_obj:
                return False
            status = task_obj.get("status")
            if status == "COMPLETED":
                return True
            if task_obj.get("type") != "BRIDGE_REMOVAL_UNIT":
                return False
            params = parse_input_params(task_obj.get("inputParams"))
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
            task_status = to_platform_status(workflow_status)
            created_statuses[tid] = {"task_status": task_status, "workflow_status": workflow_status}
        return created_statuses


    def _create_task_units_from_shp(self, api_url, headers, shp_file_path, dom_sources, dom_index: DomTileIndex, parent_task_id):
        shp_path, shx_path, dbf_path = validate_shp_components(shp_file_path)
        self._log(f"正在从 '{shp_path}' 读取桥梁矢量特征（SHP）...")
        _api_report_progress(api_url, headers, self.task_id, "处理中", 12, "开始解析SHP桥梁要素")
        try:
            bboxes = read_shp_record_bboxes(shp_path)
            geoms = read_shp_record_geometries(shp_path)
            records = read_dbf_records(dbf_path)

        except Exception as e:
            raise IOError(f"读取或解析SHP文件 '{shp_path}' 失败: {e}")

        units = []
        count = min(len(bboxes), len(records))
        _api_report_progress(api_url, headers, self.task_id, "处理中", 13, f"SHP读取完成：记录数 {count}")
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
            expanded_bbox = expand_bbox(bbox, expand_distance)
            impact_scope = polygon_from_bbox(expanded_bbox)
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
                _api_report_progress(api_url, headers, self.task_id, "处理中", progress, f"SHP解析进度 {i+1}/{count}")
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
                    _api_report_progress(api_url, headers, self.task_id, "处理中", progress, f"创建子任务中：{idx}/{total}")
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
            input_params = parse_input_params(task.get("inputParams"))
            scope = input_params.get('impact_scope')
            if not scope:
                feature = input_params.get('bridge_feature')
                bbox = extract_bbox_from_geometry(feature)
                scope = polygon_from_bbox(bbox) if bbox else None
            bridge_id = input_params.get("bridge_id")
            units_with_scope.append({'id': task['id'], 'scope': scope, 'bridge_id': bridge_id})
        
        units_sorted = sorted(units_with_scope, key=lambda x: bridge_sort_key(x.get("bridge_id")), reverse=(order_strategy == "DESC"))
        adj, in_degree = build_dependency_graph(units_sorted)
        _api_create_dependencies(api_url, headers, adj)
        self._log(f"依赖图入度: {in_degree}")

        initial_statuses = {}
        for task_id, degree in in_degree.items():
            if degree == 0:
                workflow_status = "待处理"
            else:
                workflow_status = "已锁定"
            task_status = to_platform_status(workflow_status)
            initial_statuses[task_id] = {
                "task_status": task_status,
                "workflow_status": workflow_status
            }
        return initial_statuses


    def _index_subtasks_by_bridge_id(self, subtasks):
        result = {}
        for t in subtasks or []:
            params = parse_input_params(t.get("inputParams"))
            bridge_id = params.get("bridge_id")
            if bridge_id is None:
                continue
            key = str(bridge_id)
            if key not in result:
                result[key] = []
            result[key].append(t)
        return result

    def _recompute_scope_and_source_doms(self, api_url, headers, task_data, dom_sources, dom_index: DomTileIndex):
        params = parse_input_params(task_data.get("inputParams"))
        bridge_feature = params.get("bridge_feature") or {}
        bbox = bridge_feature.get("bbox") or extract_bbox_from_geometry(bridge_feature)
        if not bbox:
            return

        candidate = dom_index.filter_by_bbox(bbox)
        if not candidate:
            candidate = dom_sources
        resolution = dom_index.min_resolution(candidate) or 0.5
        expand_distance = float(resolution) * 512.0
        expanded_bbox = expand_bbox(bbox, expand_distance)
        impact_scope = polygon_from_bbox(expanded_bbox)
        filtered = dom_index.filter_by_bbox(expanded_bbox)
        if not filtered:
            filtered = candidate

        updates = {"source_doms": filtered, "impact_scope": impact_scope}
        _api_update_task_input_params(api_url, headers, task_data.get("id"), updates)


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
                _api_update_task_input_params(api_url, headers, task_id, {"workflow_status": workflow_status})
                self._log(f"成功将任务 {task_id} 状态更新为 '{task_status}'，流程状态为 '{workflow_status}'。")
            except requests.exceptions.RequestException as e:
                # 在实际生产中，这里可能需要一个补偿事务或重试逻辑
                raise RuntimeError(f"更新任务 {task_id} 状态为 '{task_status}' 时API调用失败: {e}")


class BridgeRemovalUnitProcessorTask(BaseTask):
    def execute(self):
        api_url, headers = get_api_config()
        task_data = _api_get_task(api_url, headers, self.task_id)
        input_params = parse_input_params(task_data.get("inputParams"))

        workflow_status = input_params.get("workflow_status") or WORKFLOW_STATUS_DEFAULT

        intermediate_path = input_params.get("intermediate_path") or f"./intermediate/{self.task_id}"
        os.makedirs(intermediate_path, exist_ok=True)
        if input_params.get("intermediate_path") != intermediate_path:
            _api_update_task_input_params(api_url, headers, self.task_id, {"intermediate_path": intermediate_path})

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
            _api_set_workflow_status(api_url, headers, self.task_id, workflow_status)
            _api_update_task_status(api_url, headers, self.task_id, "IN_PROGRESS")

        merge_step_result(manifest, run_automation_processing(self.task_id, input_params))
        merge_step_result(manifest, run_interactive_correction(self.task_id, input_params))

        if any((s or {}).get("status") == "failed" for s in (manifest.get("steps") or [])):
            _api_update_task_output_results(api_url, headers, self.task_id, {"manifest": manifest})
            _api_set_workflow_status(api_url, headers, self.task_id, "需修改")
            _api_update_task_status(api_url, headers, self.task_id, "PAUSED")
            self.results["manifest"] = manifest
            return

        if "segments" not in manifest["artifacts"] or manifest["artifacts"]["segments"] is None:
            manifest["artifacts"]["segments"] = []

        manifest["steps"].append({"name": "merge_masks", "status": "completed"})
        manifest["artifacts"]["final_mask_path"] = merged_mask_path

        merge_step_result(manifest, run_inpaint_fill(self.task_id, input_params))
        if "inpainted_patch_path" not in manifest["artifacts"]:
            manifest["artifacts"]["inpainted_patch_path"] = inpainted_patch_path

        merge_step_result(manifest, run_write_back_to_dom(self.task_id, input_params))
        writeback_outputs = manifest["artifacts"].get("writeback_outputs")
        if writeback_outputs is None:
            writeback_outputs = writeback_output_paths
        manifest["artifacts"]["writeback"]["outputs"] = writeback_outputs
        if "writeback_outputs" in manifest["artifacts"]:
            del manifest["artifacts"]["writeback_outputs"]

        _api_update_task_output_results(api_url, headers, self.task_id, {"manifest": manifest})
        _api_set_workflow_status(api_url, headers, self.task_id, "待初检")
        _api_update_task_status(api_url, headers, self.task_id, "PAUSED")

        self.results["manifest"] = manifest

    def preprocess_segmentation(self, api_url, headers, intermediate_root=None, overwrite=False, param_overrides=None):
        """执行分割预处理：准备环境、生成分段、更新Scope"""
        task_id = self.task_id
        
        # 1. 获取最新任务数据
        task_data = _api_get_task(api_url, headers, task_id)
        input_params = parse_input_params(task_data.get("inputParams"))
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
            _api_update_task_input_params(api_url, headers, task_id, {"intermediate_path": intermediate_path})
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
                    _api_update_task_input_params(api_url, headers, task_id, {"bridge_centerline": bridge_centerline})
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
            merge_step_result(manifest, process_result)

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
                        new_impact_scope = polygon_from_bbox(merged_bbox)
                        _api_update_task_input_params(api_url, headers, task_id, {"impact_scope": new_impact_scope})
                        self._log(f"任务 {task_id} impact_scope 更新: {merged_bbox}")

            _api_update_task_output_results(api_url, headers, task_id, {"preprocess_manifest": manifest})
            return True
        except Exception as ex:
            merge_step_result(manifest, {"step": {"name": "preprocess_pipeline", "status": "failed"}, "error": str(ex), "artifacts": {}})
            _api_update_task_output_results(api_url, headers, task_id, {"preprocess_manifest": manifest})
            self._log(f"任务 {task_id} 分割失败: {ex}")
            raise ex



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
