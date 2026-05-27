import json
from typing import List, Set, Tuple

from db import db
from db.models import TaskOverlapModel, ProjectModel
from services.geo_utils import bbox_overlaps, extract_bbox_from_geometry

_BUILT_PARENTS_CACHE: set = set()


def _has_any_overlap_records(parent_task_id: str) -> bool:
    return TaskOverlapModel.query.filter_by(parent_task_id=parent_task_id).limit(1).count() > 0


def _count_subtasks(parent_task_id: str) -> int:
    return ProjectModel.query.filter_by(parent_task_id=parent_task_id).count()


def ensure_overlaps_built(parent_task_id: str) -> None:
    if parent_task_id in _BUILT_PARENTS_CACHE:
        return
    if _has_any_overlap_records(parent_task_id):
        _BUILT_PARENTS_CACHE.add(parent_task_id)
        return
    subtask_count = _count_subtasks(parent_task_id)
    if subtask_count == 0:
        _BUILT_PARENTS_CACHE.add(parent_task_id)
        return
    from services.project_service import get_subtasks_local
    siblings = get_subtasks_local(parent_task_id)
    if siblings:
        rebuild_overlaps_for_parent(parent_task_id, siblings)
    _BUILT_PARENTS_CACHE.add(parent_task_id)


def rebuild_overlaps_for_parent(parent_task_id: str, siblings: list) -> None:
    TaskOverlapModel.query.filter_by(parent_task_id=parent_task_id).delete()
    _BUILT_PARENTS_CACHE.discard(parent_task_id)

    items = []
    for s in siblings:
        s_ip = s.get("inputParams") or {}
        if isinstance(s_ip, str):
            try:
                s_ip = json.loads(s_ip)
            except (json.JSONDecodeError, TypeError):
                s_ip = {}
        s_impact = s_ip.get("impact_scope")
        s_bridge = s_ip.get("bridge_polygon") or s_ip.get("bridge_polygon_geojson")
        s_scope = s_impact or s_bridge
        s_bbox = extract_bbox_from_geometry(s_scope) if s_scope else None
        items.append({"id": s.get("id"), "bbox": s_bbox})

    new_rows = []
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            left = items[i]
            right = items[j]
            if left["bbox"] and right["bbox"] and bbox_overlaps(left["bbox"], right["bbox"]):
                lid, rid = left["id"], right["id"]
                if lid and rid:
                    lid_str, rid_str = str(lid), str(rid)
                    pair = (lid_str, rid_str) if lid_str < rid_str else (rid_str, lid_str)
                    new_rows.append(TaskOverlapModel(
                        parent_task_id=parent_task_id,
                        left_task_id=pair[0],
                        right_task_id=pair[1],
                    ))

    for row in new_rows:
        db.session.add(row)
    db.session.commit()


def get_overlapping_task_ids(parent_task_id: str, task_id: str) -> Set[str]:
    ensure_overlaps_built(parent_task_id)
    tid = str(task_id)
    rows = TaskOverlapModel.query.filter_by(parent_task_id=parent_task_id).all()
    result = set()
    for r in rows:
        if r.left_task_id == tid:
            result.add(r.right_task_id)
        elif r.right_task_id == tid:
            result.add(r.left_task_id)
    return result


def get_all_overlap_pairs(parent_task_id: str) -> List[Tuple[str, str]]:
    rows = TaskOverlapModel.query.filter_by(parent_task_id=parent_task_id).all()
    return [(r.left_task_id, r.right_task_id) for r in rows]


def remove_task_overlaps(parent_task_id: str, task_id: str) -> None:
    tid = str(task_id)
    TaskOverlapModel.query.filter(
        TaskOverlapModel.parent_task_id == parent_task_id,
        db.or_(TaskOverlapModel.left_task_id == tid, TaskOverlapModel.right_task_id == tid),
    ).delete(synchronize_session="fetch")
    db.session.commit()


def cleanup_parent_overlaps(parent_task_id: str) -> None:
    TaskOverlapModel.query.filter_by(parent_task_id=parent_task_id).delete()
    db.session.commit()
    _BUILT_PARENTS_CACHE.discard(parent_task_id)


def get_overlapping_tasks_with_names(parent_task_id: str, task_id: str) -> List[dict]:
    ensure_overlaps_built(parent_task_id)
    overlapping_ids = get_overlapping_task_ids(parent_task_id, task_id)
    if not overlapping_ids:
        return []
    from services.project_service import get_subtasks_local
    siblings = get_subtasks_local(parent_task_id)
    result = []
    for s in siblings:
        s_id = str(s.get("id", ""))
        if s_id in overlapping_ids:
            s_ip = s.get("inputParams") or {}
            if isinstance(s_ip, str):
                try:
                    s_ip = json.loads(s_ip)
                except (json.JSONDecodeError, TypeError):
                    s_ip = {}
            result.append({
                "id": s_id,
                "name": s.get("name") or "",
                "workflowStatus": s_ip.get("workflowStatus") or s_ip.get("workflow_status") or "",
            })
    return result
