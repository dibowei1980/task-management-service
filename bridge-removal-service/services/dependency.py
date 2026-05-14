from services.geo_utils import extract_bbox_from_geometry, bbox_overlaps


def build_dependency_graph(units_with_scope):
    adj = {unit['id']: [] for unit in units_with_scope}
    in_degree = {unit['id']: 0 for unit in units_with_scope}
    items = []
    for unit in units_with_scope:
        bbox = extract_bbox_from_geometry(unit.get("scope"))
        items.append({"id": unit["id"], "bbox": bbox})

    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            left = items[i]
            right = items[j]
            if bbox_overlaps(left["bbox"], right["bbox"]):
                adj[left["id"]].append(right["id"])
                in_degree[right["id"]] += 1

    return adj, in_degree


def merge_step_result(manifest, step_result):
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


def filter_operation_subtasks(subtasks):
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
