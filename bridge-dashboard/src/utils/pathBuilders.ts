export const buildMaskPath = (jsonPath: string, segmentName?: string) => {
  const normalized = (jsonPath || '').replace(/\\/g, '/');
  if (!normalized) return '';
  const idx = normalized.lastIndexOf('/');
  if (idx < 0) return '';
  const dir = normalized.slice(0, idx);
  const maskDir = dir.replace(/\/segments$/i, '/masks');
  const base = (segmentName || '').replace(/\\/g, '/').split('/').pop() || '';
  const name = base.replace(/(\.json|\.png|\.tif|\.tiff)$/i, '');
  if (!name) return '';
  return `${maskDir}/${name}/${name}_mask_with_shadow.png`;
};

export const buildMaskCutPath = (jsonPath: string, segmentName?: string) => {
  const normalized = (jsonPath || '').replace(/\\/g, '/');
  if (!normalized) return '';
  const idx = normalized.lastIndexOf('/');
  if (idx < 0) return '';
  const dir = normalized.slice(0, idx);
  const maskDir = dir.replace(/\/segments$/i, '/masks');
  const base = (segmentName || '').replace(/\\/g, '/').split('/').pop() || '';
  const name = base.replace(/(\.json|\.png|\.tif|\.tiff)$/i, '');
  if (!name) return '';
  return `${maskDir}/${name}/${name}_mask_cut_with_shadow.png`;
};