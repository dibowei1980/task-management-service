import re
import importlib


def _require(module_name: str):
    try:
        return importlib.import_module(module_name)
    except Exception as ex:
        raise RuntimeError(f"缺少Python依赖: {module_name}") from ex


def sanitize_id(value) -> str:
    s = "" if value is None else str(value).strip()
    if not s:
        return ""
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"[^0-9A-Za-z_\-]+", "", s)
    return s


def read_polygon_feature_from_shp(shp_path: str, record_index: int):
    shapefile = _require("shapefile")
    shapely_geometry = _require("shapely.geometry")
    Polygon = getattr(shapely_geometry, "Polygon")

    if record_index is None or int(record_index) <= 0:
        raise ValueError("record_index 必须为正整数")
    idx = int(record_index) - 1

    sf = shapefile.Reader(shp_path)
    if idx >= len(sf):
        raise IndexError(f"record_index 超出范围: {record_index}")

    shape_rec = sf.shapeRecord(idx)
    geom = shape_rec.shape
    if geom.shapeType not in (shapefile.POLYGON, shapefile.POLYGONZ):
        raise ValueError(f"仅支持面要素(POLYGON)，当前 shapeType={geom.shapeType}")

    points = geom.points or []
    parts = list(geom.parts or [])
    if not parts:
        parts = [0]
    parts.append(len(points))

    polys = []
    for j in range(len(parts) - 1):
        pts = points[parts[j] : parts[j + 1]]
        if len(pts) < 3:
            continue
        poly = Polygon(pts)
        if poly.is_valid and (not poly.is_empty):
            polys.append(poly)
            continue
        clean = poly.buffer(0)
        if clean.is_valid and (not clean.is_empty):
            if getattr(clean, "geom_type", "") == "Polygon":
                polys.append(clean)
            elif getattr(clean, "geom_type", "") == "MultiPolygon":
                polys.extend(list(clean.geoms))

    if not polys:
        raise ValueError("未能从SHP记录解析出有效Polygon")

    polygon = max(polys, key=lambda p: p.area)

    props = {}
    rec = getattr(shape_rec, "record", None)
    if rec is not None and hasattr(rec, "as_dict"):
        props = rec.as_dict() or {}
    else:
        fields = [f[0] for f in sf.fields[1:]]
        try:
            values = list(rec) if rec is not None else []
        except Exception:
            values = []
        for k in range(min(len(fields), len(values))):
            props[fields[k]] = values[k]

    return polygon, props


def compute_centerline_from_polygon(polygon, resolution=0.2):
    # 尝试使用骨架提取算法（适用于弯曲/复杂多边形）
    return _compute_skeleton_centerline(polygon, resolution)



def _compute_simple_centerline(polygon):
    shapely_geometry = _require("shapely.geometry")
    Point = getattr(shapely_geometry, "Point")
    LineString = getattr(shapely_geometry, "LineString")

    rect = polygon.minimum_rotated_rectangle
    coords = list(rect.exterior.coords)
    edges = []
    for i in range(4):
        p1 = Point(coords[i])
        p2 = Point(coords[i + 1])
        length = p1.distance(p2)
        midpoint = ((p1.x + p2.x) / 2.0, (p1.y + p2.y) / 2.0)
        edges.append((length, midpoint))
    edges.sort(key=lambda x: x[0])
    short_edges = edges[:2]
    if len(short_edges) != 2:
        raise ValueError("无法从最小外接矩形推导中心线端点")
    return LineString([short_edges[0][1], short_edges[1][1]])


def _compute_skeleton_centerline(polygon, resolution=0.2):
    np = _require("numpy")
    cv2 = _require("cv2")
    nx = _require("networkx")
    skimage_morphology = _require("skimage.morphology")
    skeletonize = getattr(skimage_morphology, "skeletonize")
    shapely_geometry = _require("shapely.geometry")
    LineString = getattr(shapely_geometry, "LineString")

    minx, miny, maxx, maxy = polygon.bounds
    width_m = maxx - minx
    height_m = maxy - miny
    
    padding_m = 2.0
    minx -= padding_m
    miny -= padding_m
    width_m += 2 * padding_m
    height_m += 2 * padding_m
    
    width_px = int(width_m / resolution)
    height_px = int(height_m / resolution)
    
    if width_px <= 0 or height_px <= 0:
        raise ValueError(f"多边形尺寸过小 (width_px={width_px}, height_px={height_px})，无法提取骨架中心线")

    def to_pixel(x, y):
        px = int((x - minx) / resolution)
        py = int((maxy - y) / resolution)
        return px, py

    def to_map(px, py):
        x = (px * resolution) + minx
        y = maxy - (py * resolution)
        return x, y

    exterior_coords = list(polygon.exterior.coords)
    pts = [to_pixel(x, y) for x, y in exterior_coords]
    pts = np.array(pts, np.int32)
    pts = pts.reshape((-1, 1, 2))
    
    mask = np.zeros((height_px, width_px), dtype=np.uint8)
    cv2.fillPoly(mask, [pts], 1)
    
    for interior in getattr(polygon, "interiors", []):
        interior_coords = list(interior.coords)
        ipts = [to_pixel(x, y) for x, y in interior_coords]
        ipts = np.array(ipts, np.int32)
        ipts = ipts.reshape((-1, 1, 2))
        cv2.fillPoly(mask, [ipts], 0)

    skeleton = skeletonize(mask)
    
    y_idxs, x_idxs = np.where(skeleton)
    if len(y_idxs) < 2:
        raise ValueError("骨架提取结果点数不足(<2)，无法构建中心线")
        
    nodes = list(zip(y_idxs, x_idxs))
    node_set = set(nodes)
    
    G = nx.Graph()
    for r, c in nodes:
        G.add_node((r, c))
        for dr in [-1, 0, 1]:
            for dc in [-1, 0, 1]:
                if dr == 0 and dc == 0: continue
                nr, nc = r + dr, c + dc
                if (nr, nc) in node_set:
                    dist = np.sqrt(dr**2 + dc**2)
                    G.add_edge((r, c), (nr, nc), weight=dist)
    
    if G.number_of_nodes() == 0:
        raise ValueError("骨架图构建失败(节点数为0)")

    comps = list(nx.connected_components(G))
    largest_comp_nodes = max(comps, key=len)
    G_sub = G.subgraph(largest_comp_nodes).copy()
    
    endpoints = [n for n, d in G_sub.degree() if d == 1]
    best_path = []
    
    if len(endpoints) < 2:
        if G_sub.number_of_nodes() > 1:
            nodes_list = list(G_sub.nodes())
            start = nodes_list[0]
            lengths = nx.single_source_dijkstra_path_length(G_sub, start)
            end = max(lengths, key=lengths.get)
            lengths2 = nx.single_source_dijkstra_path_length(G_sub, end)
            start_real = max(lengths2, key=lengths2.get)
            best_path = nx.shortest_path(G_sub, start_real, end)
        else:
            best_path = list(G_sub.nodes())
    else:
        if len(endpoints) > 20:
             start = endpoints[0]
             lengths = nx.single_source_dijkstra_path_length(G_sub, start)
             far_node = max(lengths, key=lengths.get)
             lengths2 = nx.single_source_dijkstra_path_length(G_sub, far_node)
             far_node2 = max(lengths2, key=lengths2.get)
             best_path = nx.shortest_path(G_sub, far_node, far_node2)
        else:
            max_len = 0.0
            for i in range(len(endpoints)):
                for j in range(i + 1, len(endpoints)):
                    try:
                        path = nx.shortest_path(G_sub, endpoints[i], endpoints[j], weight='weight')
                        length = nx.path_weight(G_sub, path, weight='weight')
                        if length > max_len:
                            max_len = length
                            best_path = path
                    except Exception:
                        continue

    if not best_path:
        raise ValueError("未能从骨架中搜索到有效路径")
        
    line_coords = [to_map(c, r) for r, c in best_path]
    line = LineString(line_coords)
    line = line.simplify(tolerance=0.5, preserve_topology=True)
    
    return _optimize_centerline(line, polygon)


def _optimize_centerline(centerline, polygon):
    if centerline is None or centerline.is_empty:
        return centerline
    
    shapely_geometry = _require("shapely.geometry")
    Point = getattr(shapely_geometry, "Point")
    LineString = getattr(shapely_geometry, "LineString")
        
    try:
        target_mids = _get_end_edge_midpoints(polygon)
        if len(target_mids) != 2:
            return centerline 
            
        c_coords = list(centerline.coords)
        p_start = Point(c_coords[0])
        p_end = Point(c_coords[-1])
        
        m1 = target_mids[0]
        m2 = target_mids[1]
        
        dist_A = p_start.distance(m1) + p_end.distance(m2)
        dist_B = p_start.distance(m2) + p_end.distance(m1)
        
        if dist_A < dist_B:
            target_start = m1
            target_end = m2
        else:
            target_start = m2
            target_end = m1
            
        rect = polygon.minimum_rotated_rectangle
        r_coords = list(rect.exterior.coords)
        dists = [Point(r_coords[i]).distance(Point(r_coords[i+1])) for i in range(4)]
        width = min(dists)
        
        prune_dist = width * 0.8 
        
        points = [Point(c) for c in c_coords]
        
        cut_start_idx = 0
        for i, p in enumerate(points):
            if p.distance(target_start) > prune_dist:
                cut_start_idx = i
                break
        else:
            return LineString([target_start, target_end])
            
        cut_end_idx = len(points) - 1
        for i in range(len(points) - 1, -1, -1):
            if points[i].distance(target_end) > prune_dist:
                cut_end_idx = i
                break
        
        if cut_start_idx > cut_end_idx:
             return LineString([target_start, target_end])
             
        final_coords = [target_start.coords[0]]
        for i in range(cut_start_idx, cut_end_idx + 1):
            final_coords.append(c_coords[i])
        final_coords.append(target_end.coords[0])
        
        return LineString(final_coords)
        
    except Exception as e:
        # print(f"Optimization failed: {e}")
        return centerline


def _get_end_edge_midpoints(polygon):
    np = _require("numpy")
    shapely_geometry = _require("shapely.geometry")
    Point = getattr(shapely_geometry, "Point")
    LineString = getattr(shapely_geometry, "LineString")

    rect = polygon.minimum_rotated_rectangle
    coords = list(rect.exterior.coords)
    edges = []
    for i in range(4):
        p1 = Point(coords[i])
        p2 = Point(coords[i+1])
        length = p1.distance(p2)
        midpoint = Point((p1.x + p2.x)/2, (p1.y + p2.y)/2)
        vector = np.array([p2.x - p1.x, p2.y - p1.y])
        edges.append({'length': length, 'midpoint': midpoint, 'vector': vector})
        
    edges.sort(key=lambda x: x['length'])
    short_edges = edges[:2]
    long_edges = edges[2:]
    
    if not long_edges:
        return [e['midpoint'] for e in short_edges]

    main_axis = long_edges[0]['vector']
    norm = np.linalg.norm(main_axis)
    if norm > 0:
        main_axis = main_axis / norm
    
    target_midpoints = []
    
    poly_segments = []
    p_coords = list(polygon.exterior.coords)
    for i in range(len(p_coords) - 1):
        p1 = Point(p_coords[i])
        p2 = Point(p_coords[i+1])
        length = p1.distance(p2)
        if length < 0.01: continue
        
        seg = LineString([p1, p2])
        vector = np.array([p2.x - p1.x, p2.y - p1.y])
        norm = np.linalg.norm(vector)
        if norm > 0:
            vector = vector / norm
        poly_segments.append({'geometry': seg, 'vector': vector, 'midpoint': seg.interpolate(0.5, normalized=True)})
        
    for short_edge in short_edges:
        obb_mid = short_edge['midpoint']
        obb_len = short_edge['length']
        search_radius = obb_len * 0.8
        
        candidates = []
        for seg_info in poly_segments:
            dist = seg_info['geometry'].distance(obb_mid)
            if dist < search_radius:
                dot = np.abs(np.dot(seg_info['vector'], main_axis))
                score = 1.0 - dot
                candidates.append({**seg_info, 'score': score, 'dist': dist})
        
        if not candidates:
             if poly_segments:
                best_seg = min(poly_segments, key=lambda s: s['geometry'].distance(obb_mid))
                target_midpoints.append(best_seg['midpoint'])
        else:
            best_candidate = max(candidates, key=lambda c: c['score'])
            target_midpoints.append(best_candidate['midpoint'])
            
    return target_midpoints


def to_bridge_geojson(polygon, centerline, properties: dict, bridge_id: str):
    props = dict(properties or {})
    if bridge_id:
        props.setdefault("bridge_id", bridge_id)

    centerline_coords = []
    try:
        centerline_coords = [[float(x), float(y)] for x, y in list(centerline.coords)]
    except Exception:
        centerline_coords = []

    polygon_coords = []
    try:
        exterior = [[float(x), float(y)] for x, y in list(polygon.exterior.coords)]
        interiors = []
        for ring in list(getattr(polygon, "interiors", []) or []):
            interiors.append([[float(x), float(y)] for x, y in list(ring.coords)])
        polygon_coords = [exterior] + interiors
    except Exception:
        polygon_coords = []

    feature_centerline = {
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": centerline_coords},
        "properties": {**props, "type": "centerline"},
    }
    feature_polygon = {
        "type": "Feature",
        "geometry": {"type": "Polygon", "coordinates": polygon_coords},
        "properties": {**props, "type": "polygon"},
    }
    return {"type": "FeatureCollection", "features": [feature_centerline, feature_polygon]}
