def expand_bbox(bbox, distance):
    if not bbox or len(bbox) < 4:
        return bbox
    d = float(distance or 0.0)
    return [bbox[0] - d, bbox[1] - d, bbox[2] + d, bbox[3] + d]


def polygon_from_bbox(bbox):
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


def normalize_bbox(bbox):
    if not bbox or len(bbox) < 4:
        return None
    return [bbox[0], bbox[1], bbox[2], bbox[3]]


def bbox_from_coordinates(coordinates):
    points = flatten_coordinates(coordinates)
    if not points:
        return None
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return [min(xs), min(ys), max(xs), max(ys)]


def flatten_coordinates(coords):
    if coords is None:
        return []
    if isinstance(coords, (list, tuple)) and coords:
        first = coords[0]
        if isinstance(first, (int, float)) and len(coords) >= 2:
            return [(coords[0], coords[1])]
        points = []
        for item in coords:
            points.extend(flatten_coordinates(item))
        return points
    return []


def bbox_overlaps(left, right):
    if not left or not right:
        return False
    return not (
        left[2] < right[0] or
        right[2] < left[0] or
        left[3] < right[1] or
        right[3] < left[1]
    )


def extract_bbox_from_geometry(geometry):
    if geometry is None:
        return None
    if isinstance(geometry, dict):
        if "bbox" in geometry and geometry["bbox"]:
            return normalize_bbox(geometry["bbox"])
        if geometry.get("type") == "Feature":
            return extract_bbox_from_geometry(geometry.get("geometry"))
        coordinates = geometry.get("coordinates")
        return bbox_from_coordinates(coordinates)
    return None
