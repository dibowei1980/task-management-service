import os
import base64
import io
from typing import List, Dict, Any
from pathlib import Path

import numpy as np

try:
    from PIL import Image
except Exception:
    Image = None

try:
    import cv2
except Exception:
    cv2 = None


def _load_env_config_from_root():
    try:
        root = Path(__file__).resolve().parent
        p = root / 'env.config'
        if not p.exists():
            return
        for line in p.read_text(encoding='utf-8').splitlines():
            s = line.strip()
            if not s or s.startswith('#'):
                continue
            if '=' in s:
                k, v = s.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())
    except Exception:
        pass


class SAM2Adapter:
    def __init__(self):
        _load_env_config_from_root()
        self.ckpt = os.environ.get('SAM2_CHECKPOINT_PATH', 'models/sam2.1_l.pt')
        self.model_type = os.environ.get('SAM2_MODEL_TYPE', 'sam2.1_l')
        self.device = os.environ.get('SAM2_DEVICE', 'auto')
        self.config_path = os.environ.get('SAM2_CONFIG_PATH', 'models/sam2.1_l.yaml')
        self.points_per_side = int(os.environ.get('SAM2_POINTS_PER_SIDE', '32'))
        self.pred_iou_thresh = float(os.environ.get('SAM2_PRED_IOU', '0.86'))
        self.stability_score_thresh = float(os.environ.get('SAM2_STABILITY', '0.92'))
        self.min_mask_region_area = int(os.environ.get('SAM2_MIN_REGION', '100'))
        root = Path(__file__).resolve().parent
        cp = Path(self.ckpt)
        if not cp.is_absolute():
            cp = (root / cp).resolve()
        self.ckpt = str(cp)
        if self.config_path:
            cfgp = Path(self.config_path)
            if not cfgp.is_absolute():
                cfgp = (root / cfgp).resolve()
            self.config_path = str(cfgp)
        self.predictor = None

    def _ensure_predictor(self):
        if self.predictor is not None:
            return
        try:
            cp = Path(self.ckpt)
            if not cp.exists() or cp.is_dir():
                raise RuntimeError(f'SAM2_CHECKPOINT_PATH 不存在: {self.ckpt}')
            if cp.stat().st_size == 0:
                raise RuntimeError(f'SAM2_CHECKPOINT_PATH 文件为空: {self.ckpt}')
        except Exception:
            raise RuntimeError(f'SAM2_CHECKPOINT_PATH 无法访问: {self.ckpt}')
        dev = 'cuda' if self.device == 'auto' else self.device
        try:
            import torch
            if self.device == 'auto':
                dev = 'cuda' if torch.cuda.is_available() else 'cpu'
        except Exception:
            dev = 'cpu'
        def map_type(mt: str) -> str:
            mt = (mt or '').strip().lower()
            return {'sam2_h': 'vit_h', 'sam2.1_h': 'vit_h', 'sam2.1_l':'vit_l', 'sam2_l': 'vit_l', 'sam2.1_l': 'vit_l', 'sam2_b': 'vit_b', 'sam2.1_b': 'vit_b'}.get(mt, mt)
        try:
            from sam2.build_sam import build_sam2
            from sam2.sam2_image_predictor import SAM2ImagePredictor
            cfg = self.config_path
            if not cfg:
                try:
                    from importlib.resources import files
                    cfg = str(files('sam2').joinpath(f'configs/sam2/{self.model_type}.yaml'))
                except Exception:
                    cfg = ''
            if cfg and Path(cfg).exists():
                sam = build_sam2(cfg, self.ckpt)
                sam.to(dev)
                self.predictor = SAM2ImagePredictor(sam)
                return
        except Exception as e:
            log(e)
            raise RuntimeError('SAM2/SAM 加载失败，请检查模型类型与权重路径')

    def _image_from_data_url(self, data_url: str):
        header, b64 = data_url.split(',', 1)
        img_bytes = base64.b64decode(b64)
        if Image is None:
            raise RuntimeError('未安装 Pillow')
        img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
        print(f"[DEBUG] 收到图像尺寸: {img.width}x{img.height}")
        return img

    def segment(self, image_data_url: str, boxes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if cv2 is None:
            raise RuntimeError('未安装 opencv-python')
        self._ensure_predictor()
        img = self._image_from_data_url(image_data_url)
        arr = np.array(img)
        self.predictor.set_image(arr)
        polys: List[Dict[str, Any]] = []
        for b in boxes or []:
            x = float(b.get('x', 0)); y = float(b.get('y', 0)); w = float(b.get('w', 0)); h = float(b.get('h', 0))
            box = np.array([x, y, x + w, y + h])
            try:
                masks = self.predictor.predict(box=box, multimask_output=True)
            except Exception:
                masks = self.predictor.predict(box=box)
            m = self._select_mask(masks)
            if m is not None:
                poly = self._mask_to_polygon(m)
                if poly:
                    polys.append({'polygon': poly, 'score': float(b.get('score', 0.5)), 'label': b.get('label', 'bridge')})
        return polys

    def segment_by_points(self, image_data_url: str, points: List[List[float]]) -> Dict[str, Any]:
        if cv2 is None:
            raise RuntimeError('未安装 opencv-python')
        if not points:
            return {'boxes': [], 'polygons': []}
        self._ensure_predictor()
        img = self._image_from_data_url(image_data_url)
        arr = np.array(img)
        return self._process_points(arr, points)

    def segment_by_points_array(self, image_array: np.ndarray, points: List[List[float]]) -> Dict[str, Any]:
        """
        Directly process numpy array image.
        image_array: RGB numpy array (H, W, 3)
        """
        if cv2 is None:
            raise RuntimeError('未安装 opencv-python')
        if not points:
            return {'boxes': [], 'polygons': []}
        self._ensure_predictor()
        return self._process_points(image_array, points)

    def _process_points(self, arr: np.ndarray, points: List[List[float]]) -> Dict[str, Any]:
        self.predictor.set_image(arr)
        H, W = arr.shape[:2]
        pts_list: List[List[float]] = []
        for p in points:
            try:
                x = float(p[0])
                y = float(p[1])
                if not np.isfinite(x) or not np.isfinite(y):
                    continue
                x = max(0.0, min(float(W - 1), x))
                y = max(0.0, min(float(H - 1), y))
                pts_list.append([x, y])
            except Exception:
                continue
        if not pts_list:
            return {'boxes': [], 'polygons': []}
        pts = np.array([pts_list[0]], dtype=np.float32)
        lbl = np.array([1], dtype=np.int32)
        x0 = min(x for x, _ in pts_list)
        y0 = min(y for _, y in pts_list)
        x1 = max(x for x, _ in pts_list)
        y1 = max(y for _, y in pts_list)
        import torch
        masks = None
        scores = None
        logits = None
        out = None
        try:
            if torch.cuda.is_available():
                with torch.inference_mode(), torch.autocast('cuda', dtype=torch.bfloat16):
                    masks, scores, logits = self.predictor.predict(point_coords=pts, point_labels=lbl, multimask_output=True)
            else:
                with torch.inference_mode():
                    masks, scores, logits = self.predictor.predict(point_coords=pts, point_labels=lbl, multimask_output=True)
        except Exception:
            out = self.predictor.predict(point_coords=pts, point_labels=lbl, multimask_output=True)
        if masks is None:
            if isinstance(out, tuple) and len(out) >= 2:
                masks, scores = out[0], out[1]
            elif isinstance(out, dict) and 'masks' in out:
                masks = out['masks']
            elif isinstance(out, list):
                masks = out
            elif hasattr(out, 'shape'):
                masks = [out]
        # normalize masks into a list of 2D arrays
        if isinstance(masks, np.ndarray):
            if masks.ndim == 3:
                masks = [masks[i] for i in range(masks.shape[0])]
            elif masks.ndim == 2:
                masks = [masks]
        polygons: List[Dict[str, Any]] = []
        boxes: List[Dict[str, Any]] = []
        candidates = []
        if isinstance(masks, (list, tuple)):
            candidates = list(masks)
        elif isinstance(masks, np.ndarray):
            if masks.ndim == 3:
                candidates = [masks[i] for i in range(masks.shape[0])]
            elif masks.ndim == 2:
                candidates = [masks]
        elif masks is not None:
            candidates = [masks]
        scores_arr = None
        try:
            if scores is not None:
                scores_arr = np.array(scores).reshape(-1)
        except Exception:
            scores_arr = None
        def _mask_bin(m):
            if isinstance(m, dict) and 'segmentation' in m:
                v = m['segmentation']
                a = v if isinstance(v, np.ndarray) else np.array(v)
            else:
                a = m if isinstance(m, np.ndarray) else np.array(m)
            if a.ndim > 2:
                a = np.squeeze(a)
                if a.ndim > 2:
                    a = a[0]
            return (a > 0).astype(np.uint8)
        def _area(a):
            return float(np.count_nonzero(a))
        def _points_covered(a):
            c = 0
            for x, y in pts_list:
                ix = int(round(x)); iy = int(round(y))
                ix = max(0, min(int(W - 1), ix))
                iy = max(0, min(int(H - 1), iy))
                if a[iy, ix] > 0:
                    c += 1
            return float(c) / float(max(1, len(pts_list)))
        if candidates:
            idx = 0
            if scores_arr is not None and len(scores_arr) > 0:
                try:
                    idx = int(np.argmax(scores_arr))
                except Exception:
                    idx = 0
            idx = max(0, min(len(candidates) - 1, idx))
            m = candidates[idx]
            poly = self._mask_to_polygon(m)
            if poly:
                xx0 = min(p[0] for p in poly); yy0 = min(p[1] for p in poly)
                xx1 = max(p[0] for p in poly); yy1 = max(p[1] for p in poly)
                sc_out = 0.5
                if scores_arr is not None and idx < len(scores_arr):
                    try:
                        sc_out = float(scores_arr[idx])
                    except Exception:
                        sc_out = 0.5
                boxes.append({'x': float(xx0), 'y': float(yy0), 'w': float(max(0.0, xx1-xx0)), 'h': float(max(0.0, yy1-yy0)), 'score': sc_out, 'label': 'bridge'})
                polygons.append({'polygon': poly, 'score': sc_out, 'label': 'bridge'})
        return {'boxes': boxes, 'polygons': polygons}

    def segment_full(self, image_data_url: str) -> Dict[str, Any]:
        if cv2 is None:
            raise RuntimeError('未安装 opencv-python')
        self._ensure_predictor()
        img = self._image_from_data_url(image_data_url)
        arr = np.array(img)
        self.predictor.set_image(arr)
        masks = self._auto_masks(arr)
        polygons: List[Dict[str, Any]] = []
        boxes: List[Dict[str, Any]] = []
        for m in masks:
            poly = self._mask_to_polygon(m)
            if not poly:
                continue
            polygons.append({'polygon': poly, 'score': 0.5, 'label': 'bridge'})
            x0 = min(p[0] for p in poly); y0 = min(p[1] for p in poly)
            x1 = max(p[0] for p in poly); y1 = max(p[1] for p in poly)
            boxes.append({'x': float(x0), 'y': float(y0), 'w': float(max(0.0, x1 - x0)), 'h': float(max(0.0, y1 - y0)), 'score': 0.5, 'label': 'bridge'})
        return {'boxes': boxes, 'polygons': polygons}

    def _select_mask(self, masks):
        if masks is None:
            return None
        if isinstance(masks, dict) and 'masks' in masks:
            m = masks['masks']
        else:
            m = masks
        if isinstance(m, list) and len(m):
            return m[0]
        if hasattr(m, 'shape'):
            return m
        return None

    def _auto_masks(self, arr):
        def _auto_params(h: int, w: int):
            base_pps = self.points_per_side
            base_min = self.min_mask_region_area
            s = max(1.0, (min(h, w) / 1024.0))
            pps = int(max(16, min(128, round(base_pps * s))))
            min_area = int(max(64, min((h * w) // 50, round(base_min * s * s))))
            return pps, min_area
        try:
            from sam2.build_sam import build_sam2
            from sam2.sam2_image_predictor import SAM2ImagePredictor
            import torch
            dev = 'cuda' if torch.cuda.is_available() else 'cpu'
            cfg = getattr(self, 'config_path', '')
            if not cfg:
                try:
                    from importlib.resources import files
                    cfg = str(files('sam2').joinpath(f'configs/sam2/{self.model_type}.yaml'))
                except Exception:
                    cfg = ''
            if cfg and Path(cfg).exists():
                try:
                    sam = build_sam2(config_file=cfg, ckpt=self.ckpt)
                except Exception:
                    sam = build_sam2(config_file=cfg, checkpoint=self.ckpt)
                sam.to(dev)
                predictor = SAM2ImagePredictor(sam)
                predictor.set_image(arr)
                H, W = arr.shape[:2]
                pps, _ = _auto_params(H, W)
                step = max(8, min(H, W) // max(1, pps))
                masks = []
                for y in range(step//2, H, step):
                    for x in range(step//2, W, step):
                        pts = np.array([[x, y]], dtype=np.float32)
                        lbl = np.array([1], dtype=np.int32)
                        try:
                            out = predictor.predict(point_coords=pts, point_labels=lbl, multimask_output=True)
                        except Exception:
                            out = predictor.predict(point_coords=pts, point_labels=lbl)
                        if isinstance(out, dict) and 'masks' in out:
                            for m in out['masks']:
                                masks.append({'segmentation': m})
                        elif isinstance(out, list):
                            for m in out:
                                masks.append({'segmentation': m})
                        elif hasattr(out, 'shape'):
                            masks.append({'segmentation': out})
                if masks:
                    return masks
        except Exception:
            pass
        try:
            from segment_anything import SamAutomaticMaskGenerator, sam_model_registry
            import torch
            mt = (self.model_type or '').strip().lower()
            mt = {'sam2_h': 'vit_h', 'sam2.1_h': 'vit_h', 'sam2_l': 'vit_l', 'sam2.1_l': 'vit_l', 'sam2_b': 'vit_b', 'sam2.1_b': 'vit_b'}.get(mt, 'vit_h')
            orig_load = torch.load
            def _safe_load(f, *args, **kwargs):
                kwargs.setdefault('weights_only', True)
                return orig_load(f, *args, **kwargs)
            torch.load = _safe_load
            try:
                sam = sam_model_registry[mt](checkpoint=self.ckpt)
            finally:
                torch.load = orig_load
            H, W = arr.shape[:2]
            pps, min_area = _auto_params(H, W)
            masks = SamAutomaticMaskGenerator(
                sam,
                points_per_side=pps,
                pred_iou_thresh=self.pred_iou_thresh,
                stability_score_thresh=self.stability_score_thresh,
                min_mask_region_area=min_area,
            ).generate(arr)
            if masks:
                return masks
        except Exception:
            pass
        # Fallback: grid sampling with predictor
        try:
            self._ensure_predictor()
            self.predictor.set_image(arr)
            H, W = arr.shape[:2]
            pps, _ = _auto_params(H, W)
            step = max(8, min(H, W) // max(1, pps))
            masks = []
            for y in range(step//2, H, step):
                for x in range(step//2, W, step):
                    pts = np.array([[x, y]], dtype=np.float32)
                    lbl = np.array([1], dtype=np.int32)
                    try:
                        out = self.predictor.predict(point_coords=pts, point_labels=lbl, multimask_output=True)
                    except Exception:
                        out = self.predictor.predict(point_coords=pts, point_labels=lbl)
                    if isinstance(out, dict) and 'masks' in out:
                        for m in out['masks']:
                            masks.append({'segmentation': m})
                    elif isinstance(out, list):
                        for m in out:
                            masks.append({'segmentation': m})
                    elif hasattr(out, 'shape'):
                        masks.append({'segmentation': out})
            return masks
        except Exception:
            return []

    def _mask_to_polygon(self, mask) -> List[List[float]]:
        if isinstance(mask, dict) and 'segmentation' in mask:
            seg = mask['segmentation']
            if isinstance(seg, np.ndarray):
                binm = seg
            else:
                try:
                    binm = np.array(seg)
                except Exception:
                    return []
        elif isinstance(mask, np.ndarray):
            binm = mask
        else:
            return []
        try:
            if binm.ndim > 2:
                binm = np.squeeze(binm)
            if binm.ndim > 2:
                binm = binm[0]
            if binm.dtype != np.uint8:
                binm = (binm > 0).astype(np.uint8)
        except Exception:
            return []
        contours, _ = cv2.findContours(binm, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return []
        cnt = max(contours, key=cv2.contourArea)
        poly = [[float(p[0][0]), float(p[0][1])] for p in cnt]
        return poly
