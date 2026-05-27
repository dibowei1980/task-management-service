import React, { useCallback, useEffect, useRef, useState } from 'react';
import { bridgeTaskService, bridgeSettingsService } from '../../services/bridgeService';
import { toast } from '../common/Toast';
import { Paintbrush, Eraser, Type, Hash, Wand2, X, AlertTriangle, Loader2, Undo2, Pentagon } from 'lucide-react';
import type { Tfw, ViewState } from './locate/types';
import { pixelToWorld, worldToPixel, pointInPolygon } from './locate/utils/coordinateTransform';
import { BridgeInpaintResultsPage } from './BridgeInpaintResultsPage';

const MAX_SMUDGE_PX = 480;

type SmudgeBounds = { x: number; y: number; w: number; h: number } | null;

type LocalEditResult = {
  jobId: string;
  status: string;
  outputPaths: string[];
  cropBounds: { x: number; y: number; w: number; h: number; scale: number };
  originalImagePath: string;
  cropImagePath: string;
  error: string;
};

type LocalEditPanelProps = {
  taskId: string;
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  tfw: Tfw;
  view: ViewState;
  active: boolean;
  onToggle: () => void;
  onApplied?: () => void;
};

function computeSmudgeBounds(canvas: HTMLCanvasElement): SmudgeBounds {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imgData;
  let minX = width, minY = height, maxX = 0, maxY = 0;
  let found = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] > 128) {
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!found) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function canvasToBase64(canvas: HTMLCanvasElement): string {
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1];
}

export const LocalEditPanel: React.FC<LocalEditPanelProps> = ({
  taskId,
  imagePath,
  imageWidth,
  imageHeight,
  tfw,
  view,
  active,
  onToggle,
  onApplied,
}) => {
  const maskDataRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPixelRef = useRef<[number, number] | null>(null);
  const rafRef = useRef<number | null>(null);
  const undoStackRef = useRef<{ imageData: ImageData; bounds: SmudgeBounds }[]>([]);
  const MAX_UNDO_DEPTH = 20;

  const [tool, setTool] = useState<'brush' | 'erase' | 'polygon'>('brush');
  const [brushSize, setBrushSize] = useState(20);
  const [polygonPoints, setPolygonPoints] = useState<Array<[number, number]>>([]);
  const [polygonHover, setPolygonHover] = useState<[number, number] | null>(null);
  const polygonPointsRef = useRef<Array<[number, number]>>([]);
  const polygonHoverRef = useRef<[number, number] | null>(null);
  useEffect(() => { polygonPointsRef.current = polygonPoints; }, [polygonPoints]);
  useEffect(() => { polygonHoverRef.current = polygonHover; }, [polygonHover]);
  const [smudgeBounds, setSmudgeBounds] = useState<SmudgeBounds>(null);
  const [smudgeExceeded, setSmudgeExceeded] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [numCandidates, setNumCandidates] = useState(1);
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [showCountInput, setShowCountInput] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pollingStatus, setPollingStatus] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [resultData, setResultData] = useState<LocalEditResult | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const applyingRef = useRef(false);

  const brushSizeRef = useRef(brushSize);
  const toolRef = useRef(tool);

  useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);
  useEffect(() => { toolRef.current = tool; }, [tool]);

  const settingsLoadedRef = useRef(false);
  useEffect(() => {
    if (settingsLoadedRef.current) return;
    settingsLoadedRef.current = true;
    bridgeSettingsService.getSettings().then(s => {
      if (s.localEditTool === 'brush' || s.localEditTool === 'erase' || s.localEditTool === 'polygon') setTool(s.localEditTool);
      if (typeof s.localEditBrushSize === 'number' && s.localEditBrushSize >= 4 && s.localEditBrushSize <= 80) setBrushSize(s.localEditBrushSize);
      if (typeof s.localEditPrompt === 'string') setPrompt(s.localEditPrompt);
      if (typeof s.localEditNumCandidates === 'number' && s.localEditNumCandidates >= 1 && s.localEditNumCandidates <= 8) setNumCandidates(s.localEditNumCandidates);
    }).catch(() => {});
  }, []);

  const saveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      bridgeSettingsService.updateSettings({
        localEditTool: tool,
        localEditBrushSize: brushSize,
        localEditPrompt: prompt,
        localEditNumCandidates: numCandidates,
      }).catch(() => {});
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [tool, brushSize, prompt, numCandidates]);

  useEffect(() => {
    if (!active || !imageWidth || !imageHeight) return;
    if (!maskDataRef.current) {
      const c = document.createElement('canvas');
      c.width = imageWidth;
      c.height = imageHeight;
      maskDataRef.current = c;
      undoStackRef.current = [];
      setUndoCount(0);
    }
    const mc = maskDataRef.current;
    if (mc.width !== imageWidth || mc.height !== imageHeight) {
      mc.width = imageWidth;
      mc.height = imageHeight;
      undoStackRef.current = [];
      setUndoCount(0);
    }
  }, [active, imageWidth, imageHeight]);

  const scheduleRender = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const mc = maskCanvasRef.current;
      const md = maskDataRef.current;
      if (!mc || !md) return;
      const parent = mc.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w < 1 || h < 1) return;
      if (mc.width !== w || mc.height !== h) {
        mc.width = w;
        mc.height = h;
      }
      const ctx = mc.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      if (!tfw) return;
      ctx.setTransform(
        view.scale * tfw.a,
        -view.scale * tfw.d,
        view.scale * tfw.b,
        -view.scale * tfw.e,
        view.scale * tfw.c + view.offsetX,
        -view.scale * tfw.f + view.offsetY,
      );
      ctx.drawImage(md, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (polygonPointsRef.current.length > 0 && tfw) {
        const scale = view.scale;
        const offsetX = view.offsetX;
        const offsetY = view.offsetY;
        const toScreen = (ppx: [number, number]) => {
          const wp = pixelToWorld(tfw, ppx);
          if (!wp) return null;
          return [wp[0] * scale + offsetX, -wp[1] * scale + offsetY] as [number, number];
        };
        const screenPts: Array<[number, number]> = [];
        for (const p of polygonPointsRef.current) {
          const s = toScreen(p);
          if (s) screenPts.push(s);
        }
        if (screenPts.length) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(screenPts[0][0], screenPts[0][1]);
          for (let i = 1; i < screenPts.length; i += 1) {
            ctx.lineTo(screenPts[i][0], screenPts[i][1]);
          }
          const hoverPt = polygonHoverRef.current;
          if (hoverPt) {
            const hv = toScreen(hoverPt);
            if (hv) ctx.lineTo(hv[0], hv[1]);
          }
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.stroke();
          for (const p of screenPts) {
            ctx.beginPath();
            ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
            ctx.fillStyle = '#fbbf24';
            ctx.fill();
          }
          ctx.restore();
        }
      }
    });
  }, [view, tfw]);

  useEffect(() => {
    if (!active) return;
    scheduleRender();
  }, [active, view, scheduleRender]);

  useEffect(() => {
    if (!active) return;
    scheduleRender();
  }, [active, polygonPoints, polygonHover, scheduleRender]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const updateSmudgeBounds = useCallback((): boolean => {
    const canvas = maskDataRef.current;
    if (!canvas) return false;
    const bounds = computeSmudgeBounds(canvas);
    setSmudgeBounds(bounds);
    const exceeded = !!(bounds && (bounds.w > MAX_SMUDGE_PX || bounds.h > MAX_SMUDGE_PX));
    setSmudgeExceeded(exceeded);
    return exceeded;
  }, []);

  const pushUndo = useCallback(() => {
    const md = maskDataRef.current;
    if (!md) return;
    const ctx = md.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, md.width, md.height);
    undoStackRef.current.push({ imageData, bounds: smudgeBounds });
    if (undoStackRef.current.length > MAX_UNDO_DEPTH) {
      undoStackRef.current.shift();
    }
    setUndoCount(undoStackRef.current.length);
  }, [smudgeBounds]);

  const undo = useCallback(() => {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    const md = maskDataRef.current;
    if (!md) return;
    const ctx = md.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(entry.imageData, 0, 0);
    setSmudgeBounds(entry.bounds);
    setSmudgeExceeded(false);
    setUndoCount(undoStackRef.current.length);
    scheduleRender();
  }, [scheduleRender]);

  const handleClearMask = useCallback(() => {
    const canvas = maskDataRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    pushUndo();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSmudgeBounds(null);
    setSmudgeExceeded(false);
    setPolygonPoints([]);
    setPolygonHover(null);
    scheduleRender();
  }, [pushUndo, scheduleRender]);

  const closePolygon = useCallback(() => {
    if (polygonPoints.length < 3) return;
    const canvas = maskDataRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    pushUndo();
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255,100,100,0.6)';
    ctx.beginPath();
    ctx.moveTo(polygonPoints[0][0], polygonPoints[0][1]);
    for (let i = 1; i < polygonPoints.length; i += 1) {
      ctx.lineTo(polygonPoints[i][0], polygonPoints[i][1]);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    setPolygonPoints([]);
    setPolygonHover(null);
    updateSmudgeBounds();
    scheduleRender();
  }, [polygonPoints, pushUndo, updateSmudgeBounds, scheduleRender]);

  const getBrushPixelSize = useCallback(() => {
    const base = Math.max(1, brushSizeRef.current);
    if (!tfw) return base;
    const worldPerPixelX = Math.hypot(tfw.a, tfw.d);
    const worldPerPixelY = Math.hypot(tfw.b, tfw.e);
    const worldPerPixel = (Number.isFinite(worldPerPixelX) ? worldPerPixelX : 0) + (Number.isFinite(worldPerPixelY) ? worldPerPixelY : 0);
    const worldPerPixelAvg = worldPerPixel > 0 ? worldPerPixel / 2 : 1;
    const screenPerPixel = Math.max(1e-9, worldPerPixelAvg * view.scale);
    return Math.max(1, base / screenPerPixel);
  }, [tfw, view.scale]);

  const drawStrokeOnMask = useCallback((from: [number, number], to: [number, number]) => {
    const canvas = maskDataRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const lineWidth = Math.max(1, getBrushPixelSize() / 2);
    const isErase = toolRef.current === 'erase';
    ctx.save();
    if (isErase) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(255,100,100,0.6)';
    }
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    ctx.stroke();
    ctx.restore();
  }, [getBrushPixelSize]);

  const getPixelFromEvent = useCallback((e: React.MouseEvent): [number, number] | null => {
    if (!tfw) return null;
    const mc = maskCanvasRef.current;
    if (!mc) return null;
    const rect = mc.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldX = (screenX - view.offsetX) / view.scale;
    const worldY = -(screenY - view.offsetY) / view.scale;
    return worldToPixel(tfw, [worldX, worldY]);
  }, [tfw, view.offsetX, view.offsetY, view.scale]);

  const onMaskMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    if (smudgeExceeded) return;
    e.preventDefault();
    e.stopPropagation();
    const px = getPixelFromEvent(e);
    if (!px) return;
    if (toolRef.current === 'polygon') {
      if (polygonPoints.length >= 3) {
        const first = polygonPoints[0];
        const dist = Math.hypot(px[0] - first[0], px[1] - first[1]);
        if (dist <= 8 || pointInPolygon(px, polygonPoints)) {
          closePolygon();
          return;
        }
      }
      setPolygonPoints(prev => [...prev, px]);
      setPolygonHover(px);
      return;
    }
    pushUndo();
    isDrawingRef.current = true;
    lastPixelRef.current = px;
    drawStrokeOnMask(px, px);
    scheduleRender();
  }, [smudgeExceeded, pushUndo, getPixelFromEvent, drawStrokeOnMask, scheduleRender, polygonPoints, closePolygon]);

  const onMaskMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const px = getPixelFromEvent(e);
    if (toolRef.current === 'polygon' && px) {
      setPolygonHover(px);
    }
    const cc = cursorCanvasRef.current;
    if (cc && px && tfw && toolRef.current !== 'polygon') {
      const parent = cc.parentElement;
      if (parent) {
        const w = parent.clientWidth;
        const h = parent.clientHeight;
        if (cc.width !== w || cc.height !== h) {
          cc.width = w;
          cc.height = h;
        }
      }
      const cctx = cc.getContext('2d');
      if (cctx) {
        cctx.clearRect(0, 0, cc.width, cc.height);
        const wp = pixelToWorld(tfw, px);
        if (wp) {
          const sx = wp[0] * view.scale + view.offsetX;
          const sy = -wp[1] * view.scale + view.offsetY;
          const bs = Math.max(1, brushSizeRef.current);
          const screenRadius = Math.max(2, bs / 4);
          cctx.strokeStyle = toolRef.current === 'erase' ? '#ff4444' : '#4488ff';
          cctx.lineWidth = 1.5;
          cctx.beginPath();
          cctx.arc(sx, sy, screenRadius, 0, Math.PI * 2);
          cctx.stroke();
        }
      }
    } else if (cc && toolRef.current === 'polygon') {
      const cctx = cc.getContext('2d');
      if (cctx) cctx.clearRect(0, 0, cc.width, cc.height);
    }
    if (toolRef.current === 'polygon') return;
    if (!isDrawingRef.current || smudgeExceeded || !px) return;
    if (lastPixelRef.current) {
      drawStrokeOnMask(lastPixelRef.current, px);
    }
    lastPixelRef.current = px;
    updateSmudgeBounds();
    scheduleRender();
  }, [smudgeExceeded, getPixelFromEvent, drawStrokeOnMask, scheduleRender, updateSmudgeBounds, tfw, view.scale, view.offsetX, view.offsetY]);

  const [showExceededConfirm, setShowExceededConfirm] = useState(false);

  const onMaskMouseUp = useCallback(() => {
    isDrawingRef.current = false;
    lastPixelRef.current = null;
    const exceeded = updateSmudgeBounds();
    if (exceeded) {
      setShowExceededConfirm(true);
    }
  }, [updateSmudgeBounds]);

  const onMaskMouseLeave = useCallback(() => {
    isDrawingRef.current = false;
    lastPixelRef.current = null;
    const cc = cursorCanvasRef.current;
    if (cc) {
      const cctx = cc.getContext('2d');
      if (cctx) cctx.clearRect(0, 0, cc.width, cc.height);
    }
    const exceeded = updateSmudgeBounds();
    if (exceeded) {
      setShowExceededConfirm(true);
    }
  }, [updateSmudgeBounds]);

  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        e.stopPropagation();
        undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, undo]);

  const handleGenerate = useCallback(async () => {
    if (!taskId || !imagePath) return;
    const maskCanvas = maskDataRef.current;
    if (!maskCanvas || !smudgeBounds) {
      toast.error('请先涂抹或绘制掩膜区域');
      return;
    }
    if (smudgeExceeded) {
      toast.error(`涂抹范围超过${MAX_SMUDGE_PX}像素限制，请缩小范围`);
      return;
    }
    const maskB64 = canvasToBase64(maskCanvas);
    const cropStr = `${smudgeBounds.x},${smudgeBounds.y},${smudgeBounds.w},${smudgeBounds.h}`;
    setJobId(null);
    setResultData(null);
    setShowResultModal(false);
    setGenerating(true);
    setPollingStatus('提交中...');
    try {
      const res = await bridgeTaskService.localEditStart(taskId, {
        image_path: imagePath,
        mask_data: maskB64,
        prompt: prompt || '',
        num_candidates: numCandidates,
        crop_bounds: cropStr,
      });
      const payload = res as { job_id?: string; jobId?: string; task_id?: string };
      const jid = payload.job_id || payload.jobId || '';
      if (!jid) {
        toast.error('提交失败：未获取到任务ID');
        setGenerating(false);
        setPollingStatus(null);
        return;
      }
      setJobId(jid);
      setPollingStatus('生成中...');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '提交失败';
      toast.error(msg);
      setGenerating(false);
      setPollingStatus(null);
    }
  }, [taskId, imagePath, smudgeBounds, smudgeExceeded, prompt, numCandidates]);

  useEffect(() => {
    if (!jobId || !generating) return;
    let disposed = false;
    let timer: number | null = null;
    const tick = async () => {
      if (disposed) return;
      try {
        const res = await bridgeTaskService.localEditStatus(taskId);
        const data = res as LocalEditResult;
        const st = (data.status || '').toLowerCase();
        setPollingStatus(st === 'in_progress' ? '生成中...' : st === 'pending' ? '排队中...' : st);
        if (st === 'completed' || st === 'succeeded') {
          setGenerating(false);
          setPollingStatus(null);
          setResultData(data);
          setShowResultModal(true);
          return;
        }
        if (st === 'failed') {
          setGenerating(false);
          setPollingStatus(null);
          toast.error(data.error || '生成失败');
          return;
        }
        timer = window.setTimeout(tick, 3000);
      } catch {
        timer = window.setTimeout(tick, 5000);
      }
    };
    void tick();
    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [jobId, generating, taskId]);

  const handleApplyResult = useCallback(async (selectedIndex: number) => {
    if (!resultData || !jobId || applyingRef.current) return { status: 'failed', error: '无有效数据' };
    applyingRef.current = true;
    try {
      const cb = resultData.cropBounds;
      const cropStr = `${cb.x},${cb.y},${cb.w},${cb.h}`;
      const res = await bridgeTaskService.localEditApply(taskId, {
        job_id: jobId,
        result_index: selectedIndex,
        crop_bounds: cropStr,
        original_image_path: resultData.originalImagePath,
      });
      const payload = res as { status?: string; result_path?: string; error?: string };
      if (payload.status === 'succeeded') {
        toast.success('修改已应用');
        setShowResultModal(false);
        setResultData(null);
        handleClearMask();
        if (onApplied) onApplied();
      }
      return payload;
    } catch {
      toast.error('应用修改失败');
      return { status: 'failed', error: '应用修改失败' };
    } finally {
      applyingRef.current = false;
    }
  }, [resultData, jobId, taskId, onApplied, handleClearMask]);

  const handleCancelResult = useCallback(() => {
    setShowResultModal(false);
    setResultData(null);
  }, []);

  if (!active) return null;

  return (
    <>
      <canvas
        ref={maskCanvasRef}
        className="absolute inset-0"
        style={{ zIndex: 20, cursor: smudgeExceeded ? 'not-allowed' : 'crosshair', pointerEvents: smudgeExceeded ? 'none' : 'auto' }}
        onMouseDown={onMaskMouseDown}
        onMouseMove={onMaskMouseMove}
        onMouseUp={onMaskMouseUp}
        onMouseLeave={onMaskMouseLeave}
      />
      <canvas
        ref={cursorCanvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 21 }}
      />

      {showExceededConfirm && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 50 }}>
          <div className="bg-black/30 absolute inset-0" />
          <div className="relative bg-white rounded-lg shadow-xl p-5 max-w-xs text-center">
            <div className="flex items-center justify-center gap-2 text-amber-600 mb-3">
              <AlertTriangle size={20} />
              <span className="font-medium text-sm">涂抹范围超限</span>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              涂抹范围超过{MAX_SMUDGE_PX}像素限制，已自动撤销本次涂抹
            </p>
            <button
              className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              onClick={() => {
                undo();
                setShowExceededConfirm(false);
              }}
            >
              确定
            </button>
          </div>
        </div>
      )}

      <div
        className="absolute top-2 left-[88px] bg-white/95 border rounded shadow-lg p-2 flex items-center gap-2"
        style={{ zIndex: 30 }}
      >
        <div className="flex items-center gap-1">
          <button
            className={`p-1.5 rounded text-sm ${tool === 'brush' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
            onClick={() => { setTool('brush'); setPolygonPoints([]); setPolygonHover(null); }}
            title="涂抹工具"
          >
            <Paintbrush size={14} />
          </button>
          <button
            className={`p-1.5 rounded text-sm ${tool === 'erase' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
            onClick={() => { setTool('erase'); setPolygonPoints([]); setPolygonHover(null); }}
            title="橡皮擦"
          >
            <Eraser size={14} />
          </button>
          <button
            className={`p-1.5 rounded text-sm ${tool === 'polygon' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
            onClick={() => setTool('polygon')}
            title="多边形绘制"
          >
            <Pentagon size={14} />
          </button>
        </div>
        {tool !== 'polygon' && (
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <span>大小</span>
            <input
              type="range"
              min={4}
              max={80}
              value={brushSize}
              onChange={e => setBrushSize(Number(e.target.value))}
              className="w-20 h-1"
            />
            <span className="w-6 text-center">{brushSize}</span>
          </div>
        )}
        <button
          className={`px-2 py-1 text-xs border rounded ${undoCount > 0 ? 'bg-white text-gray-600 hover:bg-gray-50' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}
          onClick={undo}
          disabled={undoCount === 0}
          title="撤销 (Ctrl+Z)"
        >
          <Undo2 size={14} />
        </button>
        <button
          className="px-2 py-1 text-xs border rounded bg-white text-gray-600 hover:bg-gray-50"
          onClick={handleClearMask}
        >
          清除
        </button>
        {smudgeBounds && (
          <span className={`text-xs ${smudgeExceeded ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
            {smudgeExceeded && <AlertTriangle size={12} className="inline mr-0.5" />}
            {smudgeBounds.w}×{smudgeBounds.h}px
            {smudgeExceeded && ` (超限)`}
          </span>
        )}
        <div className="h-4 w-px bg-gray-300" />
        <button
          className="flex items-center gap-1 px-2 py-1 text-xs border rounded bg-white text-gray-600 hover:bg-gray-50"
          onClick={() => setShowPromptInput(true)}
          title={prompt ? `提示词：${prompt}` : '提示词输入'}
        >
          <Type size={14} />
          提示词{prompt && <span className="text-blue-600 ml-0.5">✓</span>}
        </button>
        <button
          className="flex items-center gap-1 px-2 py-1 text-xs border rounded bg-white text-gray-600 hover:bg-gray-50"
          onClick={() => setShowCountInput(true)}
          title="备选数量"
        >
          <Hash size={14} />
          {numCandidates}张
        </button>
        <button
          className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded font-medium ${
            smudgeExceeded || !smudgeBounds || generating
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
          onClick={handleGenerate}
          disabled={smudgeExceeded || !smudgeBounds || generating}
        >
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          {generating ? (pollingStatus || '生成中') : '生成修改图像'}
        </button>
        <button
          className="p-1.5 rounded text-sm text-gray-400 hover:text-red-600"
          onClick={onToggle}
          title="关闭局部编辑"
        >
          <X size={14} />
        </button>
      </div>

      {showPromptInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowPromptInput(false)}>
          <div className="bg-white rounded-lg shadow-xl p-5 w-96" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">提示词输入</h3>
              <button onClick={() => setShowPromptInput(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <textarea
              className="w-full border rounded p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
              rows={3}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="输入提示词，描述希望生成的效果..."
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-1">留空则使用默认修改</p>
            <div className="flex justify-end mt-3">
              <button className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white" onClick={() => setShowPromptInput(false)}>确定</button>
            </div>
          </div>
        </div>
      )}

      {showCountInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowCountInput(false)}>
          <div className="bg-white rounded-lg shadow-xl p-5 w-72" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">备选数量</h3>
              <button onClick={() => setShowCountInput(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <input
              type="range"
              min={1}
              max={8}
              value={numCandidates}
              onChange={e => setNumCandidates(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">1-8张备选图像</p>
            <div className="flex justify-end mt-3">
              <button className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white" onClick={() => setShowCountInput(false)}>确定</button>
            </div>
          </div>
        </div>
      )}

      {showResultModal && resultData && (
        <BridgeInpaintResultsPage
          taskId={taskId}
          jobId={jobId || undefined}
          mode="modal"
          title="局部修改结果选择"
          outputPaths={resultData.outputPaths}
          originalPath={resultData.cropImagePath || resultData.originalImagePath}
          loadFileFn={async (path: string) => {
            const resp = await bridgeTaskService.localEditFile(taskId, path);
            return { data: resp.data as ArrayBuffer };
          }}
          confirmFn={handleApplyResult}
          onClose={handleCancelResult}
          onRetry={() => {
            setShowResultModal(false);
            setResultData(null);
          }}
          onConfirmed={() => {}}
          retryLabel="重新生成"
          confirmLabel="应用修改"
        />
      )}
    </>
  );
};
