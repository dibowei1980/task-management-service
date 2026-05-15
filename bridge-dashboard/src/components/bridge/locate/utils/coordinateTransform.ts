import type { Tfw } from '../types';

export const computeBoundsWorld = (tfw: Tfw | undefined, width: number, height: number) => {
  if (!tfw) return null;
  const corners: Array<[number, number]> = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [col, row] of corners) {
    const x = tfw.a * col + tfw.b * row + tfw.c;
    const y = tfw.d * col + tfw.e * row + tfw.f;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
  return { minX, minY, maxX, maxY };
};

export const pixelToWorld = (tfw: Tfw | undefined, px: [number, number]) => {
  if (!tfw) return null;
  const [col, row] = px;
  const x = tfw.a * col + tfw.b * row + tfw.c;
  const y = tfw.d * col + tfw.e * row + tfw.f;
  return [x, y] as [number, number];
};

export const worldToPixel = (tfw: Tfw | undefined, world: [number, number]) => {
  if (!tfw) return null;
  const det = tfw.a * tfw.e - tfw.b * tfw.d;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const x = world[0] - tfw.c;
  const y = world[1] - tfw.f;
  const col = (tfw.e * x - tfw.b * y) / det;
  const row = (-tfw.d * x + tfw.a * y) / det;
  return [col, row] as [number, number];
};

export const pointInPolygon = (point: [number, number], poly: Array<[number, number]>) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > point[1]) !== (yj > point[1]))
      && (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

export const fitToBounds = (bounds: { minX: number; minY: number; maxX: number; maxY: number }, viewW: number, viewH: number) => {
  const worldW = Math.max(1e-9, bounds.maxX - bounds.minX);
  const worldH = Math.max(1e-9, bounds.maxY - bounds.minY);
  const scale = Math.max(1e-9, Math.min(viewW / worldW, viewH / worldH));
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const offsetX = viewW / 2 - centerX * scale;
  const offsetY = viewH / 2 + centerY * scale;
  return { scale, offsetX, offsetY };
};

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));