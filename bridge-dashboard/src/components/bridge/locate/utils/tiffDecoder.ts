import type { Raster } from '../types';

export const basename = (p: string) => {
  const s = (p || '').replace(/\\/g, '/');
  const idx = s.lastIndexOf('/');
  return idx >= 0 ? s.slice(idx + 1) : s;
};

export const normalizePath = (p: string | null | undefined) => (p || '').replace(/\\/g, '/').trim().toLowerCase();

export const isTiffPath = (p: string) => {
  const s = (p || '').toLowerCase();
  return s.endsWith('.tif') || s.endsWith('.tiff');
};

export const decodeTiffToRgba = async (buf: ArrayBuffer): Promise<Raster> => {
  const mod = await import('geotiff');
  const tiff = await mod.fromArrayBuffer(buf);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const samples = image.getSamplesPerPixel();
  const data = await image.readRasters({ interleave: true }) as unknown as (Uint8Array | Uint16Array | Float32Array);
  const dataArray: ArrayLike<number> = data;

  const rgba = new Uint8ClampedArray(width * height * 4);
  const clamp8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

  if (samples === 1) {
    for (let i = 0; i < width * height; i++) {
      const v = clamp8(dataArray[i]);
      const o = i * 4;
      rgba[o] = v;
      rgba[o + 1] = v;
      rgba[o + 2] = v;
      rgba[o + 3] = 255;
    }
    return { width, height, rgba };
  }
  if (samples === 3 || samples === 4) {
    for (let i = 0; i < width * height; i++) {
      const o = i * 4;
      const di = i * samples;
      rgba[o] = clamp8(dataArray[di]);
      rgba[o + 1] = clamp8(dataArray[di + 1]);
      rgba[o + 2] = clamp8(dataArray[di + 2]);
      rgba[o + 3] = samples === 4 ? clamp8(dataArray[di + 3]) : 255;
    }
    return { width, height, rgba };
  }

  for (let i = 0; i < width * height; i++) {
    const v = clamp8(dataArray[i * samples]);
    const o = i * 4;
    rgba[o] = v;
    rgba[o + 1] = v;
    rgba[o + 2] = v;
    rgba[o + 3] = 255;
  }
  return { width, height, rgba };
};

export const blobUrlFromArrayBuffer = (buf: ArrayBuffer, contentType: string) => {
  const blob = new Blob([buf], { type: contentType || 'application/octet-stream' });
  return URL.createObjectURL(blob);
};

export const createBitmapFromRgba = async (raster: Raster) => {
  const c = document.createElement('canvas');
  c.width = raster.width;
  c.height = raster.height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas_ctx_missing');
  const imgData = new ImageData(new Uint8ClampedArray(raster.rgba.buffer as ArrayBuffer), raster.width, raster.height);
  ctx.putImageData(imgData, 0, 0);
  return await createImageBitmap(c);
};

export const createBitmapFromImageBuffer = async (buf: ArrayBuffer, contentType: string) => {
  const url = blobUrlFromArrayBuffer(buf, contentType.startsWith('image/') ? contentType : 'image/png');
  try {
    const blob = await fetch(url).then(r => r.blob());
    return await createImageBitmap(blob);
  } finally {
    URL.revokeObjectURL(url);
  }
};