
import os
import sys
import json
import re
import requests
import uuid
import time
from typing import Optional
from datetime import datetime
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
    report_progress as _api_report_progress,
    init_project_roles_and_permissions,
)
from services.project_service import update_project_fields as _local_update_progress, get_subtasks_local as _local_get_subtasks, get_task_local as _local_get_task
from services.dependency import build_dependency_graph, merge_step_result, filter_operation_subtasks
from services.simulation import simulate_end_to_end_flow, simulate_end_to_end_flow_local

def _get_intermediate_root():
    root = os.getenv("BRS_INTERMEDIATE_ROOT")
    if root:
        return root
    return "./intermediate"

def _get_subtasks(api_url, headers, parent_task_id):
    result = _api_get_subtasks(api_url, headers, parent_task_id)
    if result:
        return result
    if not api_url:
        return _local_get_subtasks(parent_task_id)
    return []

def _get_task(api_url, headers, task_id):
    result = _api_get_task(api_url, headers, task_id)
    if result:
        return result
    if not api_url:
        return _local_get_task(task_id)
    return {}

def _update_task_input_params(api_url, headers, task_id, updates):
    _api_update_task_input_params(api_url, headers, task_id, updates)
    if not api_url and task_id and updates:
        from services.project_service import get_project, set_project
        project = get_project(task_id)
        if project:
            ip = project.get("input_params") or {}
            if isinstance(ip, str):
                try:
                    ip = json.loads(ip)
                except Exception:
                    ip = {}
            if not isinstance(ip, dict):
                ip = {}
            ip.update(updates)
            project["input_params"] = ip
            set_project(task_id, project)

def _update_task_output_results(api_url, headers, task_id, updates):
    _api_update_task_output_results(api_url, headers, task_id, updates)
    if not api_url and task_id and updates:
        from services.project_service import get_project, set_project
        project = get_project(task_id)
        if project:
            or_ = project.get("output_results") or {}
            if isinstance(or_, str):
                try:
                    or_ = json.loads(or_)
                except Exception:
                    or_ = {}
            if not isinstance(or_, dict):
                or_ = {}
            or_.update(updates)
            project["output_results"] = or_
            set_project(task_id, project)

def _delete_task_local(task_id):
    if not task_id:
        return
    from services.project_service import delete_project
    delete_project(task_id)

def run_automation_processing(task_id, input_params):
    intermediate_path = input_params.get("intermediate_path")
    if not intermediate_path:
        intermediate_root = input_params.get("intermediate_root")
        if not intermediate_root:
            parent_task_id = input_params.get("parent_task_id") or ""
            if parent_task_id:
                from services.project_service import get_project
                parent_project = get_project(parent_task_id)
                if parent_project:
                    parent_ip = parent_project.get("input_params") or {}
                    if isinstance(parent_ip, str):
                        try:
                            parent_ip = json.loads(parent_ip)
                        except (json.JSONDecodeError, TypeError):
                            parent_ip = {}
                    intermediate_root = parent_ip.get("intermediate_root")
        if not intermediate_root:
            intermediate_root = _get_intermediate_root()
        parent_task_id = input_params.get("parent_task_id") or ""
        bridge_id = input_params.get("bridge_id") or ""
        safe_bridge_id = re.sub(r'[^\w\-.]', '_', str(bridge_id)) if bridge_id else "bridge"
        project_dir = str(parent_task_id) if parent_task_id else ""
        intermediate_path = os.path.join(intermediate_root, project_dir, str(task_id), safe_bridge_id)
    intermediate_path = os.path.normpath(intermediate_path)
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

    def _report_progress(self, api_url, headers, task_id, workflow_status, progress, message):
        if api_url:
            _api_report_progress(api_url, headers, task_id, workflow_status, progress, message)
        try:
            _local_update_progress(task_id, {"progress": int(progress) if progress is not None else 0})
        except Exception:
            pass
        try:
            from services.project_service import get_project
            project = get_project(task_id)
            if project:
                ip = project.get("input_params") or {}
                if isinstance(ip, str):
                    try:
                        ip = json.loads(ip)
                    except Exception:
                        ip = {}
                if not isinstance(ip, dict):
                    ip = {}
                qa_feedback = ip.get("qa_feedback") or []
                qa_feedback.append({
                    "stage": "分解",
                    "result": "INFO",
                    "message": message,
                    "at": datetime.now().isoformat(),
                    "by": "system",
                })
                ip["qa_feedback"] = qa_feedback
                _local_update_progress(task_id, {"input_params": ip})
        except Exception:
            pass

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
            _update_task_input_params(api_url, headers, self.task_id, {"qa_feedback": []})
        except Exception as ex:
            self._log(f"清理历史运行信息失败(忽略): {ex}")

        self._report_progress(api_url, headers, self.task_id, "处理中", 1, "开始分解：正在读取输入参数与DOM索引")
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
        self._report_progress(api_url, headers, self.task_id, "处理中", 8, f"DOM索引就绪：候选DOM数量 {len(dom_sources)}")

        parent_task_id = self.input_params.get("project_id") or self.task_id
        self._report_progress(api_url, headers, self.task_id, "处理中", 10, "开始检查已存在子任务")

        is_overwrite = overwrite_strategy in ("OVERWRITE", "OVERWRITE_PENDING")
        if is_overwrite:
            all_existing_raw = _get_subtasks(api_url, headers, parent_task_id)
            existing_subtasks = [t for t in (all_existing_raw or []) if (t.get("category") or "").upper() != "SYSTEM_TASK"]
            self._log(f"覆盖策略={overwrite_strategy}，已清除过滤条件（保留SYSTEM_TASK），获取 {len(existing_subtasks)} 个操作子任务")
        else:
            existing_subtasks = _get_subtasks(api_url, headers, parent_task_id)
            existing_subtasks = filter_operation_subtasks(existing_subtasks)
        existing_by_bridge_id = self._index_subtasks_by_bridge_id(existing_subtasks)

        task_units = self._create_task_units_from_shp(api_url, headers, shp_file_path, dom_sources, dom_index, parent_task_id)
        if not task_units:
            self.results["message"] = "SHP 文件中未找到有效要素，无法创建任务单元。"
            self._report_progress(api_url, headers, self.task_id, "已归档", 100, "分解结束：SHP中未找到有效要素")
            return
        self._report_progress(api_url, headers, self.task_id, "处理中", 18, f"SHP解析完成：桥梁要素数量 {len(task_units)}")

        units_to_create = []
        deleted_existing = 0
        skipped_existing = 0
        ids_to_delete = []
        subtask_dirs_to_stage = []

        from services.decompose_transaction import DecomposeTransaction
        txn = DecomposeTransaction(operation_name=overwrite_strategy)

        try:
            txn.begin()

            if overwrite_strategy == "OVERWRITE":
                matched_bridge_ids = set()
                for unit in task_units:
                    unit_params = parse_input_params(unit.get("inputParams"))
                    bid = unit_params.get("bridge_id")
                    if bid is not None:
                        matched_bridge_ids.add(str(bid))

                for existed in existing_subtasks:
                    params = parse_input_params(existed.get("inputParams"))
                    bid = str(params.get("bridge_id", ""))
                    ids_to_delete.append(existed.get("id"))
                    sub_dirs = self._resolve_subtask_intermediate_dirs(existed, api_url)
                    if sub_dirs:
                        subtask_dirs_to_stage.extend(sub_dirs)

                for unit in task_units:
                    units_to_create.append(unit)

                existing_by_bridge_id.clear()

            elif overwrite_strategy == "OVERWRITE_PENDING":
                for unit in task_units:
                    unit_params = parse_input_params(unit.get("inputParams"))
                    bridge_id = unit_params.get("bridge_id")
                    existed_list = existing_by_bridge_id.get(str(bridge_id)) if bridge_id is not None else None
                    if existed_list:
                        pending = [e for e in existed_list if (e.get("status") or "").upper() in ("PENDING", "CREATED", "")]
                        non_pending = [e for e in existed_list if e not in pending]
                        for existed in pending:
                            ids_to_delete.append(existed.get("id"))
                            sub_dirs = self._resolve_subtask_intermediate_dirs(existed, api_url)
                            if sub_dirs:
                                subtask_dirs_to_stage.extend(sub_dirs)
                        if pending:
                            existing_by_bridge_id.pop(str(bridge_id), None)
                            units_to_create.append(unit)
                        else:
                            skipped_existing += len(non_pending)
                    else:
                        units_to_create.append(unit)
            else:
                for unit in task_units:
                    unit_params = parse_input_params(unit.get("inputParams"))
                    bridge_id = unit_params.get("bridge_id")
                    existed_list = existing_by_bridge_id.get(str(bridge_id)) if bridge_id is not None else None
                    if existed_list:
                        skipped_existing += 1
                        continue
                    else:
                        units_to_create.append(unit)

            self._report_progress(
                api_url,
                headers,
                self.task_id,
                "处理中",
                20,
                f"子任务生成计划：待创建 {len(units_to_create)}，覆盖删除 {len(ids_to_delete)}，跳过 {skipped_existing}"
            )

            deduped_dirs = []
            seen = set()
            for d in subtask_dirs_to_stage:
                norm = os.path.normpath(d)
                if norm in seen:
                    continue
                is_subpath = any(norm.startswith(s + os.sep) for s in seen)
                if is_subpath:
                    continue
                seen.add(norm)
                deduped_dirs.append(norm)

            for sub_dir in deduped_dirs:
                if os.path.exists(sub_dir):
                    try:
                        txn.stage_delete_path(sub_dir)
                        self._log(f"已暂存待删除目录: {sub_dir}")
                    except Exception as stage_ex:
                        self._log(f"暂存删除目录失败: {sub_dir}, err={stage_ex}")

            if ids_to_delete:
                try:
                    txn.stage_delete_db_records(ids_to_delete, api_url, headers)
                    deleted_existing = len(ids_to_delete)
                    self._log(f"已事务性删除 {deleted_existing} 个子任务DB记录")
                except Exception as del_ex:
                    self._log(f"事务性删除子任务失败，正在回滚: {del_ex}")
                    txn.rollback()
                    raise RuntimeError(f"覆盖删除子任务失败（已回滚）: {del_ex}")

            if units_to_create:
                created_tasks = self._create_subtasks_local(units_to_create)
            else:
                created_tasks = []

            for ct in (created_tasks or []):
                if ct and ct.get("id"):
                    txn._created_task_ids.append(ct["id"])

            txn.commit()
            self._log(f"事务已提交：删除 {deleted_existing}，新建 {len(units_to_create)}")
        except Exception as txn_ex:
            if not txn.is_rolled_back:
                txn.rollback()
            self._log(f"覆盖操作事务回滚完成: {txn_ex}")
            raise

        created_task_ids = {t.get("id") for t in (created_tasks or []) if t and t.get("id")}

        all_subtasks = _get_subtasks(api_url, headers, parent_task_id)
        all_subtasks = filter_operation_subtasks(all_subtasks)
        if not all_subtasks:
            self.results["message"] = "未找到子任务（创建/获取失败）。"
            self._report_progress(api_url, headers, self.task_id, "已归档", 100, "分解结束：未找到子任务（创建/获取失败）")
            return
        self._report_progress(api_url, headers, self.task_id, "处理中", 78, f"子任务创建/获取完成：当前总数 {len(all_subtasks)}")

        # 1. 任务分解：确定需要创建、覆盖或跳过的任务单元
        initial_statuses = {}
        if overwrite_strategy == "OVERWRITE":
            for t in all_subtasks:
                try:
                    self._recompute_scope_and_source_doms(api_url, headers, t, dom_sources, dom_index)
                except Exception as ex:
                    self._log(f"更新子任务DOM/impact_scope失败: taskId={t.get('id')}, err={ex}")
            self._report_progress(api_url, headers, self.task_id, "处理中", 88, "已更新子任务 impact_scope 与 source_doms")
        elif overwrite_strategy == "OVERWRITE_PENDING":
            for t in all_subtasks:
                if t.get("id") in created_task_ids or (t.get("status") or "").upper() in ("PENDING", "CREATED", ""):
                    try:
                        self._recompute_scope_and_source_doms(api_url, headers, t, dom_sources, dom_index)
                    except Exception as ex:
                        self._log(f"更新子任务DOM/impact_scope失败: taskId={t.get('id')}, err={ex}")
            self._report_progress(api_url, headers, self.task_id, "处理中", 88, "已更新新增及待处理子任务 impact_scope 与 source_doms")
        else:
            if created_task_ids:
                for t in all_subtasks:
                    if t.get("id") not in created_task_ids:
                        continue
                    try:
                        self._recompute_scope_and_source_doms(api_url, headers, t, dom_sources, dom_index)
                    except Exception as ex:
                        self._log(f"更新新增子任务DOM/impact_scope失败: taskId={t.get('id')}, err={ex}")
                self._report_progress(api_url, headers, self.task_id, "处理中", 88, f"已更新新增子任务 impact_scope 与 source_doms（{len(created_task_ids)}）")
            else:
                self._report_progress(api_url, headers, self.task_id, "处理中", 88, "未新增子任务：跳过策略")

        # 2. 分割步骤：作为分解的后续步骤执行
        # 分割步骤可能会更新任务的 impact_scope，因此必须在依赖计算之前执行
        preprocess_overwrite = (overwrite_strategy == "OVERWRITE")
        if preprocess_overwrite:
            ids = [t.get("id") for t in all_subtasks if t and t.get("id")]
            self._report_progress(api_url, headers, self.task_id, "处理中", 90, f"开始分割{len(ids)}个子任务")
            self._run_segmentation_step(api_url, headers, ids, overwrite=True)
        elif overwrite_strategy == "OVERWRITE_PENDING":
            pending_or_created = [t.get("id") for t in all_subtasks if t and t.get("id") and (t.get("id") in created_task_ids or (t.get("status") or "").upper() in ("PENDING", "CREATED", ""))]
            if pending_or_created:
                self._report_progress(api_url, headers, self.task_id, "处理中", 90, f"开始分割新增及待处理子任务{len(pending_or_created)}个")
                self._run_segmentation_step(api_url, headers, pending_or_created, overwrite=True)
            else:
                self._report_progress(api_url, headers, self.task_id, "处理中", 90, "无待处理子任务：跳过分割步骤")
        else:
            ids = [t.get("id") for t in all_subtasks if t and t.get("id") in created_task_ids]
            if ids:
                self._report_progress(api_url, headers, self.task_id, "处理中", 90, f"开始分割新增子任务{len(ids)}个")
                self._run_segmentation_step(api_url, headers, ids, overwrite=False)
            else:
                self._report_progress(api_url, headers, self.task_id, "处理中", 90, "未新增子任务：跳过分割步骤")
        
        # 2.5 掩膜生成步骤（根据用户选择决定是否执行）
        mask_gen_strategy = parse_strategy(self.input_params.get("decompose_mask_generate"), "AUTO")
        if mask_gen_strategy != "SKIP":
            all_subtasks_for_mask = _get_subtasks(api_url, headers, parent_task_id)
            all_subtasks_for_mask = filter_operation_subtasks(all_subtasks_for_mask)
            mask_ids = [t.get("id") for t in all_subtasks_for_mask if t and t.get("id")]
            if mask_ids:
                self._report_progress(api_url, headers, self.task_id, "处理中", 92, f"开始掩膜生成{len(mask_ids)}个子任务")
                self._run_mask_generation_step(api_url, headers, mask_ids)
            else:
                self._report_progress(api_url, headers, self.task_id, "处理中", 92, "无子任务：跳过掩膜生成步骤")
        else:
            self._report_progress(api_url, headers, self.task_id, "处理中", 92, "跳过掩膜生成步骤（用户选择）")

        # 重新获取所有子任务，以确保 impact_scope 是分割步骤更新后的最新值
        all_subtasks = _get_subtasks(api_url, headers, parent_task_id)
        all_subtasks = filter_operation_subtasks(all_subtasks)

        # 3. 依赖构建与状态初始化
        rebuild_all = self.input_params.get("rebuild_dependencies_after_segmentation")
        if rebuild_all is None:
            rebuild_all = True
        if rebuild_all:
            self._report_progress(api_url, headers, self.task_id, "处理中", 92, "开始构建依赖关系")

            initial_statuses = self._determine_initial_statuses(api_url, headers, all_subtasks, order_strategy)
            self._update_subtask_statuses_via_api(api_url, headers, initial_statuses)
            self._report_progress(api_url, headers, self.task_id, "处理中", 98, "已构建依赖并设置子任务初始状态")

        self.results["created_subtask_count"] = len(units_to_create)
        self.results["total_subtask_count"] = len(all_subtasks)
        self.results["subtask_initial_statuses"] = initial_statuses
        self._log(f"任务分解与分割完成：新建 {len(units_to_create)} 个子任务，当前总数 {len(all_subtasks)}。")
        self._report_progress(
            api_url,
            headers,
            self.task_id,
            "处理中",
            100,
            f"分解与分割完成：新建 {len(units_to_create)} 个子任务，当前总数 {len(all_subtasks)}"
        )

        if parent_task_id != self.task_id:
            try:
                _local_update_progress(parent_task_id, {"status": "IN_PROGRESS", "progress": 0})
                self._log(f"已更新原始项目 {parent_task_id} 状态为 IN_PROGRESS")
            except Exception as ex:
                self._log(f"更新原始项目 {parent_task_id} 状态失败: {ex}")

    def _run_segmentation_step(self, api_url, headers, task_ids, overwrite=False):
        """执行分割步骤：批量生成分段数据包"""
        ids = [tid for tid in (task_ids or []) if tid]
        if not ids:
            return
        
        self._log("开始执行分割步骤（生成分段数据包）...")
        self._report_progress(api_url, headers, self.task_id, "处理中", 90, f"开始执行分割步骤（生成分段数据包）...")
        
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
            self._report_progress(api_url, headers, self.task_id, "处理中", 90, f"正在执行分割（生成数据包）：{idx+1}/{total}")
            err = None
            try:
                if api_url:
                    resp = requests.post(
                        f"{api_url}/tasks/{task_id}/preprocess-generate",
                        headers=headers,
                        json={"max_side_px": max_side_px, "overwrite": overwrite},
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
                    from services.project_service import get_project
                    subtask = get_project(task_id)
                    if subtask:
                        sub_params = subtask.get("input_params", {})
                        if isinstance(sub_params, str):
                            try:
                                sub_params = json.loads(sub_params)
                            except Exception:
                                sub_params = {}
                        sub_intermediate_root = sub_params.get("intermediate_root") or self.input_params.get("intermediate_root")
                        unit_task = BridgeRemovalUnitProcessorTask(task_id=task_id, input_params=sub_params)
                        result = unit_task.preprocess_segmentation(
                            api_url=None,
                            headers=None,
                            intermediate_root=sub_intermediate_root,
                            overwrite=False,
                            param_overrides={"preprocess_max_side_px": max_side_px},
                        )
                        if result is None:
                            err = "preprocess_segmentation returned None (unexpected)"
                    else:
                        err = f"subtask {task_id} not found in local db"
                if not err:
                    try:
                        self._update_impact_scope_from_preprocess(api_url, headers, task_id)
                    except Exception as ex:
                        err = str(ex)
            except Exception as ex:
                err = str(ex)
            if err:
                errors.append({"task_id": task_id, "error": err})
                self._report_progress(api_url, headers, self.task_id, "处理中", 90, f"任务 {task_id} 分割失败: {err}")
                self._log(f"任务 {task_id} 分割失败: {err}")

        if errors:
            _update_task_output_results(api_url, headers, self.task_id, {"segmentation_errors": errors})
            raise RuntimeError(f"分割失败: {len(errors)}/{total}")

    def _run_mask_generation_step(self, api_url, headers, task_ids):
        """分割完成后批量执行掩膜生成"""
        ids = [tid for tid in (task_ids or []) if tid]
        if not ids:
            return

        self._log("开始执行掩膜生成步骤...")
        self._report_progress(api_url, headers, self.task_id, "处理中", 94, "开始执行掩膜生成步骤...")

        enable_shadow = bool(self.input_params.get("enable_shadow", False))

        timeout_seconds = self.input_params.get("preprocess_api_timeout_sec") or 300
        try:
            timeout_seconds = int(timeout_seconds)
        except Exception:
            timeout_seconds = 300

        total = len(ids)
        errors = []
        for idx, task_id in enumerate(ids):
            self._report_progress(api_url, headers, self.task_id, "处理中", 94, f"正在生成掩膜：{idx+1}/{total}")
            err = None
            try:
                if api_url:
                    resp = requests.post(
                        f"{api_url}/tasks/{task_id}/mask-generate",
                        headers=headers,
                        json={"inputParams": {"enable_shadow": enable_shadow}},
                        timeout=timeout_seconds,
                    )
                    if resp.status_code not in (200, 201):
                        err = f"HTTP {resp.status_code}"
                    else:
                        data = resp.json() if resp.content else {}
                        result_data = data.get("data") or data
                        mask_manifest = result_data.get("maskManifest") or result_data.get("mask_manifest") or {}
                        if mask_manifest.get("error"):
                            err = str(mask_manifest["error"])
                else:
                    from services.project_service import get_project
                    subtask = get_project(task_id)
                    if subtask:
                        sub_params = subtask.get("input_params", {})
                        if isinstance(sub_params, str):
                            try:
                                sub_params = json.loads(sub_params)
                            except Exception:
                                sub_params = {}
                        task_dir = sub_params.get("intermediate_path")
                        if not task_dir:
                            intermediate_root = sub_params.get("intermediate_root")
                            if not intermediate_root:
                                intermediate_root = _get_intermediate_root()
                            parent_task_id = subtask.get("parent_task_id") or sub_params.get("parent_task_id") or ""
                            bridge_id = sub_params.get("bridge_id") or ""
                            safe_bridge_id = re.sub(r'[^\w\-.]', '_', str(bridge_id)) if bridge_id else "bridge"
                            project_dir = str(parent_task_id) if parent_task_id else ""
                            task_dir = os.path.join(intermediate_root, project_dir, str(task_id), safe_bridge_id)
                        task_dir = os.path.normpath(task_dir)
                        segments_dir = os.path.join(task_dir, "segments")
                        masks_dir = os.path.join(task_dir, "masks")
                        os.makedirs(masks_dir, exist_ok=True)
                        if os.path.isdir(segments_dir):
                            from bridge_removal.mask_pipeline import (
                                generate_bridge_masks,
                                generate_bridge_masks_from_json,
                                is_big_bridge,
                                _sam2_available,
                                run_mask_generation,
                            )
                            sam2_ok = _sam2_available()
                            seg_json_files = [
                                os.path.join(segments_dir, f)
                                for f in os.listdir(segments_dir)
                                if f.lower().endswith(".json") and not f.endswith("_segments.json")
                            ]
                            if sam2_ok and seg_json_files:
                                for seg_json_path in seg_json_files:
                                    try:
                                        with open(seg_json_path, "r", encoding="utf-8") as _f:
                                            seg_data = json.load(_f)
                                        big = is_big_bridge(seg_data)
                                    except Exception:
                                        big = False
                                    if big:
                                        payload = {
                                            "segment_json_path": seg_json_path,
                                            "task_id": task_id,
                                        }
                                        payload_text = json.dumps(payload, ensure_ascii=False)
                                        try:
                                            run_mask_generation(task_id, payload_text)
                                        except Exception as _ex:
                                            self._log(f"SAM2 pipeline failed for {seg_json_path}, falling back: {_ex}")
                                            generate_bridge_masks_from_json(seg_json_path, masks_dir, enable_shadow=enable_shadow)
                                    else:
                                        generate_bridge_masks_from_json(seg_json_path, masks_dir, enable_shadow=enable_shadow)
                            else:
                                generate_bridge_masks(segments_dir, masks_dir, enable_shadow=enable_shadow)
                        else:
                            err = "segments directory not found"
                    else:
                        err = f"subtask {task_id} not found in local db"
            except Exception as ex:
                err = str(ex)
            if err:
                errors.append({"task_id": task_id, "error": err})
                self._report_progress(api_url, headers, self.task_id, "处理中", 94, f"任务 {task_id} 掩膜生成失败: {err}")
                self._log(f"任务 {task_id} 掩膜生成失败: {err}")

        if errors:
            _update_task_output_results(api_url, headers, self.task_id, {"mask_generation_errors": errors})
            self._log(f"掩膜生成部分失败: {len(errors)}/{total}")

    def _update_impact_scope_from_preprocess(self, api_url, headers, task_id):
        task_data = _get_task(api_url, headers, task_id)
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
        _update_task_input_params(api_url, headers, task_id, {"impact_scope": new_impact_scope})
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
            self._log("依赖关系仅在本地记录，不向 TMS 注册")

        def _is_predecessor_satisfied(task_obj):
            if not task_obj:
                return True
            status = task_obj.get("status")
            if status == "COMPLETED":
                return True
            if task_obj.get("type") != "BRIDGE_REMOVAL_UNIT":
                return True
            params = parse_input_params(task_obj.get("inputParams"))
            ws = params.get("workflow_status")
            if ws in ("处理中", "需修改"):
                return False
            return True

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
        self._report_progress(api_url, headers, self.task_id, "处理中", 12, "开始解析SHP桥梁要素")
        try:
            bboxes = read_shp_record_bboxes(shp_path)
            geoms = read_shp_record_geometries(shp_path)
            records = read_dbf_records(dbf_path)

        except Exception as e:
            raise IOError(f"读取或解析SHP文件 '{shp_path}' 失败: {e}")

        units = []
        count = min(len(bboxes), len(records))
        self._report_progress(api_url, headers, self.task_id, "处理中", 13, f"SHP读取完成：记录数 {count}")
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
            intermediate_root = self.input_params.get("intermediate_root") or _get_intermediate_root()
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
                "intermediate_root": intermediate_root,
                "parent_task_id": parent_task_id,
                "qa_feedback": []
            }
            unit = {
                "name": f"桥梁处理 - {bridge_id}",
                "task_type": "BRIDGE_REMOVAL_UNIT",
                "parent_task_id": parent_task_id,
                "input_params": json.dumps(input_params)
            }
            units.append(unit)
            if count > 0 and (i == 0 or i == count - 1 or (i + 1) % report_every == 0):
                progress = 12 + int((i + 1) * 5 / count)
                progress = min(17, max(12, progress))
                self._report_progress(api_url, headers, self.task_id, "处理中", progress, f"SHP解析进度 {i+1}/{count}")
        self._log(f"从SHP文件中分解出 {len(units)} 个任务单元。")
        return units


    def _create_subtasks_local(self, task_units):
        from services.project_service import set_project, get_project
        created_tasks = []
        total = len(task_units) if task_units else 0
        report_every = 1
        if total >= 200:
            report_every = max(1, total // 20)
        elif total >= 50:
            report_every = max(1, total // 10)
        for unit in task_units:
            subtask_id = unit.get("id") or str(uuid.uuid4())
            unit["id"] = subtask_id
            subtask = {
                "project_id": subtask_id,
                "name": unit.get("name", ""),
                "task_name": unit.get("name", ""),
                "task_type": unit.get("task_type", "BRIDGE_REMOVAL_UNIT"),
                "category": "SUBTASK",
                "status": "PENDING",
                "priority": unit.get("priority", 5),
                "input_params": unit.get("input_params", {}),
                "output_results": None,
                "parent_task_id": unit.get("parent_task_id") or self.task_id,
                "assignee_id": unit.get("assignee_id"),
                "project_leader_id": unit.get("assignee_id"),
                "department_id": unit.get("department_id"),
                "department_name": unit.get("department_name"),
                "created_by_name": unit.get("created_by_name"),
                "created_department_id": unit.get("created_department_id"),
                "created_department_name": unit.get("created_department_name"),
                "progress": 0,
            }
            set_project(subtask_id, subtask)
            created_tasks.append({"id": subtask_id, **unit})
            idx = len(created_tasks)
            if total > 0 and (idx == 1 or idx == total or idx % report_every == 0):
                progress = 30 + int(45 * idx / total)
                self._report_progress(None, None, self.task_id, "处理中", progress, f"创建子任务中：{idx}/{total}")
            self._log(f"本地创建子任务 {subtask_id}")
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
        self._log("本地模式：依赖关系仅在本地记录，不向 TMS 注册")
        self._log(f"依赖图入度: {in_degree}")

        try:
            from services.overlap_service import rebuild_overlaps_for_parent
            from services.project_service import get_subtasks_local
            siblings = get_subtasks_local(self.task_id)
            rebuild_overlaps_for_parent(self.task_id, siblings)
            self._log(f"已重建重叠关系记录: parent={self.task_id}, 兄弟数={len(siblings)}")
        except Exception as ex:
            self._log(f"重建重叠关系失败: {ex}")

        initial_statuses = {}
        for task_id, degree in in_degree.items():
            workflow_status = "待处理"
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

    def _resolve_subtask_intermediate_dirs(self, subtask: dict, api_url) -> list:
        params = parse_input_params(subtask.get("inputParams") or subtask.get("input_params"))
        result = []
        intermediate_path = params.get("intermediate_path")
        if intermediate_path and os.path.isdir(intermediate_path):
            result.append(os.path.normpath(intermediate_path))
        task_id = subtask.get("id") or subtask.get("project_id") or ""
        if not task_id:
            return result
        intermediate_root = params.get("intermediate_root")
        if not intermediate_root:
            parent_task_id = subtask.get("parent_task_id") or self.input_params.get("project_id") or self.task_id
            if parent_task_id:
                parent_data = _get_task(api_url, None, parent_task_id) if api_url else None
                if not parent_data and not api_url:
                    from services.project_service import get_project
                    parent_proj = get_project(parent_task_id)
                    if parent_proj:
                        parent_data = parent_proj
                if parent_data:
                    parent_ip = parse_input_params(parent_data.get("inputParams") or parent_data.get("input_params"))
                    intermediate_root = parent_ip.get("intermediate_root")
        if not intermediate_root:
            intermediate_root = _get_intermediate_root()
        bridge_id = params.get("bridge_id") or ""
        safe_bridge_id = re.sub(r'[^\w\-.]', '_', str(bridge_id)) if bridge_id else "bridge"
        parent_task_id = subtask.get("parent_task_id") or ""
        project_dir = str(parent_task_id) if parent_task_id else ""
        task_dir = os.path.normpath(os.path.join(str(intermediate_root), project_dir, str(task_id)))
        if os.path.isdir(task_dir) and task_dir not in result:
            result.append(task_dir)
        inner_dir = os.path.join(task_dir, safe_bridge_id)
        if os.path.isdir(inner_dir) and inner_dir not in result:
            result.append(inner_dir)
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
        _update_task_input_params(api_url, headers, task_data.get("id"), updates)


    def _update_subtask_statuses_via_api(self, api_url, headers, initial_statuses):
        """通过API批量或逐个更新子任务的初始状态。"""
        self._log("正在设置子任务的初始状态...")
        for task_id, status_info in initial_statuses.items():
            task_status = status_info.get("task_status", "PENDING")
            workflow_status = status_info.get("workflow_status", WORKFLOW_STATUS_DEFAULT)
            try:
                if api_url:
                    response = requests.patch(
                        f"{api_url}/tasks/{task_id}/status",
                        headers=headers,
                        params={"status": task_status},
                        timeout=15
                    )
                    response.raise_for_status()
                else:
                    _local_update_progress(task_id, {"status": task_status})
                _update_task_input_params(api_url, headers, task_id, {"workflow_status": workflow_status})
                self._log(f"成功将任务 {task_id} 状态更新为 '{task_status}'，流程状态为 '{workflow_status}'。")
            except requests.exceptions.RequestException as e:
                raise RuntimeError(f"更新任务 {task_id} 状态为 '{task_status}' 时API调用失败: {e}")
            except Exception as e:
                self._log(f"更新任务 {task_id} 状态失败: {e}")


class BridgeRemovalUnitProcessorTask(BaseTask):
    def execute(self):
        api_url, headers = get_api_config()
        task_data = _get_task(api_url, headers, self.task_id)
        input_params = parse_input_params(task_data.get("inputParams"))

        workflow_status = input_params.get("workflow_status") or WORKFLOW_STATUS_DEFAULT

        intermediate_path = input_params.get("intermediate_path")
        if not intermediate_path:
            intermediate_root = input_params.get("intermediate_root")
            if not intermediate_root:
                parent_task_id = input_params.get("parent_task_id") or ""
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
            if not intermediate_root:
                intermediate_root = _get_intermediate_root()
            parent_task_id = input_params.get("parent_task_id") or ""
            bridge_id = input_params.get("bridge_id") or ""
            safe_bridge_id = re.sub(r'[^\w\-.]', '_', str(bridge_id)) if bridge_id else "bridge"
            project_dir = str(parent_task_id) if parent_task_id else ""
            intermediate_path = os.path.join(intermediate_root, project_dir, str(self.task_id), safe_bridge_id)
        intermediate_path = os.path.normpath(intermediate_path)
        os.makedirs(intermediate_path, exist_ok=True)
        if input_params.get("intermediate_path") != intermediate_path:
            _update_task_input_params(api_url, headers, self.task_id, {"intermediate_path": intermediate_path})

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

        if workflow_status == "待处理":
            workflow_status = "处理中"
            _api_set_workflow_status(api_url, headers, self.task_id, workflow_status)
            _api_update_task_status(api_url, headers, self.task_id, "IN_PROGRESS")
        elif workflow_status == "已锁定":
            self._log(f"任务 {self.task_id} 处于锁定状态，跳过执行")
            self.results["manifest"] = {"task_id": self.task_id, "status": "locked", "message": "任务被锁定，等待前置任务完成"}
            return

        merge_step_result(manifest, run_automation_processing(self.task_id, input_params))
        merge_step_result(manifest, run_interactive_correction(self.task_id, input_params))

        if any((s or {}).get("status") == "failed" for s in (manifest.get("steps") or [])):
            _update_task_output_results(api_url, headers, self.task_id, {"manifest": manifest})
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

        _update_task_output_results(api_url, headers, self.task_id, {"manifest": manifest})
        _api_set_workflow_status(api_url, headers, self.task_id, "待初检")
        _api_update_task_status(api_url, headers, self.task_id, "PAUSED")

        self.results["manifest"] = manifest

    def preprocess_segmentation(self, api_url, headers, intermediate_root=None, overwrite=False, param_overrides=None):
        """执行分割预处理：准备环境、生成分段、更新Scope"""
        task_id = self.task_id
        
        # 1. 获取最新任务数据
        task_data = _get_task(api_url, headers, task_id)
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

        resolved_intermediate_root = intermediate_root or input_params.get("intermediate_root")
        if not resolved_intermediate_root and not api_url:
            parent_id = task_data.get("parentTaskId") or task_data.get("parent_task_id") or ""
            if parent_id:
                from services.project_service import get_project
                parent_project = get_project(parent_id)
                if parent_project:
                    parent_ip = parent_project.get("input_params", {})
                    if isinstance(parent_ip, str):
                        try:
                            parent_ip = json.loads(parent_ip)
                        except Exception:
                            parent_ip = {}
                    resolved_intermediate_root = parent_ip.get("intermediate_root")
        default_root = resolved_intermediate_root or _get_intermediate_root()
        parent_task_id = task_data.get("parentTaskId") or task_data.get("parent_task_id") or ""
        project_dir = str(parent_task_id) if parent_task_id else ""
        intermediate_path = input_params.get("intermediate_path") or os.path.join(str(default_root), project_dir, str(task_id), safe_bridge_id)
        intermediate_path = os.path.normpath(intermediate_path)
        
        if input_params.get("intermediate_path") != intermediate_path:
            _update_task_input_params(api_url, headers, task_id, {"intermediate_path": intermediate_path})
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
                    _update_task_input_params(api_url, headers, task_id, {"bridge_centerline": bridge_centerline})
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
                        _update_task_input_params(api_url, headers, task_id, {"impact_scope": new_impact_scope})
                        self._log(f"任务 {task_id} impact_scope 更新: {merged_bbox}")

            _update_task_output_results(api_url, headers, task_id, {"preprocess_manifest": manifest})
            return True
        except Exception as ex:
            merge_step_result(manifest, {"step": {"name": "preprocess_pipeline", "status": "failed"}, "error": str(ex), "artifacts": {}})
            _update_task_output_results(api_url, headers, task_id, {"preprocess_manifest": manifest})
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
