import os
import struct

from services.geo_utils import bbox_overlaps


def validate_shp_components(shp_file_path):
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


def list_dom_tiles(dom_dir):
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


def read_tfw(tfw_path):
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


def get_image_size(path):
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


def world_file_extension_for_image_path(path):
    lower = str(path or "").lower()
    if lower.endswith(".png"):
        return ".pgw"
    if lower.endswith(".tif") or lower.endswith(".tiff"):
        return ".tfw"
    return ".tfw"


def dom_tile_info(dom_path):
    ext = world_file_extension_for_image_path(dom_path)
    world_file_path = os.path.splitext(dom_path)[0] + ext
    if not os.path.exists(world_file_path):
        fallback_ext = ".pgw" if ext == ".tfw" else ".tfw"
        fallback = os.path.splitext(dom_path)[0] + fallback_ext
        if os.path.exists(fallback):
            world_file_path = fallback
        else:
            raise ValueError(f"DOM缺少坐标描述文件: {world_file_path}")
    a, d, b, e, c, f_ = read_tfw(world_file_path)
    resolution = abs(a)
    width, height = get_image_size(dom_path)
    x_tl = c
    y_tl = f_
    x_br = a * width + b * height + c
    y_br = d * width + e * height + f_
    bounds = [min(x_tl, x_br), min(y_tl, y_br), max(x_tl, x_br), max(y_tl, y_br)]
    return {"bounds": bounds, "resolution": resolution, "tfw": {"a": a, "b": b, "d": d, "e": e, "c": c, "f": f_}}


class DomTileIndex:
    def __init__(self, dom_paths):
        self.dom_paths = [p for p in (dom_paths or []) if isinstance(p, str) and p.strip()]
        self._cache = {}

    def info(self, dom_path):
        if dom_path in self._cache:
            return self._cache[dom_path]
        info = dom_tile_info(dom_path)
        self._cache[dom_path] = info
        return info

    def filter_by_bbox(self, bbox):
        result = []
        for p in self.dom_paths:
            try:
                info = self.info(p)
            except Exception:
                continue
            if bbox_overlaps(bbox, info.get("bounds")):
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


def parse_strategy(value, default_value):
    if not value:
        return default_value
    s = str(value).strip().upper()
    if s in ("ASC", "DESC", "OVERWRITE", "OVERWRITE_PENDING", "SKIP", "AUTO"):
        return s
    if s in ("从小到大", "SMALL_TO_LARGE", "SMALL2LARGE", "S2L"):
        return "ASC"
    if s in ("从大到小", "LARGE_TO_SMALL", "LARGE2SMALL", "L2S"):
        return "DESC"
    if s in ("覆盖", "覆盖现有子任务"):
        return "OVERWRITE"
    if s in ("仅覆盖待处理", "仅覆盖待处理子任务", "覆盖待处理"):
        return "OVERWRITE_PENDING"
    if s in ("跳过", "跳过现有子任务"):
        return "SKIP"
    if s in ("自动", "自动生成掩膜"):
        return "AUTO"
    return default_value


def bridge_sort_key(bridge_id):
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


def _read_le_double(buf, offset):
    return struct.unpack("<d", buf[offset:offset+8])[0]


def read_dbf_records(dbf_path):
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


def read_shp_record_bboxes(shp_path):
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


def read_shp_record_geometries(shp_path):
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
                geom = parse_shp_polygon_geometry(rec)
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


def parse_shp_polygon_geometry(rec):
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
