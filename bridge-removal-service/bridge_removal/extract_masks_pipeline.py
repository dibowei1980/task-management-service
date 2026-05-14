import os
import cv2
import numpy as np
import traceback
import json
import sys
try:
    from bridge_removal.bridge_mask_sam2 import BridgeMaskProcessor
except Exception:
    from bridge_mask_sam2 import BridgeMaskProcessor
try:
    from bridge_removal.bridge_shadow_extract2 import ShadowDetector
except Exception:
    from bridge_shadow_extract2 import ShadowDetector



class ExtractMasksPipeline:
    def __init__(
        self,
        dilate_kernel_size=(5, 5),
        dilate_iterations=1,
        overlay_color_bgr=(0, 0, 255),
        overlay_alpha=0.5,
    ):
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        sys.path.append(root)
        self.mask_processor = BridgeMaskProcessor()
        self.shadow_detector =  ShadowDetector(ps=0.4, beta=0.25, v_theta=25, delta=0.15, iterations=30)
        self.dilate_kernel_size = dilate_kernel_size
        self.dilate_iterations = dilate_iterations
        self.overlay_color_bgr = overlay_color_bgr
        self.overlay_alpha = overlay_alpha

    def run(self, payload_text, mod='bigBridge'):
        segment_payload = json.loads(payload_text)
        segment_json_path = segment_payload.get("segment_json_path")
        if not segment_json_path:
            raise ValueError("segment_json_path is required in segment_payload")

        base_dir = os.path.dirname(os.path.normpath(segment_json_path))

        image_info = segment_payload.get("image_info") or {}
        img_filename = image_info.get("filename")
        if not img_filename:
            raise ValueError("image_info.filename is required in segment_payload")

        img_path = os.path.join(base_dir, img_filename)
        base_name = os.path.splitext(img_filename)[0]
        output_dir = os.path.join(os.path.dirname(base_dir), "masks", base_name)
        mask_path = segment_payload.get("mask_cut_path") or os.path.join(base_dir, f"{base_name}_mask_cut.png")
        json_path = segment_json_path
        result = {
            "segment_json_path": segment_json_path,
            "output_dir": output_dir,
            "base_name": base_name,
        }

        print("Starting Shadow Extraction...")
        os.makedirs(output_dir, exist_ok=True)

        print(f"  Processing segment: {base_name}")

        image = cv2.imread(img_path)
        if image is None:
            print(f"    Failed to read image: {img_path}")
            result["status"] = "failed"
            result["error"] = "image_read_failed"
            return result

        try:
            mask_sam, mask_cut = self._run_sam2(
                image=image,
                json_path=json_path,
                output_dir=output_dir,
                base_dir=base_dir,
                mask_path=mask_path,
                base_name=base_name,
            )
            results = self.shadow_detector.detect_shadows(image, mask_path, json_path)
            (
                shadow_mask,
                stretched_feature,
                binary_result,
                final_result,
                shadow_eroded,
                centerlines,
                split_labels,
                removed_shadow_mask,
            ) = results

            shadow_out_path = os.path.join(output_dir, f"{base_name}_shadow_mask.png")
            cv2.imwrite(shadow_out_path, shadow_mask)

            merged_sam, merged_cut = self._merge_masks(mask_sam, mask_cut, shadow_mask)
            merged_sam, merged_cut = self._dilate_merged_masks(merged_sam, merged_cut)

            merged_dir = os.path.join(output_dir, "merged")
            os.makedirs(merged_dir, exist_ok=True)
            merged_sam_path = os.path.join(merged_dir, f"{base_name}_mask_sam.png")
            merged_cut_path = os.path.join(merged_dir, f"{base_name}_mask_cut.png")
            cv2.imwrite(merged_sam_path, merged_sam)
            cv2.imwrite(merged_cut_path, merged_cut)

            cut_merged_path = os.path.join(output_dir, f"{base_name}_mask_cut_with_shadow.png")
            cv2.imwrite(cut_merged_path, merged_cut)
            #print(f"    Saved merged mask (Cut + Shadow) to: {cut_merged_path}")


            final_merged_path = os.path.join(output_dir, f"{base_name}_mask_with_shadow.png") 
            if mod!='bigBridge' :
                merged_sam = merged_cut
            cv2.imwrite(final_merged_path, merged_sam) 
            #print(f"    Saved merged mask (SAM + Shadow) to: {final_merged_path}")

            overlay_save_path = os.path.join(output_dir, f"{base_name}_overlay.png")
            overlay_img = self._overlay_mask_on_image(image, merged_sam)
            cv2.imwrite(overlay_save_path, overlay_img)
            #print(f"    Saved overlay image to: {overlay_save_path}")

            vis_path = os.path.join(output_dir, f"{base_name}_vis.png")
            self.shadow_detector.visualize_results(
                image,
                shadow_mask,
                stretched_feature,
                binary_result,
                final_result,
                shadow_eroded,
                bridge_mask_path=mask_path,
                centerlines=centerlines,
                split_labels=split_labels,
                removed_shadow_mask=removed_shadow_mask,
                save_path=vis_path,
            )
            result["status"] = "completed"
        except Exception as e:
            print(f"    Error in shadow detection: {e}")
            traceback.print_exc()
            result["status"] = "failed"
            result["error"] = str(e)
        return result

    def _run_sam2(self, image, json_path, output_dir, base_dir, mask_path, base_name):
        print(f"    Running SAM2 for {base_name}...")

        mask_sam = None
        mask_cut = None

        try:
            with open(json_path, "r", encoding="utf-8") as f:
                config_str = f.read()

            if image.shape[2] == 3:
                image_bgra = cv2.cvtColor(image, cv2.COLOR_BGR2BGRA)
            else:
                image_bgra = image

            mask_sam, mask_cut, _, _ = self.mask_processor.run(image_bgra, config_str)

            sam_out_path = os.path.join(output_dir, f"{base_name}_mask_sam.png")
            cut_out_path = os.path.join(output_dir, f"{base_name}_mask_cut.png")
            cv2.imwrite(sam_out_path, mask_sam)
            cv2.imwrite(cut_out_path, mask_cut)

            sam_data_path = os.path.join(base_dir, f"{base_name}_mask_sam.png")
            cut_data_path = os.path.join(base_dir, f"{base_name}_mask_cut.png")
            cv2.imwrite(sam_data_path, mask_sam)
            cv2.imwrite(cut_data_path, mask_cut)
        except Exception as e:
            print(f"    Error during SAM2 processing: {e}")
            if mask_cut is None and os.path.exists(mask_path):
                mask_cut = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
            sam_path = os.path.join(base_dir, f"{base_name}_mask_sam.png")
            if mask_sam is None and os.path.exists(sam_path):
                mask_sam = cv2.imread(sam_path, cv2.IMREAD_GRAYSCALE)

        return mask_sam, mask_cut

    
    def _merge_masks(self, sam_mask, cut_mask, shadow_mask):
        """
        将阴影掩码与SAM掩码、Cut掩码进行合并。
        如果shadow_mask为None，则直接返回原掩码；
        否则，使用按位或操作将阴影区域叠加到对应掩码上。
        参数:
            sam_mask: SAM生成的掩码（可能为None）
            cut_mask: Cut生成的掩码（可能为None）
            shadow_mask: 阴影检测得到的掩码（可能为None）
        返回:
            tuple: (合并后的SAM掩码, 合并后的Cut掩码)
        """
        if shadow_mask is None:
            return sam_mask, cut_mask
        merged_sam = cv2.bitwise_or(sam_mask, shadow_mask) if sam_mask is not None else shadow_mask.copy()
        merged_cut = cv2.bitwise_or(cut_mask, shadow_mask) if cut_mask is not None else shadow_mask.copy()
        return merged_sam, merged_cut

    def _dilate_merged_masks(self, merged_sam, merged_cut):
        """
        对合并后的掩码进行膨胀处理，以扩大掩码区域。
        参数:
            merged_sam: 合并后的SAM掩码（可能为None）
            merged_cut: 合并后的Cut掩码（可能为None）
        返回:
            tuple: (膨胀后的merged_sam, 膨胀后的merged_cut)
        """
        # 创建矩形结构元素用于膨胀操作
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, self.dilate_kernel_size)
        if merged_sam is not None:
            merged_sam = cv2.dilate(merged_sam, kernel, iterations=self.dilate_iterations)
        if merged_cut is not None:
            merged_cut = cv2.dilate(merged_cut, kernel, iterations=self.dilate_iterations)
        return merged_sam, merged_cut

    def _overlay_mask_on_image(self, image, mask):
        overlay_img = image.copy()
        if mask is None:
            return overlay_img

        mask_indices = mask == 255
        if not np.any(mask_indices):
            return overlay_img

        color_mask = np.zeros_like(overlay_img)
        color_mask[mask_indices] = self.overlay_color_bgr

        blended = cv2.addWeighted(
            overlay_img[mask_indices],
            1 - self.overlay_alpha,
            color_mask[mask_indices],
            self.overlay_alpha,
            0,
        )
        overlay_img[mask_indices] = blended
        return overlay_img
