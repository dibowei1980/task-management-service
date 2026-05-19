import json
import os
from typing import List, Optional, Tuple, Dict, Any

from .dom_mosaic import BridgeImageMosaic, save_mosaic_data
from .vector_reader import compute_centerline_from_polygon, read_polygon_feature_from_shp, sanitize_id, to_bridge_geojson


def build_bridge_geojson_from_shp(shp_path: str, record_index: int, bridge_id: Optional[str] = None) -> Tuple[str, Dict[str, Any]]:
    polygon, props = read_polygon_feature_from_shp(shp_path, record_index)
    if not bridge_id:
        bridge_id = props.get("bridge_id") or props.get("BRIDGE_ID") or props.get("id") or props.get("ID")
    safe = sanitize_id(bridge_id) or f"bridge_{record_index}"
    centerline = compute_centerline_from_polygon(polygon)
    geojson = to_bridge_geojson(polygon, centerline, props, bridge_id=safe)
    return safe, geojson


def build_bridge_geojson_from_input(
    bridge_polygon_geojson: Dict[str, Any],
    bridge_centerline_geojson: Optional[Dict[str, Any]] = None,
    properties: Optional[Dict[str, Any]] = None,
    bridge_id: Optional[str] = None,
    record_index: Optional[int] = None,
) -> Tuple[str, Dict[str, Any]]:
    if not isinstance(bridge_polygon_geojson, dict):
        raise ValueError("bridge_polygon_geojson must be a GeoJSON dict")
    if str(bridge_polygon_geojson.get("type") or "").lower() != "polygon":
        raise ValueError(f"bridge_polygon_geojson must be Polygon, got {bridge_polygon_geojson.get('type')}")

    safe = sanitize_id(bridge_id) or (f"bridge_{record_index}" if record_index else "bridge")
    props = dict(properties or {})
    if safe:
        props.setdefault("bridge_id", safe)

    if bridge_centerline_geojson and isinstance(bridge_centerline_geojson, dict):
        centerline_geom = bridge_centerline_geojson
    else:
        shapely_geometry = __import__("shapely.geometry", fromlist=["Polygon"])
        Polygon = getattr(shapely_geometry, "Polygon")
        coords = bridge_polygon_geojson.get("coordinates") or []
        shell = coords[0] if len(coords) > 0 else None
        holes = coords[1:] if len(coords) > 1 else []
        if not shell:
            raise ValueError("polygon_coordinates_missing")
        poly = Polygon(shell, holes)
        line = compute_centerline_from_polygon(poly)
        centerline_geom = {"type": "LineString", "coordinates": [[float(x), float(y)] for x, y in list(line.coords)]}

    feature_centerline = {
        "type": "Feature",
        "geometry": centerline_geom,
        "properties": {**props, "type": "centerline"},
    }
    feature_polygon = {
        "type": "Feature",
        "geometry": bridge_polygon_geojson,
        "properties": {**props, "type": "polygon"},
    }
    return safe, {"type": "FeatureCollection", "features": [feature_centerline, feature_polygon]}


def generate_segments_from_dom_sources(
    intermediate_path: str,
    bridge_geojson: Dict[str, Any],
    source_doms: List[str],
    max_side_px: int = 1024,
):
    segments_dir = os.path.join(intermediate_path, "segments")
    os.makedirs(segments_dir, exist_ok=True)

    mosaic = BridgeImageMosaic(source_doms)
    data_list = mosaic.process_bridge(bridge_geojson, max_side_px=max_side_px, default_id="bridge")
    saved = save_mosaic_data(data_list, segments_dir)

    return segments_dir, saved


def write_bridge_geojson(intermediate_path: str, bridge_id: str, bridge_geojson: Dict[str, Any]) -> str:
    os.makedirs(intermediate_path, exist_ok=True)
    out_path = os.path.join(intermediate_path, f"{bridge_id}.geojson")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(bridge_geojson, f, ensure_ascii=False, indent=2)
    return out_path
