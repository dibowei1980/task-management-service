import React, { useEffect, useMemo, useRef, useState } from 'react';
import { bridgeApi } from '../../utils/api';
import { BRIDGE_SERVICE_URL } from '../../utils/constants';

type DomLocateItem = {
  path: string;
  fileUrl: string;
  width: number;
  height: number;
  bridgePolygonPx: Array<[number, number]> | null;
  dependencyPolygonsPx: Array<Array<[number, number]>> | null;
};

type DomLocateResponse = {
  taskId: string;
  domCount: number;
  dependencyCount: number;
  doms: DomLocateItem[];
};

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

const DomCard: React.FC<{ item: DomLocateItem }> = ({ item }) => {
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

export const BridgeTaskLocateModal: React.FC<{ taskId: string; onClose: () => void }> = ({ taskId, onClose }) => {
  const [data, setData] = useState<DomLocateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError(null);
    setData(null);
    bridgeApi.get(`/api/v1/tasks/${taskId}/dom-locate`).then(res => {
      if (disposed) return;
      setData(res.data as DomLocateResponse);
    }).catch(e => {
      if (disposed) return;
      const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as { message?: unknown }).message) : '加载失败';
      setError(msg || '加载失败');
    }).finally(() => {
      if (!disposed) setLoading(false);
    });
    return () => { disposed = true; };
  }, [taskId]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <div className="text-lg font-bold">子任务定位</div>
            <div className="text-xs text-gray-500">
              DOM {data?.domCount ?? 0}，依赖桥梁 {data?.dependencyCount ?? 0}
            </div>
          </div>
          <button className="px-3 py-2 text-sm border rounded" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="p-5 overflow-auto max-h-[calc(90vh-64px)]">
          {loading && <div className="text-sm text-gray-600">加载中...</div>}
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!loading && !error && data && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(data.doms || []).map((d, idx) => (
                <DomCard key={`${d.path}-${idx}`} item={d} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
