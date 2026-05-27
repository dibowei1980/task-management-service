import os
import cv2
import numpy as np
import logging

try:
    from PIL import Image
except ImportError:
    Image = None

logger = logging.getLogger(__name__)


def safe_imwrite(path: str, img: np.ndarray) -> bool:
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    try:
        success = cv2.imwrite(path, img)
    except Exception as e:
        logger.warning("cv2.imwrite exception for %s: %s", path, e)
        success = False
    if not success or not os.path.isfile(path):
        logger.warning("cv2.imwrite failed for %s (success=%s, exists=%s), trying PIL fallback", path, success, os.path.isfile(path))
        try:
            if Image is None:
                return False
            if img.ndim == 2:
                pil_img = Image.fromarray(img).convert("RGB")
            elif img.shape[2] == 4:
                pil_img = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGRA2RGBA))
            elif img.shape[2] == 3:
                pil_img = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
            else:
                logger.warning("Unsupported image shape for PIL fallback: %s", img.shape)
                return False
            pil_img.save(path)
            exists = os.path.isfile(path)
            if not exists:
                logger.warning("PIL.save also failed for %s", path)
            return exists
        except Exception as e:
            logger.warning("PIL fallback also failed for %s: %s", path, e)
            return False
    return True
