import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { bridgeTaskService } from '../../services/bridgeService';
import { BRIDGE_SERVICE_URL } from '../../utils/constants';

type InpaintStatusPayload = {
  jobId?: string;
  taskId?: string;
  status?: string;
  error?: string;
  outputPath?: string;
  outputPaths?: string[];
  originalImagePath?: string;
};

const buildFileUrl = (taskId: string, jobId: string, path: string) => {
  const token = localStorage.getItem('bridge_token');
  const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : '';
  return `${BRIDGE_SERVICE_URL}/api/tasks/${taskId}/inpaint-file?jobId=${encodeURIComponent(jobId)}&path=${encodeURIComponent(path)}${tokenQuery}`;
};

type BridgeInpaintResultsPageProps = {
  taskId?: string;
  jobId?: string;
  mode?: 'page' | 'modal';
  onClose?: () => void;
  onRetry?: () => void;
  onConfirmed?: () => void;
};

export const BridgeInpaintResultsPage: React.FC<BridgeInpaintResultsPageProps> = ({
  taskId: taskIdProp,
  jobId: jobIdProp,
  mode = 'page',
  onClose,
  onRetry,
  onConfirmed,
}) => {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const taskId = taskIdProp || params.taskId || '';
  const jobIdParam = jobIdProp || searchParams.get('jobId') || '';

  const [jobId, setJobId] = useState(jobIdParam);
  const [statusText, setStatusText] = useState<string>('加载中...');
  const [statusCode, setStatusCode] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [originalPath, setOriginalPath] = useState<string | null>(null);
  const [outputPaths, setOutputPaths] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dividerRatio, setDividerRatio] = useState(0);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const dragRef = useRef<{ mode: 'pan' | 'divider' | null; x: number; y: number }>({ mode: null, x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fitRef = useRef<string | null>(null);

  useEffect(() => {
    setJobId(jobIdParam);
  }, [jobIdParam]);

  const refreshStatus = useCallback(async (currentJobId: string) => {
    if (!taskId || !currentJobId) return;
    try {
      const res = await bridgeTaskService.getInpaintStatus(taskId, currentJobId);
      const payload = res as InpaintStatusPayload;
      const status = payload.status || 'pending';
      setStatusCode(status);
      const outputs = Array.isArray(payload.outputPaths)
        ? payload.outputPaths.filter((v): v is string => typeof v === 'string' && v.length > 0)
        : [];
      const outputPath = typeof payload.outputPath === 'string' ? payload.outputPath : '';
      const nextOutputs = outputs.length ? outputs : (outputPath ? [outputPath] : []);
      setOutputPaths(nextOutputs);
      if (nextOutputs.length && selectedIndex >= nextOutputs.length) {
        setSelectedIndex(0);
      }
      const original = typeof payload.originalImagePath === 'string' ? payload.originalImagePath : null;
      setOriginalPath(original);
      if (status === 'pending') {
        setStatusText('生成处理中...');
      } else if (status === 'succeeded') {
        setStatusText('生成完成');
      } else if (status === 'failed') {
        const err = payload.error ? `失败：${payload.error}` : '生成失败';
        setStatusText(err);
      } else {
        setStatusText(status);
      }
      setLoadError(null);
      return status;
    } catch {
      setLoadError('加载生成结果失败');
      return null;
    }
  }, [taskId, selectedIndex]);

  useEffect(() => {
    if (!taskId || !jobId) return;
    let disposed = false;
    let timer: number | null = null;
    const tick = async () => {
      const next = await refreshStatus(jobId);
      if (disposed) return;
      if (next === 'pending') {
        timer = window.setTimeout(tick, 3000);
      }
    };
    void tick();
    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [taskId, jobId, refreshStatus, statusCode]);

  useEffect(() => {
    if (outputPaths.length && selectedIndex === 0) return;
    if (outputPaths.length && selectedIndex >= outputPaths.length) {
      setSelectedIndex(0);
    }
  }, [outputPaths, selectedIndex]);

  const selectedResult = outputPaths[selectedIndex] || '';
  const canConfirm = Boolean(taskId && jobId && selectedResult);
  const canRetry = Boolean(taskId && jobId);

  const handleRetry = useCallback(async () => {
    if (!canRetry) return;
    if (onRetry) {
      onRetry();
      if (onClose) onClose();
      return;
    }
    setLoadingAction(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await bridgeTaskService.retryInpaint(taskId, jobId);
      const payload = res as InpaintStatusPayload;
      const nextJobId = payload.jobId || '';
      if (nextJobId) {
        setJobId(nextJobId);
        navigate(`/tasks/${taskId}/inpaint-results?jobId=${encodeURIComponent(nextJobId)}`, { replace: true });
      }
      setStatusCode(payload.status || 'pending');
      setStatusText('生成处理中...');
      setOutputPaths([]);
      setSelectedIndex(0);
      setActionMessage('已触发再次生成');
    } catch {
      setActionError('再次生成失败');
    } finally {
      setLoadingAction(false);
    }
  }, [canRetry, onRetry, onClose, taskId, jobId, navigate]);

  const handleConfirm = useCallback(async () => {
    if (!canConfirm) return;
    setLoadingAction(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await bridgeTaskService.confirmInpaintResult(taskId, jobId, selectedIndex);
      const payload = res as { status?: string; resultPath?: string; error?: string };
      if (payload.status === 'succeeded') {
        setActionMessage('成果已确认并覆盖保存');
        if (onConfirmed) {
          onConfirmed();
        } else if (window.opener) {
          window.opener.postMessage({ type: 'inpaint_result_confirmed', taskId }, '*');
        }
        if (onClose) {
          onClose();
        }
      } else {
        setActionError(payload.error ? `成果确认失败：${payload.error}` : '成果确认失败');
      }
    } catch {
      setActionError('成果确认失败');
    } finally {
      setLoadingAction(false);
    }
  }, [canConfirm, taskId, jobId, selectedIndex, onConfirmed, onClose]);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    const nextScale = Math.min(5, Math.max(0.2, scale * delta));
    if (nextScale === scale) return;
    const ratio = nextScale / scale;
    setOffset({
      x: px - (px - offset.x) * ratio,
      y: py - (py - offset.y) * ratio,
    });
    setScale(nextScale);
  }, [scale, offset]);

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 1) return;
    event.preventDefault();
    dragRef.current = { mode: 'pan', x: event.clientX, y: event.clientY };
  }, []);

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current.mode) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    setDividerRatio(Math.min(1, Math.max(0, ratio)));
  }, []);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      const mode = dragRef.current.mode;
      if (!mode) return;
      const dx = event.clientX - dragRef.current.x;
      const dy = event.clientY - dragRef.current.y;
      dragRef.current.x = event.clientX;
      dragRef.current.y = event.clientY;
      if (mode === 'pan') {
        setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      }
    };
    const handleUp = () => {
      dragRef.current.mode = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  const fitView = useCallback((w: number, h: number) => {
    if (!containerRef.current || w <= 0 || h <= 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nextScale = Math.min(rect.width / w, rect.height / h);
    const fittedWidth = w * nextScale;
    const fittedHeight = h * nextScale;
    setScale(nextScale);
    setOffset({
      x: Math.round((rect.width - fittedWidth) / 2),
      y: Math.round((rect.height - fittedHeight) / 2),
    });
    setDividerRatio(0);
  }, []);

  const transformStyle = useMemo(() => ({
    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
    transformOrigin: '0 0',
  }), [offset, scale]);

  const originalUrl = taskId && jobId && originalPath ? buildFileUrl(taskId, jobId, originalPath) : '';
  const resultUrl = taskId && jobId && selectedResult ? buildFileUrl(taskId, jobId, selectedResult) : '';

  useEffect(() => {
    if (!imageSize) return;
    const key = `${originalUrl}|${resultUrl}`;
    if (!key || key === '|' || fitRef.current === key) return;
    fitRef.current = key;
    fitView(imageSize.w, imageSize.h);
  }, [imageSize, originalUrl, resultUrl, fitView]);

  const handleImageLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    const w = event.currentTarget.naturalWidth;
    const h = event.currentTarget.naturalHeight;
    if (w > 0 && h > 0) {
      setImageSize({ w, h });
    }
  }, []);

  const body = (
    <div className={mode === 'page' ? 'min-h-screen bg-gray-50' : 'bg-gray-50 rounded-lg shadow-xl border w-[92vw] max-w-6xl max-h-[90vh] flex flex-col'}>
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-gray-800">影像结果选择</div>
            <div className="text-sm text-gray-500">任务 {taskId} · {statusText}</div>
          </div>
          <div className="flex items-center gap-2">
            {mode === 'modal' && (
              <button
                className="px-3 py-2 text-sm border rounded bg-white"
                onClick={onClose}
              >
                关闭
              </button>
            )}
            <button
              className="px-3 py-2 text-sm border rounded bg-white"
              disabled={!canRetry || loadingAction}
              onClick={handleRetry}
            >
              再次生成
            </button>
            <button
              className="px-3 py-2 text-sm border rounded bg-blue-600 text-white border-blue-600 disabled:opacity-50"
              disabled={!canConfirm || loadingAction}
              onClick={handleConfirm}
            >
              确认成果
            </button>
          </div>
        </div>
        {(loadError || actionError || actionMessage) && (
          <div className="mt-2 text-sm">
            {loadError && <div className="text-red-600">{loadError}</div>}
            {actionError && <div className="text-red-600">{actionError}</div>}
            {actionMessage && <div className="text-emerald-600">{actionMessage}</div>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 gap-4 px-6 py-4 overflow-auto">
        <div className="col-span-12 md:col-span-4 lg:col-span-3 space-y-3">
          <div className="text-sm font-medium text-gray-700">成果列表</div>
          <div className="grid grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-3">
            {outputPaths.map((path, idx) => {
              const url = taskId && jobId ? buildFileUrl(taskId, jobId, path) : '';
              const active = idx === selectedIndex;
              return (
                <button
                  key={`${path}-${idx}`}
                  className={`border rounded overflow-hidden text-left ${active ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'}`}
                  onClick={() => setSelectedIndex(idx)}
                >
                  <div className="aspect-video bg-gray-100 flex items-center justify-center">
                    {url ? (
                      <img src={url} alt={`result-${idx + 1}`} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <div className="text-xs text-gray-400">暂无预览</div>
                    )}
                  </div>
                  <div className="px-2 py-1 text-xs text-gray-600 break-all">{path.split(/[\\/]/).pop()}</div>
                </button>
              );
            })}
            {!outputPaths.length && (
              <div className="col-span-full text-sm text-gray-500">暂无生成成果</div>
            )}
          </div>
        </div>

        <div className="col-span-12 md:col-span-8 lg:col-span-9 space-y-3">
          <div className="text-sm font-medium text-gray-700">对比查看</div>
          <div
            ref={containerRef}
            className="relative w-full h-[70vh] bg-black/5 border rounded overflow-hidden select-none"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            style={{ touchAction: 'none' }}
          >
            {!originalUrl || !resultUrl ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
                {statusCode === 'pending' ? '生成处理中...' : '请选择成果进行对比'}
              </div>
            ) : (
              <>
                <div className="absolute inset-0">
                  <img src={resultUrl} alt="result" className="absolute top-0 left-0 max-w-none" style={transformStyle} onLoad={handleImageLoad} />
                </div>
                <div className="absolute inset-0" style={{ width: `${dividerRatio * 100}%`, overflow: 'hidden' }}>
                  <img src={originalUrl} alt="original" className="absolute top-0 left-0 max-w-none" style={transformStyle} onLoad={handleImageLoad} />
                </div>
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-blue-500 cursor-col-resize"
                  style={{ left: `${dividerRatio * 100}%` }}
                />
              </>
            )}
          </div>
          {selectedResult && (
            <div className="text-xs text-gray-500 break-all">已选成果：{selectedResult}</div>
          )}
        </div>
      </div>
    </div>
  );

  if (mode === 'modal') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
        <div onClick={event => event.stopPropagation()}>
          {body}
        </div>
      </div>
    );
  }

  return body;
};
