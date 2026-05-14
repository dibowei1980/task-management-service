import glob
import json
import math
import os
import time
import importlib


def _require(module_name: str):
    try:
        return importlib.import_module(module_name)
    except Exception as ex:
        raise RuntimeError(f"缺少Python依赖: {module_name}") from ex


def _world_file_extension_for_image_path(path: str) -> str:
    lower = str(path or "").lower()
    if lower.endswith(".png"):
        return ".pgw"
    if lower.endswith(".tif") or lower.endswith(".tiff"):
        return ".tfw"
    return ".tfw"


def _world_file_path_for_image_path(path: str) -> str:
    base, _ = os.path.splitext(path)
    return base + _world_file_extension_for_image_path(path)


class ImageTile:
    def __init__(self, path: str):
        self.path = path
        self.world_file_path = _world_file_path_for_image_path(path)
        self.valid = False
        self.width = 0
        self.height = 0
        self.bounds = None
        self.resolution = 0.5
        self.a = self.d = self.b = self.e = self.c = self.f = None
        self._load_metadata()

    def _load_metadata(self):
        cv2 = _require("cv2")
        world_file_path = self.world_file_path
        if not os.path.exists(world_file_path):
            base, _ = os.path.splitext(self.path)
            fallback = base + (".pgw" if world_file_path.lower().endswith(".tfw") else ".tfw")
            if os.path.exists(fallback):
                world_file_path = fallback
        if os.path.exists(world_file_path):
            try:
                with open(world_file_path, "r", encoding="utf-8") as f:
                    lines = [float(l.strip()) for l in f.readlines()]
                if len(lines) >= 6:
                    self.a, self.d, self.b, self.e, self.c, self.f = lines[:6]
                    self.resolution = abs(self.a)
                    self.valid = True
            except Exception:
                self.valid = False

        if not self.valid:
            return

        try:
            img = cv2.imread(self.path, cv2.IMREAD_UNCHANGED)
            if img is None:
                self.valid = False
                return
            self.height, self.width = img.shape[:2]
            x_tl = self.c
            y_tl = self.f
            x_br = self.a * self.width + self.b * self.height + self.c
            y_br = self.d * self.width + self.e * self.height + self.f
            self.minx = min(x_tl, x_br)
            self.maxx = max(x_tl, x_br)
            self.miny = min(y_tl, y_br)
            self.maxy = max(y_tl, y_br)
            self.bounds = (self.minx, self.miny, self.maxx, self.maxy)
        except Exception:
            self.valid = False

    def read_region(self, map_bounds, target_res, target_width, target_height):
        if not self.valid:
            return None

        cv2 = _require("cv2")
        np = _require("numpy")

        t_minx, t_miny, t_maxx, t_maxy = map_bounds
        if t_minx > self.maxx or t_maxx < self.minx or t_miny > self.maxy or t_maxy < self.miny:
            return None

        img = cv2.imread(self.path, cv2.IMREAD_UNCHANGED)
        if img is None:
            return None
        if img.ndim == 2:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGRA)
        elif img.shape[2] == 3:
            img = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)

        M = np.array(
            [
                [self.a / target_res, self.b / target_res, (self.c - t_minx) / target_res],
                [-self.d / target_res, -self.e / target_res, (t_maxy - self.f) / target_res],
            ],
            dtype=np.float32,
        )
        warped = cv2.warpAffine(
            img,
            M,
            (target_width, target_height),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(0, 0, 0, 0),
        )
        return warped


class BridgeImageMosaic:
    def __init__(self, img_dir_or_paths):
        self.img_dir_or_paths = img_dir_or_paths
        self.tiles = []
        self.scan_tiles()

    def scan_tiles(self):
        files = []
        if isinstance(self.img_dir_or_paths, (list, tuple)):
            files = [str(p) for p in self.img_dir_or_paths if p]
        else:
            img_dir = str(self.img_dir_or_paths)
            files = (
                glob.glob(os.path.join(img_dir, "*.tif"))
                + glob.glob(os.path.join(img_dir, "*.tiff"))
                + glob.glob(os.path.join(img_dir, "*.jpg"))
                + glob.glob(os.path.join(img_dir, "*.png"))
            )
        for f in files:
            tile = ImageTile(f)
            if tile.valid:
                self.tiles.append(tile)

    def get_min_resolution(self):
        if not self.tiles:
            return 0.5
        return min([t.resolution for t in self.tiles])

    def feather_tile(self, part, blend_width=32):
        cv2 = _require("cv2")
        np = _require("numpy")

        alpha = part[:, :, 3]
        h, w = alpha.shape
        _, mask = cv2.threshold(alpha, 1, 255, cv2.THRESH_BINARY)
        pad = blend_width + 5
        mask_padded = cv2.copyMakeBorder(mask, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=255)
        dist = cv2.distanceTransform(mask_padded, cv2.DIST_L2, 5)
        dist_cropped = dist[pad : pad + h, pad : pad + w]
        weight = np.clip(dist_cropped / blend_width, 0, 1.0)
        new_alpha = alpha.astype(np.float32) * weight
        part[:, :, 3] = new_alpha.astype(np.uint8)
        return part

    def overlay_image(self, canvas, part):
        np = _require("numpy")

        self.feather_tile(part)
        src_alpha = part[:, :, 3]
        if not np.any(src_alpha > 0):
            return
        dst_alpha = canvas[:, :, 3]
        mask_copy = (src_alpha > 0) & (dst_alpha == 0)
        if np.any(mask_copy):
            canvas[mask_copy] = part[mask_copy]
        mask_blend = (src_alpha > 0) & (dst_alpha > 0)
        if np.any(mask_blend):
            alpha_s = src_alpha[mask_blend].astype(float) / 255.0
            alpha_d = dst_alpha[mask_blend].astype(float) / 255.0
            alpha_out = alpha_s + alpha_d * (1.0 - alpha_s)
            alpha_out_safe = np.copy(alpha_out)
            alpha_out_safe[alpha_out_safe < 1e-6] = 1.0
            for c in range(3):
                val_s = part[mask_blend, c].astype(float)
                val_d = canvas[mask_blend, c].astype(float)
                val_out = (val_s * alpha_s + val_d * alpha_d * (1.0 - alpha_s)) / alpha_out_safe
                canvas[mask_blend, c] = np.clip(val_out, 0, 255).astype(np.uint8)
            canvas[mask_blend, 3] = np.clip(alpha_out * 255.0, 0, 255).astype(np.uint8)

    def generate_world_file_content(self, resolution, minx, maxy):
        c = minx + resolution / 2.0
        f = maxy - resolution / 2.0
        return [
            f"{resolution:.10f}",
            "0.0000000000",
            "0.0000000000",
            f"{-resolution:.10f}",
            f"{c:.10f}",
            f"{f:.10f}",
        ]

    def process_bridge(self, bridge_data, max_side_px=1024, default_id="unknown"):
        np = _require("numpy")
        shapely_geometry = _require("shapely.geometry")
        shape = getattr(shapely_geometry, "shape")
        mapping = getattr(shapely_geometry, "mapping")

        if isinstance(bridge_data, str):
            data = json.loads(bridge_data)
        elif isinstance(bridge_data, dict):
            data = bridge_data
        else:
            return []

        if data.get("type") != "FeatureCollection":
            return []

        centerline_feat = next((f for f in data.get("features", []) if f.get("properties", {}).get("type") == "centerline"), None)
        polygon_feat = next((f for f in data.get("features", []) if f.get("properties", {}).get("type") == "polygon"), None)
        if not centerline_feat or not polygon_feat:
            return []

        centerline = shape(centerline_feat["geometry"])
        polygon = shape(polygon_feat["geometry"])
        props = centerline_feat.get("properties") or {}
        bridge_id = props.get("id") or props.get("bridge_id") or default_id

        resolution = self.get_min_resolution()
        tile_size_meters = max_side_px * resolution
        segments = self.split_bridge(polygon, centerline, tile_size_meters)

        output_data_list = []
        for i, (seg_poly, seg_line, seg_id) in enumerate(segments):
            minx, miny, maxx, maxy = seg_poly.bounds
            width_m = maxx - minx
            height_m = maxy - miny
            side_m = max(width_m, height_m)
            
            # Ensure at least 50px padding on each side (total 100px extra)
            # Or ensure the crop is large enough to cover the bridge with padding
            padding_px = 50
            padding_m = padding_px * resolution
            
            # Extend side_m if needed to include padding
            # But the logic below calculates canvas_bounds from center_pt
            # So we just need to make sure side_m is large enough
            
            # Recalculate side_m to include padding for the bridge polygon
            # Current width_m/height_m are exact bounds of the segment polygon
            # We want the canvas to cover (width_m + 2*padding) and (height_m + 2*padding)
            required_side_m = max(width_m, height_m) + 2 * padding_m
            side_m = max(side_m, required_side_m)

            min_pixels = 256
            min_side_m = min_pixels * resolution
            if side_m < min_side_m:
                side_m = min_side_m

            try:
                center_pt = seg_line.interpolate(0.5, normalized=True)
            except Exception:
                center_pt = seg_line.interpolate(seg_line.project(seg_line.centroid))
            cx = center_pt.x
            cy = center_pt.y

            half_side = side_m / 2.0
            minx = cx - half_side
            maxx = cx + half_side
            miny = cy - half_side
            maxy = cy + half_side
            canvas_bounds = (minx, miny, maxx, maxy)

            width_px = int(math.ceil(side_m / resolution))
            height_px = int(math.ceil(side_m / resolution))
            remainder = width_px % 8
            if remainder != 0:
                padding = 8 - remainder
                width_px += padding
                height_px += padding
                side_m = width_px * resolution
                half_side = side_m / 2.0
                minx = cx - half_side
                maxx = cx + half_side
                miny = cy - half_side
                maxy = cy + half_side
                canvas_bounds = (minx, miny, maxx, maxy)

            if width_px < 1:
                width_px = 1
            if height_px < 1:
                height_px = 1

            canvas = np.zeros((height_px, width_px, 4), dtype=np.uint8)
            for tile in self.tiles:
                part = tile.read_region(canvas_bounds, resolution, width_px, height_px)
                if part is not None:
                    self.overlay_image(canvas, part)

            safe_id = str(bridge_id).replace(".json", "")
            img_filename = f"{safe_id}_{seg_id}.png"
            world_file_content = self.generate_world_file_content(resolution, minx, maxy)

            json_data = {
                "image_info": {
                    "filename": img_filename,
                    "width": width_px,
                    "height": height_px,
                    "format": "PNG",
                    "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                },
                "properties": {
                    **props,
                    "segment_id": seg_id,
                    "is_start_segment": i == 0,
                    "is_end_segment": i == len(segments) - 1,
                    "resolution": resolution,
                    "bridge_id": bridge_id,
                },
                "geometry": {
                    "polygon": mapping(seg_poly),
                    "centerline": mapping(seg_line),
                    "center_point": mapping(center_pt),
                    "bounds_geo": canvas_bounds,
                },
                "processing_info": {"module": "BridgeImageMosaic", "version": "1.0", "timestamp": time.time()},
            }

            output_data_list.append(
                {
                    "image": canvas,
                    "world_file": world_file_content,
                    "json_data": json_data,
                    "metadata": {"bridge_id": bridge_id, "safe_id": safe_id, "segment_id": seg_id, "img_filename": img_filename},
                }
            )
        return output_data_list

    def split_bridge(self, polygon, centerline, max_len_meters):
        shapely_ops = _require("shapely.ops")
        split = getattr(shapely_ops, "split")
        unary_union = getattr(shapely_ops, "unary_union")
        shapely_geometry = _require("shapely.geometry")
        LineString = getattr(shapely_geometry, "LineString")

        length = centerline.length
        resolution = self.get_min_resolution()
        min_overlap = 50 * resolution
        if length <= max_len_meters:
            return [(polygon, centerline, 1)]

        effective_len = max_len_meters - min_overlap
        if effective_len <= 0:
            effective_len = max_len_meters / 2.0
        num_segments = math.ceil(length / effective_len)
        step = length / num_segments

        cut_lines = []
        for i in range(1, num_segments):
            dist = i * step
            pt = centerline.interpolate(dist)
            delta = 0.1
            p1 = centerline.interpolate(max(dist - delta, 0))
            p2 = centerline.interpolate(min(dist + delta, length))
            dx = p2.x - p1.x
            dy = p2.y - p1.y
            norm = math.sqrt(dx * dx + dy * dy)
            if norm == 0:
                nx, ny = 0, 1
            else:
                nx, ny = -dy / norm, dx / norm
            huge = 2000
            cut_line = LineString([(pt.x - nx * huge, pt.y - ny * huge), (pt.x + nx * huge, pt.y + ny * huge)])
            cut_lines.append(cut_line)

        split_polys = None
        # Try batch split first (Reference algorithm)
        try:
            splitter = unary_union(cut_lines)
            res = split(polygon, splitter)
            if hasattr(res, "geoms"):
                split_polys = res
            else:
                split_polys = list(res)
        except Exception as e:
            # print(f"Batch split failed, falling back to iterative: {e}")
            split_polys = None

        if split_polys is None:
            pieces = [polygon]
            for line in cut_lines:
                next_pieces = []
                for p in pieces:
                    try:
                        if not p.intersects(line):
                            next_pieces.append(p)
                            continue
                        res = split(p, line)
                        geoms = list(getattr(res, "geoms", []) or [])
                        if not geoms:
                            next_pieces.append(p)
                            continue
                        for g in geoms:
                            if getattr(g, "area", 0) > 0.01:
                                next_pieces.append(g)
                    except Exception:
                        next_pieces.append(p)
                pieces = next_pieces
            split_polys = pieces

        poly_list = []
        iterable = split_polys.geoms if hasattr(split_polys, "geoms") else split_polys
        for geom in iterable:
            if geom.area > 0.01:
                proj_dist = centerline.project(geom.centroid)
                poly_list.append((geom, proj_dist))
        poly_list.sort(key=lambda x: x[1])

        segments = []
        for i, (poly, _) in enumerate(poly_list):
            seg_line = centerline.intersection(poly)
            if seg_line.is_empty:
                continue
            segments.append((poly, seg_line, i + 1))
        return segments

    def verify_output_integrity(self, output_dir):
        if not os.path.exists(output_dir):
            return

        files = os.listdir(output_dir)
        images = {f for f in files if f.lower().endswith(('.png', '.jpg', '.tif'))}
        jsons = {f for f in files if f.lower().endswith('.json') and not f.endswith('_segments.json')}
        
        for img in images:
            base_name = os.path.splitext(img)[0]
            expected_json = base_name + ".json"
            if expected_json not in jsons:
                self._regenerate_basic_json(os.path.join(output_dir, expected_json), img_filename=img)
        
        for j in jsons:
            base_name = os.path.splitext(j)[0]
            found_img = False
            for ext in ['.png', '.jpg', '.tif']:
                if (base_name + ext) in images:
                    found_img = True
                    break
            
            json_full_path = os.path.join(output_dir, j)
            if not found_img:
                self._mark_json_pending(json_full_path)
            else:
                try:
                    with open(json_full_path, 'r', encoding='utf-8') as f:
                        json.load(f)
                except json.JSONDecodeError:
                    self._regenerate_basic_json(json_full_path)

    def _mark_json_pending(self, json_path):
        try:
            data = {}
            if os.path.exists(json_path):
                try:
                    with open(json_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                except:
                    pass
            data['status'] = 'pending_image'
            data['status_updated_at'] = time.strftime("%Y-%m-%d %H:%M:%S")
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception:
            pass

    def _regenerate_basic_json(self, json_path, img_filename=None):
        data = {
            "image_info": {
                "filename": img_filename if img_filename else "unknown",
                "note": "Restored by integrity check"
            },
            "status": "restored_structure",
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        try:
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception:
            pass


def save_mosaic_data(data_list, output_dir):
    cv2 = _require("cv2")

    os.makedirs(output_dir, exist_ok=True)
    saved = []

    for item in data_list:
        meta = item["metadata"]
        img_path = os.path.join(output_dir, meta["img_filename"])
        ok = cv2.imwrite(img_path, item["image"])
        if not ok:
            continue

        base = f'{meta["safe_id"]}_{meta["segment_id"]}'
        world_ext = _world_file_extension_for_image_path(img_path)
        world_file_path = os.path.join(output_dir, base + world_ext)
        with open(world_file_path, "w", encoding="utf-8") as f:
            f.write("\n".join(item["world_file"]))

        json_path = os.path.join(output_dir, base + ".json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(item["json_data"], f, indent=2, ensure_ascii=False)

        saved.append({
            "segment_id": meta["segment_id"],
            "image_path": img_path,
            "world_file_path": world_file_path,
            "json_path": json_path,
            "bbox": item["json_data"]["geometry"]["bounds_geo"]
        })

    return saved
