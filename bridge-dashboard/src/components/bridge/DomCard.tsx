import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BRIDGE_SERVICE_URL } from '../../utils/constants';

type DomLocateItem = {
  path: string;
  fileUrl: string;
  width: number;
  height: number;
  bridgePolygonPx: Array<[number, number]> | null;
  dependencyPolygonsPx: Array<Array<[number, number]>> | null;
};

export type { DomLocateItem };

const drawPolygons = (
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  item: DomLocateItem,
) => {
  const w = img.clientWidth || img.naturalWidth || item.width || 1;
  const h = img.clientHeight || img.naturalHeight || item.height || 1;
  canvas.width = Math.max(1, Math.floor(w));
  canvas.height = Math.max(1, Math.floor(h));

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scaleX = canvas.width / Math.max(1, item.width || img.naturalWidth || canvas.width);
  const scaleY = canvas.height / Math.max(1, item.height || img.naturalHeight || canvas.height);

  const stroke = (points: Array<[number, number]>, color: string, lineWidth: number) => {
    if (!points || points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0] * scaleX, points[0][1] * scaleY);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0] * scaleX, points[i][1] * scaleY);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  };

  if (Array.isArray(item.dependencyPolygonsPx)) {
    for (const p of item.dependencyPolygonsPx) {
      if (Array.isArray(p)) {
        stroke(p, '#93c5fd', 2);
      }
    }
  }
  if (Array.isArray(item.bridgePolygonPx)) {
    stroke(item.bridgePolygonPx, '#2563eb', 3);
  }
};

export const DomCard: React.FC<{ item: DomLocateItem }> = ({ item }) => {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!loaded || failed) return;
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    drawPolygons(canvas, img, item);
  }, [loaded, failed, item]);

  useEffect(() => {
    if (!loaded || failed) return;
    const onResize = () => {
      const img = imgRef.current;
      const canvas = canvasRef.current;
      if (!img || !canvas) return;
      drawPolygons(canvas, img, item);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [loaded, failed, item]);

  const src = useMemo(() => {
    const url = item.fileUrl || '';
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${BRIDGE_SERVICE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  }, [item.fileUrl]);

  return (
    <div className="border rounded bg-white overflow-hidden">
      <div className="px-3 py-2 text-xs text-gray-600 break-all border-b bg-gray-50">
        {item.path}
      </div>
      <div className="relative bg-black">
        <img
          ref={imgRef}
          src={src}
          alt={item.path}
          className="block w-full h-auto"
          onLoad={() => { setLoaded(true); setFailed(false); }}
          onError={() => { setFailed(true); setLoaded(false); }}
        />
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
        {failed && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white bg-black bg-opacity-60">
            DOM无法预览（可能为TIFF或无权限/路径不可达）
          </div>
        )}
      </div>
    </div>
  );
};