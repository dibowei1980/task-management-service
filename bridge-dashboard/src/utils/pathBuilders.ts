type MaskPathItem = {
  mergedMaskPath?: string;
  overlayPath?: string;
  maskCutPath?: string;
  maskSamPath?: string;
  shadowMaskPath?: string;
};

export const buildMaskPath = (jsonPath: string, segmentName?: string, maskItem?: MaskPathItem | null) => {
  if (maskItem?.mergedMaskPath) return maskItem.mergedMaskPath.replace(/\\/g, '/');
  if (maskItem?.overlayPath) return maskItem.overlayPath.replace(/\\/g, '/');
  const normalized = (jsonPath || '').replace(/\\/g, '/');
  if (!normalized) return '';
  const idx = normalized.lastIndexOf('/');
  if (idx < 0) return '';
  const dir = normalized.slice(0, idx);
  const maskDir = dir.replace(/\/segments$/i, '/masks');
  const base = normalized.slice(idx + 1);
  const name = base.replace(/(\.json|\.png|\.tif|\.tiff)$/i, '');
  if (!name) return '';
  return `${maskDir}/${name}/${name}_mask_with_shadow.png`;
};

export const buildMaskCutPath = (jsonPath: string, segmentName?: string, maskItem?: MaskPathItem | null) => {
  if (maskItem?.maskCutPath) return maskItem.maskCutPath.replace(/\\/g, '/');
  const normalized = (jsonPath || '').replace(/\\/g, '/');
  if (!normalized) return '';
  const idx = normalized.lastIndexOf('/');
  if (idx < 0) return '';
  const dir = normalized.slice(0, idx);
  const maskDir = dir.replace(/\/segments$/i, '/masks');
  const base = normalized.slice(idx + 1);
  const name = base.replace(/(\.json|\.png|\.tif|\.tiff)$/i, '');
  if (!name) return '';
  return `${maskDir}/${name}/${name}_mask_cut_with_shadow.png`;
};
