from logging import exception
import os
from warnings import catch_warnings
import cv2
import numpy as np
import time
import json
import threading
try:
    from bridge_removal.sam2_adapter import SAM2Adapter
except Exception:
    from sam2_adapter import SAM2Adapter


class Sam2SegmentationUnit:
    def __init__(self, adapter_factory=SAM2Adapter):
        self._adapter_factory = adapter_factory
        self._adapter = None
        self._lock = threading.Lock()

    def _ensure_loaded(self):
        with self._lock:
            if self._adapter is None:
                if self._adapter_factory is None:
                    raise RuntimeError("SAM2Adapter module is not available")
                self._adapter = self._adapter_factory()

    def segment_rgba_by_points(self, input_array: np.ndarray, points: list) -> tuple[list, dict]:
        self._ensure_loaded()
        if not isinstance(input_array, np.ndarray):
            raise ValueError("Input must be a numpy array")
        if input_array.ndim != 3 or input_array.shape[2] != 4:
            raise ValueError(f"Input must be RGBA (H,W,4). Got shape {input_array.shape}")
        img_rgb = cv2.cvtColor(input_array, cv2.COLOR_BGRA2RGB)
        with self._lock:
            sam_result = self._adapter.segment_by_points_array(img_rgb, points)
        if isinstance(sam_result, dict):
            return sam_result.get("polygons", []), sam_result
        return [], {}

class BridgeMaskProcessor:
    def __init__(self):
        self.sam_unit = Sam2SegmentationUnit()
        self._processing_times = []

    def _geo_to_pixel(self, geo_point, bounds, resolution):
        """
        Converts geo coordinates (x, y) to pixel coordinates (col, row).
        bounds: (minx, miny, maxx, maxy)
        """
        minx, miny, maxx, maxy = bounds
        
        # Pixel 0,0 is at (minx, maxy)
        # x_pixel = (x_geo - minx) / res
        # y_pixel = (maxy - y_geo) / res
        
        px = (geo_point[0] - minx) / resolution
        py = (maxy - geo_point[1]) / resolution
        return px, py

    def _polygon_to_mask(self, polygons, shape):
        mask = np.zeros(shape[:2], dtype=np.uint8)
        for poly_obj in polygons:
            poly = poly_obj['polygon']
            pts = np.array(poly, dtype=np.int32)
            cv2.fillPoly(mask, [pts], 255)
        return mask

    def _expand_mask(self, mask, px):
        if px <= 0: return mask.copy()
        kernel_size = 2 * int(px) + 1
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
        return cv2.dilate(mask, kernel, iterations=1)

    def _cut_mask_at_ends(self, mask, centerline_px, is_start=False, is_end=False, contract_px=4):
        if len(centerline_px) < 2:
            return mask

        if not is_start and not is_end:
            return mask

        h, w = mask.shape[:2]
        result_mask = mask.copy()
        
        def get_stable_vector(idx_start, step):
            # Normalize start index
            n_points = len(centerline_px)
            curr = idx_start if idx_start >= 0 else n_points + idx_start
            
            p_start = np.array(centerline_px[curr])
            
            idx_next = curr + step
            min_dist = 10.0 # Look ahead 10 pixels for stable direction
            
            vec = None
            
            while 0 <= idx_next < n_points:
                p_next = np.array(centerline_px[idx_next])
                v = p_next - p_start
                dist = np.linalg.norm(v)
                
                if dist > 0:
                    vec = v # Update candidate
                
                if dist >= min_dist:
                    break
                    
                idx_next += step
            
            return vec, p_start

        def apply_cut(idx_start, step, contract_dist):
            vec, p_end = get_stable_vector(idx_start, step)
            
            if vec is None: return
            
            norm = np.linalg.norm(vec)
            if norm == 0: return
            vec_norm = vec / norm
            
            # cut_point is along the centerline from p_end
            cut_point = p_end + vec_norm * contract_dist
            
            perp_vec = np.array([-vec_norm[1], vec_norm[0]])
            
            L = max(h, w) * 2
            pt1 = cut_point + perp_vec * L
            pt2 = cut_point - perp_vec * L
            
            # Polygon covers the "outer" side (towards the tip)
            # vec_norm points Inwards. -vec_norm points Outwards.
            pt3 = cut_point - perp_vec * L - vec_norm * L
            pt4 = cut_point + perp_vec * L - vec_norm * L
            
            pts = np.array([pt1, pt2, pt3, pt4], dtype=np.int32)
            cv2.fillPoly(result_mask, [pts], 0)

        if is_start:
            apply_cut(0, 1, contract_px)
        
        if is_end:
            apply_cut(-1, -1, contract_px)
        
        return result_mask

    def run(self, input_array: np.ndarray, config_json: str) -> tuple[np.ndarray, np.ndarray, np.ndarray, list]:
        """
        Processes input image and returns processed mask arrays.
        Input: RGBA numpy array (H, W, 4)
        Output: Tuple (Raw Mask, Cut Mask, Final Mask, Centerline Points)
                Raw Mask: Uncut and Unexpanded (H, W) - uint8 0/255
                Cut Mask: Cut but Unexpanded (H, W) - uint8 0/255
                Final Mask: Cut and Expanded (H, W) - uint8 0/255
                Centerline Points: List of [x, y] pixels
        """
        start_time = time.time()
        
        try:
            config = json.loads(config_json)
        except json.JSONDecodeError:
            raise ValueError("Invalid JSON string")

        try:
            # 2. Extract Configuration
            geometry = config.get('geometry', {})
            props = config.get('properties', {})
            
            bounds_geo = geometry.get('bounds_geo')
            resolution = props.get('resolution')
            
            if not bounds_geo or resolution is None:
                # Fallback: Try to infer from props if not in standard location
                # But for this task we assume standard format
                raise ValueError("Missing bounds_geo or resolution in config")
                
            center_pt_geo = geometry.get('center_point', {}).get('coordinates')
            centerline_geo = geometry.get('centerline', {}).get('coordinates')
            bridge_width = props.get('bridge_width')
            
            if not center_pt_geo or not centerline_geo:
                raise ValueError("Missing geometry (center_point/centerline)")
                
            # 3. Coordinate Conversion
            cx_px, cy_px = self._geo_to_pixel(center_pt_geo, bounds_geo, resolution)
            
            centerline_px = []
            for pt in centerline_geo:
                px, py = self._geo_to_pixel(pt, bounds_geo, resolution)
                centerline_px.append([px, py])
                
            # 4. SAM2 Segmentation
            points = [[cx_px, cy_px]]
            polygons, _ = self.sam_unit.segment_rgba_by_points(input_array, points)
            if not polygons:
                # Return empty mask
                mask_final = np.zeros(input_array.shape[:2], dtype=np.uint8)
                mask_sam = mask_final.copy()
                mask_bridge = mask_final.copy()
            else:
                mask_raw = self._polygon_to_mask(polygons, input_array.shape)
                
                # 5. Processing Steps
                # a) Expand 2px
                mask_sam = self._expand_mask(mask_raw, 2)
                
                # b) Cut Ends
                is_start = props.get('is_start_segment', False)
                is_end = props.get('is_end_segment', False)
                mask_bridge = self._cut_mask_at_ends(mask_sam, centerline_px, is_start, is_end, contract_px=4)
                
                # c) Extended Mask
                width_px = bridge_width / resolution if bridge_width else 0
                expand_radius = width_px / 2.0
                mask_final = self._expand_mask(mask_bridge, expand_radius)

            # 6. Format Output
            # Return Raw Masks (H, W) uint8
            
            elapsed = time.time() - start_time
            self._processing_times.append(elapsed)
            
            return mask_sam, mask_bridge, mask_final, centerline_px
            
        except Exception as e:
            raise RuntimeError(f"Processing failed: {str(e)}") from e

    def get_average_time(self):
        if not self._processing_times: return 0.0
        return sum(self._processing_times) / len(self._processing_times)

def save_mask_output(mask_array, output_path):
    """Independent output function"""
    if not os.path.exists(os.path.dirname(output_path)):
        os.makedirs(os.path.dirname(output_path))
    # Save as PNG (Assuming mask_array is RGBA or Grayscale)
    # If RGBA and R=G=B, it's a grayscale image effectively
    cv2.imwrite(output_path, mask_array)

if __name__ == "__main__":
    # Example usage
    INPUT_DIR = r"D:\work\devlope\Bridge_Proc\genBridgeData\data\fw\bridge\output"
    OUTPUT_DIR = r"D:\work\devlope\Bridge_Proc\genBridgeData\data\fw\bridge\output\mask"
    
    processor = BridgeMaskProcessor()
    
    if not os.path.exists(INPUT_DIR):
        print("Input directory not found")
    else:
        files = os.listdir(INPUT_DIR)
        json_files = [f for f in files if f.lower().endswith('.json') and not f.endswith('_segments.json')]
        
        print(f"Found {len(json_files)} files to process")
        
        for j in json_files:
            try:
                base_name = os.path.splitext(j)[0]
                json_path = os.path.join(INPUT_DIR, j)
                img_path = os.path.join(INPUT_DIR, base_name + ".png")
                
                if not os.path.exists(img_path): continue
                
                # Read inputs
                # Read as RGBA (BGRA in OpenCV)
                img = cv2.imread(img_path, cv2.IMREAD_UNCHANGED)
                if img is None: continue
                if img.ndim == 2: img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGRA)
                elif img.shape[2] == 3: img = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
                
                with open(json_path, 'r', encoding='utf-8') as f:
                    config_str = f.read()
                    
                # Run Processor
                mask_raw, mask_cut, mask_final, centerline = processor.run(img, config_str)
                
                # Save individual masks (Black Background / Grayscale)
                save_mask_output(mask_raw, os.path.join(OUTPUT_DIR, base_name + "_mask_raw.png"))
                save_mask_output(mask_cut, os.path.join(OUTPUT_DIR, base_name + "_mask_cut.png"))
                save_mask_output(mask_final, os.path.join(OUTPUT_DIR, base_name + "_mask_final.png"))

                # Visualization Composite
                vis = img.copy()
                # Ensure BGRA
                if vis.shape[2] == 3:
                    vis = cv2.cvtColor(vis, cv2.COLOR_BGR2BGRA)
                else:
                    # Make sure alpha is 255 for base image
                    vis[:, :, 3] = 255
                    
                # Create Black Background Composite
                vis_black = np.zeros_like(vis)
                vis_black[:, :, 3] = 255 # Opaque alpha
                    
                def blend_mask(image, mask, color, alpha):
                    # mask is uint8 0/255
                    # image is uint8 BGRA
                    # color is (B, G, R)
                    if mask is None: return image
                    
                    roi_indices = mask > 0
                    if not np.any(roi_indices): return image
                    
                    # Extract ROI
                    bg_roi = image[roi_indices, :3].astype(np.float32)
                    
                    # Target Color (apply alpha to source color)
                    fg_color = np.array(color, dtype=np.float32)
                    
                    # Simple alpha blending
                    blended = bg_roi * (1.0 - alpha) + fg_color * alpha
                    
                    image[roi_indices, :3] = blended.astype(np.uint8)
                    return image

                # Colors (B, G, R)
                # 1. Final Mask (Broadest) - Blue
                blue = (255, 0, 0)
                vis = blend_mask(vis, mask_final, blue, 0.3)
                vis_black = blend_mask(vis_black, mask_final, blue, 0.3)
                
                # 2. Cut Mask (Middle) - Green
                green = (0, 255, 0)
                vis = blend_mask(vis, mask_cut, green, 0.3)
                vis_black = blend_mask(vis_black, mask_cut, green, 0.3)
                
                # 3. Raw Mask (Core) - Red
                red = (0, 0, 255)
                vis = blend_mask(vis, mask_raw, red, 0.3)
                vis_black = blend_mask(vis_black, mask_raw, red, 0.3)
                
                # 4. Centerline (Red - Opaque/Bright)
                if len(centerline) > 1:
                    pts = np.array(centerline, np.int32).reshape((-1, 1, 2))
                    # Bright Red Line (B=0, G=0, R=255)
                    cv2.polylines(vis, [pts], isClosed=False, color=(0, 0, 255, 255), thickness=2)
                    cv2.polylines(vis_black, [pts], isClosed=False, color=(0, 0, 255, 255), thickness=2)
                
                # Save Output
                out_path = os.path.join(OUTPUT_DIR, base_name + "_vis.png")
                save_mask_output(vis, out_path)
                
                out_path_black = os.path.join(OUTPUT_DIR, base_name + "_vis_black.png")
                save_mask_output(vis_black, out_path_black)
                
                print(f"Processed {base_name}")
                
            except Exception as e:
                print(f"Error in main loop for {j}: {e}")
                # traceback.print_exc()

        print(f"Average processing time: {processor.get_average_time():.4f}s")
