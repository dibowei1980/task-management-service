import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { bridgeApi } from '../../utils/api';
import { bridgeTaskService, bridgeSettingsService } from '../../services/bridgeService';
import type { MaskSavePayload } from '../../types/api';
import { logger } from '../../utils/logger';
import { toast } from '../common/Toast';
import { useConfirm } from '../common/useConfirm';
import { BridgeInpaintResultsPage } from './BridgeInpaintResultsPage';
import { LocalEditPanel } from './LocalEditPanel';
import { buildMaskPath, buildMaskCutPath } from '../../utils/pathBuilders';
import type { LocateItem, DomLocateResponse, PreprocessSegmentsResponse, LoadedTile, ViewState } from './locate/types';
import { basename, normalizePath, isTiffPath, decodeTiffToRgba, createBitmapFromRgba, createBitmapFromImageBuffer, computeBoundsWorld, pixelToWorld, worldToPixel, pointInPolygon, fitToBounds, clamp, loadDisplayTogglePrefs, loadMaskUiPrefs, DISPLAY_TOGGLE_STORAGE_KEY, MASK_UI_STORAGE_KEY } from './locate/utils';


export const BridgeTaskLocatePage: React.FC = () => {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const params = useParams();
  const taskId = params.taskId || '';
  const navigate = useNavigate();
  const location = useLocation();
  const editByQuery = useMemo(() => {
    const sp = new URLSearchParams(location.search || '');
    return sp.get('mode') === 'edit';
  }, [location.search]);
  const initialDisplayPrefs = useMemo(() => loadDisplayTogglePrefs(), []);
  const initialMaskUiPrefs = useMemo(() => loadMaskUiPrefs(), []);

  const [data, setData] = useState<DomLocateResponse | null>(null);
  const [segments, setSegments] = useState<LocateItem[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const [segmentsError, setSegmentsError] = useState<string | null>(null);
  const [segmentsGenerating, setSegmentsGenerating] = useState(false);
  const [, setSegmentsGenerateError] = useState<string | null>(null);
  const [maskGenerating, setMaskGenerating] = useState(false);
  const [, setMaskGenerateError] = useState<string | null>(null);
  const [, setMaskGenerateSuccess] = useState<string | null>(null);
  const [enableShadow, setEnableShadow] = useState(false);
  const [inpaintCount, setInpaintCount] = useState(1);
  const [blurRadius, setBlurRadius] = useState(2);
  const [expandPixels, setExpandPixels] = useState(3);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [inpaintRunning, setInpaintRunning] = useState(false);
  const [inpaintJobId, setInpaintJobId] = useState<string | null>(null);
  const [inpaintRunningPath, setInpaintRunningPath] = useState<string | null>(null);
  const [mergeRunning, setMergeRunning] = useState(false);
  const [, setInpaintStatus] = useState<string | null>(null);
  const [, setInpaintError] = useState<string | null>(null);
  const [, setInpaintStatusCode] = useState<string | null>(null);
  const [, setInpaintOutputPaths] = useState<string[]>([]);
  const [maskReloadKey, setMaskReloadKey] = useState(0);
  const [maskOpacity, setMaskOpacity] = useState(initialMaskUiPrefs?.maskOpacity ?? 0.5);
  const [maskBitmap, setMaskBitmap] = useState<ImageBitmap | null>(null);
  const [maskCutBitmap, setMaskCutBitmap] = useState<ImageBitmap | null>(null);
  const [maskOverlayBitmap, setMaskOverlayBitmap] = useState<ImageBitmap | null>(null);
  const [, setMaskToast] = useState<string | null>(null);
  const [maskTool, setMaskTool] = useState<'brush' | 'polygon' | 'erase'>('brush');
  const [brushSize, setBrushSize] = useState(initialMaskUiPrefs?.brushSize ?? 24);
  const [maskSaving, setMaskSaving] = useState(false);
  const [maskDirty, setMaskDirty] = useState(false);
  const [, setMaskSaveError] = useState<string | null>(null);
  const [, setMaskSaveSuccess] = useState<string | null>(null);
  const [toolbarWidth, setToolbarWidth] = useState(initialMaskUiPrefs?.toolbarWidth ?? 220);
  const [polygonPoints, setPolygonPoints] = useState<Array<[number, number]>>([]);
  const [polygonHover, setPolygonHover] = useState<[number, number] | null>(null);
  const [maskEditVersion, setMaskEditVersion] = useState(0);
  const [maskHistoryIndex, setMaskHistoryIndex] = useState(0);
  const [maskHistoryLength, setMaskHistoryLength] = useState(0);
  const [segmentInfoOpen, setSegmentInfoOpen] = useState(false);
  const [segmentInfoLoading, setSegmentInfoLoading] = useState(false);
  const [segmentInfoError, setSegmentInfoError] = useState<string | null>(null);
  const [segmentInfoText, setSegmentInfoText] = useState<string | null>(null);
  const [segmentInfoPath, setSegmentInfoPath] = useState<string | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [resultJobId, setResultJobId] = useState<string | null>(null);
  const [taskName, setTaskName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [domIndex, setDomIndex] = useState(0);
  const [loadSeq, setLoadSeq] = useState(0);
  const [editMask, setEditMask] = useState(false);
  const [viewMode, setViewMode] = useState<'dom' | 'segment' | 'segment_result' | 'merged_result'>(editByQuery ? 'segment' : 'segment_result');
  const [showBridgeRange, setShowBridgeRange] = useState(initialDisplayPrefs?.showBridgeRange ?? true);
  const [showCenterline, setShowCenterline] = useState(initialDisplayPrefs?.showCenterline ?? true);
  const [showLightDirection, setShowLightDirection] = useState(initialDisplayPrefs?.showLightDirection ?? true);
  const [showImpactRange, setShowImpactRange] = useState(initialDisplayPrefs?.showImpactRange ?? false);
  const [showMask, setShowMask] = useState(initialDisplayPrefs?.showMask ?? false);
  const [displayMenuOpen, setDisplayMenuOpen] = useState(false);
  const [tiles, setTiles] = useState<LoadedTile[]>([]);
  const [compareTiles, setCompareTiles] = useState<LoadedTile[]>([]);
  const [compareLoadSeq, setCompareLoadSeq] = useState(0);
  const [mergedSwipeEnabled, setMergedSwipeEnabled] = useState(false);
  const [mergedSwipeRatio, setMergedSwipeRatio] = useState(0.5);
  const [localEditActive, setLocalEditActive] = useState(false);
  const [view, setView] = useState<ViewState>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [worldBounds, setWorldBounds] = useState<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);

  const viewerRef = useRef<HTMLDivElement | null>(null);
  const viewerRefCallback = useCallback((node: HTMLDivElement | null) => {
    viewerRef.current = node;
    if (!node) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = node.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setView(v => {
        const scale0 = v.scale;
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const scale1 = clamp(scale0 * factor, 1e-9, 1e12);
        const worldX = (mx - v.offsetX) / scale0;
        const worldY = -(my - v.offsetY) / scale0;
        const offsetX = mx - worldX * scale1;
        const offsetY = my + worldY * scale1;
        return { scale: scale1, offsetX, offsetY };
      });
    };
    node.addEventListener('wheel', handler, { passive: false });
    return () => {
      node.removeEventListener('wheel', handler);
    };
  }, []);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ mode: 'pan' | 'divider' | null; x: number; y: number; ox: number; oy: number }>({ mode: null, x: 0, y: 0, ox: 0, oy: 0 });
  const tilesRef = useRef<LoadedTile[]>([]);
  const compareTilesRef = useRef<LoadedTile[]>([]);
  const maskToastTimerRef = useRef<number | null>(null);
  const maskEditCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCutEditCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskOverlayFrameRef = useRef<number | null>(null);
  const skipResetRef = useRef(false);
  const maskToolRef = useRef<'brush' | 'polygon' | 'erase'>('brush');
  const brushSizeRef = useRef(24);
  const maskDrawingRef = useRef(false);
  const lastDrawRef = useRef<[number, number] | null>(null);
  const maskHistoryRef = useRef<ImageData[]>([]);
  const maskCutHistoryRef = useRef<ImageData[]>([]);
  const maskHistoryIndexRef = useRef(0);
  const maskOverlaySeqRef = useRef(0);
  const displayMenuRef = useRef<HTMLDivElement | null>(null);

  const doms = useMemo(() => data?.doms || [], [data?.doms]);
  const segmentItems = useMemo(() => segments.filter(item => item.kind !== 'segment_result' && item.kind !== 'merged_result'), [segments]);
  const segmentResultItems = useMemo(() => segments.filter(item => item.kind === 'segment_result'), [segments]);
  const mergedResultItems = useMemo(() => segments.filter(item => item.kind === 'merged_result'), [segments]);
  const canUseMergedSwipe = useMemo(() => (viewMode === 'merged_result' || viewMode === 'segment_result') && segmentItems.length > 0, [viewMode, segmentItems]);
  const allSegmentResultsReady = useMemo(() => {
    if (!segmentItems.length) return false;
    return segmentItems.every(item => !!item.resultConfirmed);
  }, [segmentItems]);
  const segmentOrderIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    segmentItems.forEach((item, idx) => {
      if (item.jsonPath) {
        map.set(item.jsonPath, idx);
      }
    });
    return map;
  }, [segmentItems]);
  const items = useMemo(() => viewMode === 'segment'
    ? segmentItems
    : (viewMode === 'segment_result'
      ? segmentResultItems
      : (viewMode === 'merged_result' ? mergedResultItems : doms)), [viewMode, segmentItems, segmentResultItems, mergedResultItems, doms]);
  const selected = items[domIndex] || null;

  useEffect(() => {
    if (editByQuery) setEditMask(true);
  }, [editByQuery]);

  useEffect(() => {
    if (settingsLoaded) return;
    let disposed = false;
    bridgeSettingsService.getSettings().then(s => {
      if (disposed) return;
      if (typeof s.enableShadow === 'boolean') setEnableShadow(s.enableShadow);
      if (typeof s.inpaintCount === 'number' && s.inpaintCount >= 1 && s.inpaintCount <= 8) setInpaintCount(s.inpaintCount);
      if (typeof s.blurRadius === 'number' && s.blurRadius >= 0 && s.blurRadius <= 20) setBlurRadius(s.blurRadius);
      if (typeof s.expandPixels === 'number' && s.expandPixels >= 0 && s.expandPixels <= 50) setExpandPixels(s.expandPixels);
      setSettingsLoaded(true);
    }).catch(() => {
      setSettingsLoaded(true);
    });
    return () => { disposed = true; };
  }, [settingsLoaded]);

  useEffect(() => {
    if (!displayMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const el = displayMenuRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setDisplayMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [displayMenuOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(DISPLAY_TOGGLE_STORAGE_KEY, JSON.stringify({
        showBridgeRange,
        showCenterline,
        showLightDirection,
        showImpactRange,
        showMask,
      }));
    } catch {
      return;
    }
  }, [showBridgeRange, showCenterline, showLightDirection, showImpactRange, showMask]);

  useEffect(() => {
    try {
      localStorage.setItem(MASK_UI_STORAGE_KEY, JSON.stringify({
        maskOpacity,
        brushSize,
        toolbarWidth,
      }));
    } catch {
      return;
    }
  }, [maskOpacity, brushSize, toolbarWidth]);

  useEffect(() => {
    if (!taskId) {
      setTaskName('');
      return;
    }
    let disposed = false;
    bridgeTaskService.getTask(taskId).then(task => {
      if (!disposed) setTaskName(task?.name || '');
    }).catch(() => {
      if (!disposed) setTaskName('');
    });
    return () => {
      disposed = true;
    };
  }, [taskId]);

  useEffect(() => {
    maskToolRef.current = maskTool;
  }, [maskTool]);

  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);

  useEffect(() => {
    if (!showMask && editMask) {
      setEditMask(false);
    }
  }, [showMask, editMask]);

  const reloadSegments = useCallback(() => {
    if (!taskId) return Promise.resolve();
    setSegmentsLoading(true);
    setSegmentsError(null);
    return bridgeApi.get(`/api/v1/tasks/${taskId}/preprocess-segments`).then(res => {
      const d = res.data as PreprocessSegmentsResponse;
      const list = Array.isArray(d?.segments) ? d.segments : [];
      const expanded: LocateItem[] = [];
      list.forEach(item => {
        expanded.push({ ...item, kind: item.kind || 'segment' });
        if (item.kind !== 'merged_result' && item.resultFileUrl && item.resultConfirmed) {
          expanded.push({
            ...item,
            kind: 'segment_result',
            path: item.resultPath || item.path,
            imagePath: item.resultPath || item.path,
            fileUrl: item.resultFileUrl,
            jsonPath: undefined,
            jsonUrl: undefined,
          });
        }
      });
      setSegments(expanded);
      if (editByQuery && list.length > 0) {
        setDomIndex(0);
      }
      if (!editByQuery) {
        const hasResults = expanded.some(item => item.kind === 'segment_result');
        const hasMerged = expanded.some(item => item.kind === 'merged_result');
        if (!hasResults && hasMerged) {
          setViewMode('merged_result');
          setDomIndex(0);
        }
      }
      if (!list.length) {
        const hint = d?.manifestPresent ? (d?.manifestError ? `分段生成失败：${d.manifestError}` : '任务已记录分段清单但无 segments') : '任务未生成 segments 或无权限访问';
        const source = d?.manifestSource ? `（来源：${d.manifestSource}）` : '';
        const message = `未找到分段数据包：${hint}${source}`;
        setSegmentsError(message);
        setRunStatus(message);
      }
    }).catch(e => {
      setSegments([]);
      const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as { message?: unknown }).message) : '加载分段数据包失败';
      const message = msg || '加载分段数据包失败';
      setSegmentsError(message);
      setRunStatus(message);
    }).finally(() => {
      setSegmentsLoading(false);
    });
  }, [taskId, editByQuery]);

  const mergeAllResults = useCallback(async () => {
    if (!taskId) return;
    if (!allSegmentResultsReady) {
      setRunStatus('存在缺失分段成果，无法合并');
      return;
    }
    setMergeRunning(true);
    setRunStatus('所有成果影像合并运行中...');
    try {
      const first = await bridgeTaskService.mergeResults(taskId, { overwrite: false }) as { status?: string; code?: string; message?: string; outputPath?: string };
      let result = first;
      if (first?.status === 'need_confirm') {
        const ok = await confirm({ title: '合并确认', message: '合并成果已存在，确认覆盖后继续合并？' });
        if (!ok) {
          setRunStatus('已取消合并');
          return;
        }
        result = await bridgeTaskService.mergeResults(taskId, { overwrite: true }) as { status?: string; code?: string; message?: string; outputPath?: string };
      }
      if (result?.status === 'succeeded' || result?.status === 'ok') {
        setRunStatus('所有成果影像合并完成');
        await reloadSegments();
        setViewMode('merged_result');
        setDomIndex(0);
        return;
      }
      const message = result?.message || '合并失败';
      setRunStatus(message);
      toast.error(message);
    } catch (e) {
      const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as { message?: unknown }).message) : '合并失败';
      const message = msg || '合并失败';
      setRunStatus(message);
      toast.error(message);
    } finally {
      setMergeRunning(false);
      reloadSegments().catch(() => undefined);
    }
  }, [taskId, allSegmentResultsReady, reloadSegments]);

  const triggerMaskGenerate = useCallback(async (item?: LocateItem | null) => {
    if (!taskId) return;
    const target = item ?? selected;
    if (!target?.jsonPath) {
      const message = '请选择分段后再生成掩膜';
      setMaskGenerateError(message);
      setRunStatus(message);
      return;
    }
    const maskPath = buildMaskPath(target.jsonPath, target.path, target);
    if (maskPath) {
      try {
        await bridgeApi.get(`/api/v1/tasks/${taskId}/preprocess-file?path=${encodeURIComponent(maskPath)}`, { responseType: 'arraybuffer' });
        const ok = await confirm({ title: '掩膜覆盖', message: '当前分段掩膜已存在，是否覆盖？' });
        if (!ok) return;
      } catch (e) {
        const err = e as { response?: { status?: number } };
        if (err?.response?.status !== 404) {
          const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as { message?: unknown }).message) : '检查掩膜失败';
          const message = msg || '检查掩膜失败';
          setMaskGenerateError(message);
          setRunStatus(message);
          return;
        }
      }
    }
    setRunStatus('掩膜生成运行中...');
    setMaskGenerating(true);
    setMaskGenerateError(null);
    setMaskGenerateSuccess(null);
    setInpaintStatus(null);
    setInpaintError(null);
    setMaskSaveError(null);
    setMaskSaveSuccess(null);
    setMaskToast(null);
    let polygonDilateIterations = 2;
    let sam2DilateIterations = 2;
    let sam2LightExpandPixels = 1;
    try {
      const s = await bridgeSettingsService.getSettings();
      if (typeof s.polygonDilateIterations === 'number' && s.polygonDilateIterations >= 0 && s.polygonDilateIterations <= 10) polygonDilateIterations = s.polygonDilateIterations;
      if (typeof s.sam2DilateIterations === 'number' && s.sam2DilateIterations >= 0 && s.sam2DilateIterations <= 10) sam2DilateIterations = s.sam2DilateIterations;
      if (typeof s.sam2LightExpandPixels === 'number' && s.sam2LightExpandPixels >= 0 && s.sam2LightExpandPixels <= 20) sam2LightExpandPixels = s.sam2LightExpandPixels;
    } catch { /* use default */ }
    bridgeApi.post(`/api/v1/tasks/${taskId}/mask-generate`, {
      segment_json_path: target.jsonPath,
      inputParams: { enable_shadow: enableShadow, polygon_dilate_iterations: polygonDilateIterations, sam2_dilate_iterations: sam2DilateIterations, sam2_light_expand_pixels: sam2LightExpandPixels },
    }).then(res => {
      const data = res.data as { maskManifest?: { artifacts?: { segmentCount?: number }; error?: unknown; segments?: Array<Record<string, unknown>> } } | null;
      const manifest = data && typeof data === 'object' ? data.maskManifest : null;
      const errValue = manifest && typeof manifest === 'object' && 'error' in manifest ? (manifest as { error?: unknown }).error : null;
      if (errValue) {
        const message = String(errValue);
        setMaskGenerateError(message);
        setRunStatus(message);
        return;
      }
      const artifacts = manifest && typeof manifest === 'object' && 'artifacts' in manifest ? (manifest as { artifacts?: { segmentCount?: number; pipelineMode?: string } }).artifacts : null;
      const count = artifacts && typeof artifacts === 'object' && 'segmentCount' in artifacts ? Number(artifacts.segmentCount) : null;
      const pipelineMode = artifacts && typeof artifacts === 'object' && 'pipelineMode' in artifacts ? String(artifacts.pipelineMode) : '';
      const modeLabel = pipelineMode === 'sam2' ? 'SAM2' : pipelineMode === 'polygon_sam2_unavailable' ? '多边形(SAM2不可用)' : pipelineMode === 'polygon' ? '多边形' : pipelineMode || '多边形';
      const message = Number.isFinite(count) ? `${modeLabel}掩膜生成完成（${count}）` : `${modeLabel}掩膜生成完成`;
      setMaskGenerateSuccess(message);
      setRunStatus(message);
      const returnedSegments = manifest && typeof manifest === 'object' && 'segments' in manifest ? (manifest as { segments?: Array<Record<string, unknown>> }).segments : [];
      if (returnedSegments && returnedSegments.length > 0) {
        setSegments(prev => prev.map(seg => {
          const match = returnedSegments.find(rs => {
            const rsJson = String(rs.jsonPath || '').replace(/\\/g, '/');
            const segJson = String(seg.jsonPath || '').replace(/\\/g, '/');
            return rsJson && segJson && rsJson === segJson;
          });
          if (match) {
            return { ...seg, maskSamPath: match.maskSamPath as string | undefined, maskCutPath: match.maskCutPath as string | undefined, mergedMaskPath: match.mergedMaskPath as string | undefined, overlayPath: match.overlayPath as string | undefined, shadowMaskPath: match.shadowMaskPath as string | undefined };
          }
          return seg;
        }));
      }
      if (showMask) setMaskReloadKey(v => v + 1);
    }).catch(e => {
      const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as { message?: unknown }).message) : '生成掩膜失败';
      const message = msg || '生成掩膜失败';
      setMaskGenerateError(message);
      setRunStatus(message);
    }).finally(() => {
      setMaskGenerating(false);
    });
  }, [taskId, selected, showMask, enableShadow]);

  const updateInpaintState = useCallback((data: unknown) => {
    if (!data || typeof data !== 'object') return;
    const payload = data as Record<string, unknown>;
    const statusRaw = typeof payload.status === 'string' ? payload.status : '';
    const statusLower = statusRaw.toLowerCase();
    setInpaintStatusCode(statusLower);
    if (typeof payload.jobId === 'string' && payload.jobId) {
      setInpaintJobId(payload.jobId);
    } else if (typeof payload.job_id === 'string' && payload.job_id) {
      setInpaintJobId(payload.job_id);
    }
    const outputList = Array.isArray(payload.outputPaths)
      ? payload.outputPaths.filter((v): v is string => typeof v === 'string' && v.length > 0)
      : [];
    const outputPath = typeof payload.outputPath === 'string' ? payload.outputPath : '';
    const nextOutputs = outputList.length ? outputList : (outputPath ? [outputPath] : []);
    setInpaintOutputPaths(nextOutputs);
    const pending = statusLower === 'pending' || statusLower === 'in_progress';
    setInpaintRunning(pending);
    const payloadImagePath = typeof payload.originalImagePath === 'string'
      ? payload.originalImagePath
      : (typeof payload.imagePath === 'string' ? payload.imagePath : '');
    if (pending && payloadImagePath) {
      setInpaintRunningPath(payloadImagePath);
    }
    if (!pending) {
      setInpaintRunningPath(null);
    }
    const error = typeof payload.error === 'string' ? payload.error : null;
    if (!pending && error) {
      setInpaintError(error);
    } else {
      setInpaintError(null);
    }
    if (pending) {
      const message = '影像生成运行中...';
      setInpaintStatus('生成处理中...');
      setRunStatus(message);
      return;
    }
    if (error) {
      setRunStatus(error);
      return;
    }
    if (statusLower === 'succeeded' || statusLower === 'completed') {
      const message = '生成完成';
      setInpaintStatus(message);
      setRunStatus(message);
      reloadSegments().catch(() => undefined);
      return;
    }
    if (statusLower === 'failed') {
      const message = '生成失败';
      setInpaintStatus(message);
      setRunStatus(message);
      return;
    }
    if (statusLower) {
      const message = `生成状态：${statusRaw}`;
      setInpaintStatus(message);
      setRunStatus(message);
    } else {
      setInpaintStatus(null);
    }
  }, [reloadSegments]);

  const cancelInpaint = useCallback(async () => {
    if (!taskId) return;
    try {
      const res = await bridgeTaskService.cancelInpaint(taskId, inpaintJobId || undefined);
      updateInpaintState(res);
    } catch (e) {
      const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as { message?: unknown }).message) : '取消生成失败';
      const message = msg || '取消生成失败';
      setInpaintError(message);
      setRunStatus(message);
    }
  }, [taskId, inpaintJobId, updateInpaintState]);

  const openInpaintResults = useCallback((item?: LocateItem | null) => {
    if (!taskId) return;
    const nextJobId = item?.inpaintJobId || inpaintJobId;
    if (!nextJobId) return;
    setResultJobId(nextJobId);
    setResultsOpen(true);
  }, [taskId, inpaintJobId]);

  const openSegmentInfo = useCallback((target: LocateItem | null) => {
    if (viewMode !== 'segment') return;
    setSegmentInfoOpen(true);
    setSegmentInfoError(null);
    setSegmentInfoText(null);
    if (!target?.jsonUrl) {
      setSegmentInfoLoading(false);
      setSegmentInfoError('未找到分段JSON文件');
      return;
    }
    setSegmentInfoLoading(true);
    setSegmentInfoPath(target.jsonPath || target.jsonUrl || null);
    bridgeApi.get(target.jsonUrl, { responseType: 'text' }).then(res => {
      let text: string;
      if (typeof res.data === 'string') {
        try {
          text = JSON.stringify(JSON.parse(res.data), null, 2);
        } catch {
          text = res.data;
        }
      } else {
        text = JSON.stringify(res.data, null, 2);
      }
      setSegmentInfoText(text);
    }).catch(e => {
      const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as { message?: unknown }).message) : '加载分段JSON失败';
      setSegmentInfoError(msg || '加载分段JSON失败');
    }).finally(() => {
      setSegmentInfoLoading(false);
    });
  }, [viewMode]);

  useEffect(() => {
    if (!taskId) {
      setSegments([]);
      setSegmentsLoading(false);
      setSegmentsError(null);
      setViewMode('dom');
      return;
    }
    setDomIndex(0);
    reloadSegments().catch(() => undefined);
  }, [taskId, editByQuery, reloadSegments]);

  useEffect(() => {
    if (!taskId) return;
    bridgeTaskService.getInpaintStatus(taskId).then(res => {
      const payload = res as Record<string, unknown> | null;
      const err = payload && typeof payload.error === 'string' ? payload.error : null;
      if (err === 'job_not_found') {
        setInpaintJobId(null);
        setInpaintStatus(null);
        setInpaintError(null);
        setInpaintRunning(false);
        setInpaintRunningPath(null);
        setInpaintOutputPaths([]);
        setInpaintStatusCode(null);
        return;
      }
      updateInpaintState(res);
    }).catch(() => {
      setInpaintStatus(null);
      setInpaintError(null);
      setInpaintRunning(false);
      setInpaintRunningPath(null);
      setInpaintOutputPaths([]);
      setInpaintStatusCode(null);
    });
  }, [taskId, updateInpaintState]);

  useEffect(() => {
    if (!taskId || !inpaintJobId) return;
    let disposed = false;
    let timer: number | null = null;
    const poll = async () => {
      try {
        const res = await bridgeTaskService.getInpaintStatus(taskId, inpaintJobId);
        if (disposed) return;
        updateInpaintState(res);
        const payload = res as Record<string, unknown> | null;
        const status = payload && typeof payload.status === 'string' ? payload.status.toLowerCase() : '';
        if (status === 'pending' || status === 'in_progress') {
          timer = window.setTimeout(poll, 3000);
        }
      } catch {
        if (disposed) return;
        const message = '查询生成状态失败';
        setInpaintError(message);
        setRunStatus(message);
        setInpaintRunning(false);
        setInpaintRunningPath(null);
      }
    };
    timer = window.setTimeout(poll, 2000);
    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [taskId, inpaintJobId, updateInpaintState]);

  useEffect(() => {
    if (!taskId) return;
    const handler = (event: MessageEvent) => {
      if (!event?.data || typeof event.data !== 'object') return;
      const payload = event.data as { type?: string; taskId?: string };
      if (payload.type === 'inpaint_result_confirmed' && payload.taskId === taskId) {
        reloadSegments().catch(() => undefined);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [taskId, reloadSegments]);

  useEffect(() => {
    if (!taskId) return;
    let disposed = false;
    setLoading(true);
    setError(null);
    setData(null);
    bridgeApi.get(`/api/v1/tasks/${taskId}/dom-locate`).then(res => {
      if (disposed) return;
      const d = res.data as DomLocateResponse;
      setData(d);
      setDomIndex(0);
    }).catch(e => {
      if (disposed) return;
      const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as { message?: unknown }).message) : '加载失败';
      const message = msg || '加载失败';
      setError(message);
      setRunStatus(message);
    }).finally(() => {
      if (!disposed) setLoading(false);
    });
    return () => { disposed = true; };
  }, [taskId]);

  const flashMaskToast = useCallback((msg: string) => {
    setMaskToast(msg);
    setRunStatus(msg);
    if (maskToastTimerRef.current) {
      window.clearTimeout(maskToastTimerRef.current);
    }
    maskToastTimerRef.current = window.setTimeout(() => {
      setMaskToast(null);
      maskToastTimerRef.current = null;
    }, 2000);
  }, []);

  useEffect(() => {
    return () => {
      if (maskToastTimerRef.current) {
        window.clearTimeout(maskToastTimerRef.current);
      }
    };
  }, []);

  const syncHistoryState = useCallback(() => {
    setMaskHistoryIndex(maskHistoryIndexRef.current);
    setMaskHistoryLength(maskHistoryRef.current.length);
  }, []);

  const initHistoryFromCanvas = useCallback(() => {
    const canvas = maskEditCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    maskHistoryRef.current = [img];
    const cutCanvas = maskCutEditCanvasRef.current;
    if (cutCanvas) {
      const cutCtx = cutCanvas.getContext('2d');
      if (cutCtx) {
        const cutImg = cutCtx.getImageData(0, 0, cutCanvas.width, cutCanvas.height);
        maskCutHistoryRef.current = [cutImg];
      } else {
        maskCutHistoryRef.current = [];
      }
    } else {
      maskCutHistoryRef.current = [];
    }
    maskHistoryIndexRef.current = 0;
    syncHistoryState();
  }, [syncHistoryState]);

  const pushHistorySnapshot = useCallback(() => {
    const canvas = maskEditCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const list = maskHistoryRef.current;
    const cutCanvas = maskCutEditCanvasRef.current;
    const cutList = maskCutHistoryRef.current;
    let cutImg: ImageData | null = null;
    if (cutCanvas) {
      const cutCtx = cutCanvas.getContext('2d');
      if (cutCtx) {
        cutImg = cutCtx.getImageData(0, 0, cutCanvas.width, cutCanvas.height);
      }
    }
    if (maskHistoryIndexRef.current < list.length - 1) {
      list.splice(maskHistoryIndexRef.current + 1);
      if (cutList.length) {
        cutList.splice(maskHistoryIndexRef.current + 1);
      }
    }
    list.push(img);
    if (cutImg) {
      cutList.push(cutImg);
    }
    if (list.length > 20) {
      list.shift();
      if (cutList.length > 20) {
        cutList.shift();
      }
    }
    maskHistoryIndexRef.current = list.length - 1;
    syncHistoryState();
  }, [syncHistoryState]);

  const applyHistoryIndex = useCallback((idx: number) => {
    const canvas = maskEditCanvasRef.current;
    const list = maskHistoryRef.current;
    if (!canvas || !list.length || idx < 0 || idx >= list.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(list[idx], 0, 0);
    const cutCanvas = maskCutEditCanvasRef.current;
    const cutList = maskCutHistoryRef.current;
    if (cutCanvas && cutList.length && idx >= 0 && idx < cutList.length) {
      const cutCtx = cutCanvas.getContext('2d');
      if (cutCtx) {
        cutCtx.putImageData(cutList[idx], 0, 0);
      }
    }
    maskHistoryIndexRef.current = idx;
    syncHistoryState();
  }, [syncHistoryState]);

  const triggerUndo = useCallback(() => {
    if (maskHistoryIndexRef.current <= 0) return;
    applyHistoryIndex(maskHistoryIndexRef.current - 1);
    setMaskDirty(maskHistoryIndexRef.current > 0);
    setMaskEditVersion(v => v + 1);
  }, [applyHistoryIndex]);

  const scheduleMaskOverlay = useCallback(() => {
    if (maskOverlayFrameRef.current) return;
    maskOverlayFrameRef.current = window.requestAnimationFrame(() => {
      maskOverlayFrameRef.current = null;
      setMaskEditVersion(v => v + 1);
    });
  }, []);

  const isEditingMask = editMask && viewMode === 'segment' && showMask && !!selected?.tfw;

  const getMaskPixelFromEvent = useCallback((e: React.MouseEvent) => {
    if (!selected?.tfw) return null;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldX = (sx - view.offsetX) / view.scale;
    const worldY = -(sy - view.offsetY) / view.scale;
    const px = worldToPixel(selected.tfw, [worldX, worldY]);
    if (!px) return null;
    const canvas = maskEditCanvasRef.current;
    if (!canvas) return null;
    const clampedX = clamp(px[0], 0, canvas.width);
    const clampedY = clamp(px[1], 0, canvas.height);
    return [clampedX, clampedY] as [number, number];
  }, [selected?.tfw, view.offsetX, view.offsetY, view.scale]);

  const getBrushPixelSize = useCallback(() => {
    const base = Math.max(1, brushSizeRef.current);
    const tfw = selected?.tfw;
    if (!tfw) return base;
    const worldPerPixelX = Math.hypot(tfw.a, tfw.d);
    const worldPerPixelY = Math.hypot(tfw.b, tfw.e);
    const worldPerPixel = (Number.isFinite(worldPerPixelX) ? worldPerPixelX : 0) + (Number.isFinite(worldPerPixelY) ? worldPerPixelY : 0);
    const worldPerPixelAvg = worldPerPixel > 0 ? worldPerPixel / 2 : 1;
    const screenPerPixel = Math.max(1e-9, worldPerPixelAvg * view.scale);
    return Math.max(1, base / screenPerPixel);
  }, [selected?.tfw, view.scale]);

  const drawStrokeToMask = useCallback((from: [number, number] | null, to: [number, number], erase: boolean) => {
    const size = getBrushPixelSize();
    const lineWidth = Math.max(1, size / 2);
    const canvases = [maskEditCanvasRef.current, maskCutEditCanvasRef.current].filter(Boolean) as HTMLCanvasElement[];
    for (const canvas of canvases) {
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      if (erase) {
        ctx.strokeStyle = 'black';
        ctx.fillStyle = 'black';
      } else {
        ctx.strokeStyle = 'white';
        ctx.fillStyle = 'white';
      }
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (from) {
        ctx.beginPath();
        ctx.moveTo(from[0], from[1]);
        ctx.lineTo(to[0], to[1]);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(to[0], to[1], lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    setMaskDirty(true);
    scheduleMaskOverlay();
  }, [getBrushPixelSize, scheduleMaskOverlay]);

  const closePolygon = useCallback(() => {
    if (polygonPoints.length < 3) return;
    const canvases = [maskEditCanvasRef.current, maskCutEditCanvasRef.current].filter(Boolean) as HTMLCanvasElement[];
    for (const canvas of canvases) {
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.moveTo(polygonPoints[0][0], polygonPoints[0][1]);
      for (let i = 1; i < polygonPoints.length; i += 1) {
        ctx.lineTo(polygonPoints[i][0], polygonPoints[i][1]);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    setPolygonPoints([]);
    setPolygonHover(null);
    setMaskDirty(true);
    scheduleMaskOverlay();
    pushHistorySnapshot();
  }, [polygonPoints, pushHistorySnapshot, scheduleMaskOverlay]);

  const triggerMaskSave = useCallback(async () => {
    if (!taskId) return;
    if (viewMode !== 'segment' || !selected?.jsonPath) {
      const message = '请选择分段后再保存掩膜';
      setMaskSaveError(message);
      setRunStatus(message);
      return;
    }
    logger.info('maskSave', selected?.jsonPath ?? '');
    const canvas = maskEditCanvasRef.current;
    if (!canvas) {
      const message = '未加载掩膜';
      setMaskSaveError(message);
      setRunStatus(message);
      return;
    }
    const cutCanvas = maskCutEditCanvasRef.current;
    setMaskSaving(true);
    setMaskSaveError(null);
    setMaskSaveSuccess(null);
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1] || '';
      const payload: MaskSavePayload = {
        segment_json_path: selected.jsonPath,
        mask_png_base64: base64,
      };
      if (cutCanvas) {
        const cutUrl = cutCanvas.toDataURL('image/png');
        payload.mask_cut_png_base64 = cutUrl.split(',')[1] || '';
      }
      await bridgeTaskService.maskSave(taskId, payload);
      setMaskDirty(false);
      const message = '掩膜已保存';
      setMaskSaveSuccess(message);
      setRunStatus(message);
      setMaskReloadKey(v => v + 1);
    } catch (e) {
      const errObj = e as { userMessage?: string; message?: unknown };
      const msg = errObj.userMessage || (typeof errObj.message === 'string' ? errObj.message : '');
      const message = msg || '保存掩膜失败';
      setMaskSaveError(message);
      setRunStatus(message);
    } finally {
      setMaskSaving(false);
    }
  }, [taskId, viewMode, selected?.jsonPath]);

  const triggerInpaint = useCallback(async (item?: LocateItem | null) => {
    if (!taskId) return;
    const target = item ?? selected;
    if (viewMode !== 'segment' || !target?.jsonPath || !target?.path) {
      const message = '请选择分段后再生成影像';
      setInpaintError(message);
      setRunStatus(message);
      return;
    }
    const targetSegmentIndex = segmentOrderIndexMap.get(target.jsonPath);
    const previousSegment = typeof targetSegmentIndex === 'number' && targetSegmentIndex > 0
      ? segmentItems[targetSegmentIndex - 1]
      : null;
    const previousConfirmed = !previousSegment || !!(previousSegment.resultPath || previousSegment.resultFileUrl);
    if (!previousConfirmed) {
      const message = '请先完成上一分段确认';
      setInpaintError(message);
      setRunStatus(message);
      return;
    }
    const hasExistingResultForSegment = !!(target.resultFileUrl || target.resultPath);
    if (hasExistingResultForSegment) {
      const ok = await confirm({ title: '重新生成', message: '当前分段已有生成结果，确定要重新生成影像吗？' });
      if (!ok) return;
    }
    if (maskDirty) {
      const ok = await confirm({ title: '保存掩膜', message: '掩膜有改动，是否保存后再生成影像？' });
      if (!ok) return;
      await triggerMaskSave();
    }
    let currentBlurRadius = blurRadius;
    let currentExpandPixels = expandPixels;
    let currentInpaintCount = inpaintCount;
    try {
      const s = await bridgeSettingsService.getSettings();
      if (typeof s.blurRadius === 'number' && s.blurRadius >= 0 && s.blurRadius <= 20) currentBlurRadius = s.blurRadius;
      if (typeof s.expandPixels === 'number' && s.expandPixels >= 0 && s.expandPixels <= 50) currentExpandPixels = s.expandPixels;
      if (typeof s.inpaintCount === 'number' && s.inpaintCount >= 1 && s.inpaintCount <= 8) currentInpaintCount = s.inpaintCount;
      setBlurRadius(currentBlurRadius);
      setExpandPixels(currentExpandPixels);
      setInpaintCount(currentInpaintCount);
    } catch { /* use local fallback */ }
    const payload: Record<string, string> = {
      segment_json_path: target.jsonPath,
      image_path: target.path,
    };
    if (currentInpaintCount > 1) {
      payload.count = String(currentInpaintCount);
    }
    payload.blur_radius = String(currentBlurRadius);
    payload.expand = String(currentExpandPixels);
    const maskPath = buildMaskPath(target.jsonPath, target.path, target);
    if (maskPath) {
      payload.removal_mask_path = maskPath;
    }
    const maskCutPath = buildMaskCutPath(target.jsonPath, target.path, target);
    if (maskCutPath) {
      payload.crop_mask_path = maskCutPath;
    }
    if (previousSegment?.resultPath && previousSegment?.worldFilePath && target.worldFilePath) {
      payload.previous_result_path = previousSegment.resultPath;
      payload.previous_world_file_path = previousSegment.worldFilePath;
      payload.current_world_file_path = target.worldFilePath;
    }
    setInpaintError(null);
    setInpaintStatus('生成提交中...');
    setRunStatus('影像生成运行中...');
    setInpaintRunning(true);
    setInpaintRunningPath(target.path);
    setInpaintStatusCode('pending');
    setInpaintOutputPaths([]);
    try {
      const res = await bridgeTaskService.startInpaint(taskId, payload);
      updateInpaintState(res);
    } catch (e) {
      const errObj = e as { userMessage?: string; message?: unknown };
      const msg = errObj.userMessage || (typeof errObj.message === 'string' ? errObj.message : '');
      const message = msg || '生成启动失败';
      setInpaintError(message);
      setRunStatus(message);
      setInpaintRunning(false);
      setInpaintRunningPath(null);
      setInpaintStatus(null);
      setInpaintStatusCode(null);
    }
  }, [taskId, viewMode, selected, maskDirty, triggerMaskSave, updateInpaintState, segmentOrderIndexMap, segmentItems, inpaintCount]);

  const handleShowMaskToggle = useCallback(async (next: boolean) => {
    if (next) {
      setShowMask(true);
      setEditMask(true);
      return;
    }
    if (maskDirty) {
      const ok = await confirm({ title: '保存掩膜', message: '掩膜有改动，是否保存？' });
      if (!ok) return;
      if (!maskSaving) {
        await triggerMaskSave();
      }
    }
    setEditMask(false);
    setShowMask(false);
  }, [maskDirty, maskSaving, triggerMaskSave]);

  useEffect(() => {
    if (viewMode !== 'segment') {
      setSegmentInfoOpen(false);
      if (showMask) {
        void handleShowMaskToggle(false);
      }
    }
  }, [viewMode, showMask, handleShowMaskToggle]);

  const handleCloseEdit = useCallback(async () => {
    if (maskDirty) {
      const ok = await confirm({ title: '退出编辑', message: '掩膜有改动，确定退出编辑吗？', variant: 'danger' });
      if (!ok) return;
    }
    maskDrawingRef.current = false;
    lastDrawRef.current = null;
    setPolygonPoints([]);
    setPolygonHover(null);
    setEditMask(false);
  }, [maskDirty]);

  const handleMaskMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isEditingMask) return;
    if (e.button === 1) return;
    e.preventDefault();
    e.stopPropagation();
    const px = getMaskPixelFromEvent(e);
    if (!px) return;
    const tool = maskToolRef.current;
    if (tool === 'brush' || tool === 'erase') {
      maskDrawingRef.current = true;
      lastDrawRef.current = px;
      drawStrokeToMask(null, px, tool === 'erase');
      return;
    }
    if (tool === 'polygon') {
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
  }, [isEditingMask, getMaskPixelFromEvent, drawStrokeToMask, polygonPoints, closePolygon]);

  const handleMaskMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isEditingMask) return;
    if ((e.buttons & 4) === 4) return;
    const px = getMaskPixelFromEvent(e);
    if (!px) return;
    const tool = maskToolRef.current;
    if ((tool === 'brush' || tool === 'erase') && maskDrawingRef.current) {
      const last = lastDrawRef.current;
      drawStrokeToMask(last, px, tool === 'erase');
      lastDrawRef.current = px;
      return;
    }
    if (tool === 'polygon') {
      setPolygonHover(px);
    }
  }, [isEditingMask, getMaskPixelFromEvent, drawStrokeToMask]);

  const handleMaskMouseUp = useCallback(() => {
    if (!isEditingMask) return;
    if (maskDrawingRef.current) {
      maskDrawingRef.current = false;
      lastDrawRef.current = null;
      pushHistorySnapshot();
      setMaskEditVersion(v => v + 1);
    }
  }, [isEditingMask, pushHistorySnapshot]);

  const handleMaskMouseLeave = useCallback(() => {
    if (maskDrawingRef.current) {
      maskDrawingRef.current = false;
      lastDrawRef.current = null;
      pushHistorySnapshot();
      setMaskEditVersion(v => v + 1);
    }
    setPolygonHover(null);
  }, [pushHistorySnapshot]);

  const clearMask = useCallback(() => {
    const canvases = [maskEditCanvasRef.current, maskCutEditCanvasRef.current].filter(Boolean) as HTMLCanvasElement[];
    if (!canvases.length) return;
    for (const canvas of canvases) {
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setMaskDirty(true);
    pushHistorySnapshot();
    setMaskEditVersion(v => v + 1);
  }, [pushHistorySnapshot]);

  const handleMaskDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!isEditingMask) return;
    if (maskToolRef.current !== 'polygon') return;
    e.preventDefault();
    if (polygonPoints.length >= 3) {
      closePolygon();
    }
  }, [isEditingMask, polygonPoints, closePolygon]);

  const handleMaskContextMenu = useCallback((e: React.MouseEvent) => {
    if (!isEditingMask) return;
    if (maskToolRef.current !== 'polygon') return;
    e.preventDefault();
    if (polygonPoints.length >= 3) {
      closePolygon();
    }
  }, [isEditingMask, polygonPoints, closePolygon]);

  const confirmSwitchIfDirty = useCallback(async () => {
    if (!editMask || !maskDirty) return true;
    return await confirm({ title: '保存确认', message: '掩膜有改动，是否保存？', variant: 'primary' });
  }, [editMask, maskDirty]);

  useEffect(() => {
    if (!editMask) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPolygonPoints([]);
        setPolygonHover(null);
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'b') {
        setMaskTool('brush');
      } else if (key === 'p') {
        setMaskTool('polygon');
      } else if (key === 'e') {
        setMaskTool('erase');
      } else if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        triggerUndo();
      } else if ((e.ctrlKey || e.metaKey) && key === 's') {
        e.preventDefault();
        if (!maskSaving) {
          triggerMaskSave();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editMask, triggerUndo, maskSaving, triggerMaskSave]);

  useEffect(() => {
    if (!showMask || viewMode !== 'segment') {
      setMaskBitmap(prev => {
        if (prev && 'close' in prev) prev.close();
        return null;
      });
      setMaskCutBitmap(prev => {
        if (prev && 'close' in prev) prev.close();
        return null;
      });
      return;
    }
    if (!taskId) return;
    const jsonPath = selected?.jsonPath;
    if (!jsonPath) {
      flashMaskToast('掩膜不存在');
      setMaskBitmap(null);
      return;
    }
    const maskPath = buildMaskPath(jsonPath, selected?.path, selected ?? undefined);
    if (!maskPath) {
      flashMaskToast('掩膜不存在');
      setMaskBitmap(null);
      return;
    }
    let disposed = false;
    bridgeApi.get<ArrayBuffer>(`/api/v1/tasks/${taskId}/preprocess-file?path=${encodeURIComponent(maskPath)}`, { responseType: 'arraybuffer' }).then(res => {
      if (disposed) return;
      const contentType = String((res.headers as Record<string, unknown>)['content-type'] || '');
      return createBitmapFromImageBuffer(res.data as ArrayBuffer, contentType);
    }).then(bitmap => {
      if (disposed || !bitmap) return;
      setMaskBitmap(prev => {
        if (prev && 'close' in prev) prev.close();
        return bitmap;
      });
    }).catch(() => {
      if (disposed) return;
      setMaskBitmap(null);
      flashMaskToast('掩膜不存在');
    });
    return () => {
      disposed = true;
    };
  }, [showMask, viewMode, selected?.jsonPath, selected?.path, taskId, flashMaskToast, maskReloadKey]);

  useEffect(() => {
    if (!showMask || viewMode !== 'segment') {
      setMaskCutBitmap(prev => {
        if (prev && 'close' in prev) prev.close();
        return null;
      });
      return;
    }
    if (!taskId) return;
    const jsonPath = selected?.jsonPath;
    if (!jsonPath) {
      setMaskCutBitmap(null);
      return;
    }
    const maskPath = buildMaskCutPath(jsonPath, selected?.path, selected ?? undefined);
    if (!maskPath) {
      setMaskCutBitmap(null);
      return;
    }
    let disposed = false;
    bridgeApi.get<ArrayBuffer>(`/api/v1/tasks/${taskId}/preprocess-file?path=${encodeURIComponent(maskPath)}`, { responseType: 'arraybuffer' }).then(res => {
      if (disposed) return;
      const contentType = String((res.headers as Record<string, unknown>)['content-type'] || '');
      return createBitmapFromImageBuffer(res.data as ArrayBuffer, contentType);
    }).then(bitmap => {
      if (disposed || !bitmap) return;
      setMaskCutBitmap(prev => {
        if (prev && 'close' in prev) prev.close();
        return bitmap;
      });
    }).catch(() => {
      if (disposed) return;
      setMaskCutBitmap(null);
    });
    return () => {
      disposed = true;
    };
  }, [showMask, viewMode, selected?.jsonPath, selected?.path, taskId, maskReloadKey]);

  useEffect(() => {
    if (!showMask || viewMode !== 'segment') {
      maskEditCanvasRef.current = null;
      maskCutEditCanvasRef.current = null;
      setPolygonPoints([]);
      setPolygonHover(null);
      setMaskDirty(false);
      setMaskEditVersion(v => v + 1);
      return;
    }
    const width = maskBitmap?.width || maskCutBitmap?.width || selected?.width || 0;
    const height = maskBitmap?.height || maskCutBitmap?.height || selected?.height || 0;
    if (!width || !height) return;
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (maskBitmap) {
      ctx.drawImage(maskBitmap, 0, 0);
    }
    maskEditCanvasRef.current = c;
    if (maskCutBitmap) {
      const c2 = document.createElement('canvas');
      c2.width = width;
      c2.height = height;
      const ctx2 = c2.getContext('2d');
      if (ctx2) {
        ctx2.clearRect(0, 0, width, height);
        ctx2.drawImage(maskCutBitmap, 0, 0);
      }
      maskCutEditCanvasRef.current = c2;
    } else {
      maskCutEditCanvasRef.current = null;
    }
    initHistoryFromCanvas();
    setMaskDirty(false);
    setMaskEditVersion(v => v + 1);
  }, [showMask, viewMode, selected?.jsonPath, selected?.width, selected?.height, maskBitmap, maskCutBitmap, initHistoryFromCanvas]);

  useEffect(() => {
    if (!showMask || viewMode !== 'segment') {
      setMaskOverlayBitmap(prev => {
        if (prev && 'close' in prev) prev.close();
        return null;
      });
      return;
    }
    const source = maskEditCanvasRef.current;
    if (!source) {
      setMaskOverlayBitmap(prev => {
        if (prev && 'close' in prev) prev.close();
        return null;
      });
      return;
    }
    let disposed = false;
    const seq = ++maskOverlaySeqRef.current;
    const renderOverlay = async () => {
      const c = document.createElement('canvas');
      c.width = source.width;
      c.height = source.height;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(source, 0, 0);
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const data = img.data;
      const opacity = clamp(maskOpacity, 0, 1);
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.max(data[i], data[i + 1], data[i + 2]);
        if (v === 0) {
          data[i + 3] = 0;
        } else {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
          data[i + 3] = Math.round(v * opacity);
        }
      }
      ctx.putImageData(img, 0, 0);
      const bitmap = await createImageBitmap(c);
      if (disposed || seq !== maskOverlaySeqRef.current) {
        if ('close' in bitmap) bitmap.close();
        return;
      }
      setMaskOverlayBitmap(prev => {
        if (prev && 'close' in prev) prev.close();
        return bitmap;
      });
    };
    renderOverlay();
    return () => {
      disposed = true;
    };
  }, [showMask, viewMode, maskOpacity, maskEditVersion]);

  useEffect(() => {
    if (!items.length) {
      setTiles([]);
      tilesRef.current = [];
      return;
    }
    const prevItems = tilesRef.current.map(t => t.item);
    const sameItems = items.length === prevItems.length
      && items.every((d, i) => d.path === prevItems[i]?.path && d.fileUrl === prevItems[i]?.fileUrl);
    if (sameItems) return;
    const init: LoadedTile[] = items.map(d => ({
      item: d,
      status: 'idle',
      width: d.width || 512,
      height: d.height || 512,
      bitmap: null,
      boundsWorld: null,
    }));
    setTiles(init);
    tilesRef.current = init;
    setLoadSeq(v => v + 1);
  }, [items, viewMode]);

  useEffect(() => {
    tilesRef.current = tiles;
  }, [tiles]);

  useEffect(() => {
    if (!canUseMergedSwipe || !mergedSwipeEnabled) {
      setCompareTiles([]);
      compareTilesRef.current = [];
      return;
    }
    if (viewMode === 'segment_result') {
      const currentResult = segmentResultItems[domIndex];
      if (!currentResult) {
        setCompareTiles([]);
        compareTilesRef.current = [];
        return;
      }
      const matchSeg = segmentItems.find(s => s.segmentId === currentResult.segmentId);
      if (!matchSeg) {
        setCompareTiles([]);
        compareTilesRef.current = [];
        return;
      }
      const init: LoadedTile[] = [{
        item: matchSeg,
        status: 'idle',
        width: matchSeg.width || 512,
        height: matchSeg.height || 512,
        bitmap: null,
        boundsWorld: null,
      }];
      setCompareTiles(init);
      compareTilesRef.current = init;
      setCompareLoadSeq(v => v + 1);
    } else {
      const init: LoadedTile[] = segmentItems.map(d => ({
        item: d,
        status: 'idle',
        width: d.width || 512,
        height: d.height || 512,
        bitmap: null,
        boundsWorld: null,
      }));
      setCompareTiles(init);
      compareTilesRef.current = init;
      setCompareLoadSeq(v => v + 1);
    }
  }, [canUseMergedSwipe, mergedSwipeEnabled, segmentItems, viewMode, segmentResultItems, domIndex]);

  useEffect(() => {
    compareTilesRef.current = compareTiles;
  }, [compareTiles]);

  useEffect(() => {
    if (!tilesRef.current.length) return;
    let disposed = false;
    const loadOne = async (idx: number, item: LocateItem) => {
      setTiles(prev => prev.map((t, i) => i === idx ? { ...t, status: 'loading', error: undefined } : t));
      try {
        if (!item?.fileUrl) throw new Error('file_url_missing');
        const resp = await bridgeApi.get<ArrayBuffer>(item.fileUrl, { responseType: 'arraybuffer' });
        if (disposed) return;
        const contentType = String((resp.headers as Record<string, unknown>)['content-type'] || '');
        const buf = resp.data as ArrayBuffer;
        let bitmap: ImageBitmap;
        let width = item.width || 512;
        let height = item.height || 512;
        const looksLikeTiff = isTiffPath(item.path) || contentType.includes('tif') || contentType.includes('tiff');
        if (looksLikeTiff) {
          try {
            const raster = await decodeTiffToRgba(buf);
            if (disposed) return;
            width = raster.width;
            height = raster.height;
            bitmap = await createBitmapFromRgba(raster);
          } catch {
            bitmap = await createBitmapFromImageBuffer(buf, contentType || 'image/png');
            width = bitmap.width || width;
            height = bitmap.height || height;
          }
        } else {
          bitmap = await createBitmapFromImageBuffer(buf, contentType);
          width = bitmap.width || width;
          height = bitmap.height || height;
        }
        const boundsWorld = computeBoundsWorld(item.tfw || null, width, height);
        setTiles(prev => prev.map((t, i) => i === idx ? { ...t, status: 'loaded', bitmap, width, height, boundsWorld } : t));
      } catch (e) {
        if (disposed) return;
        setTiles(prev => prev.map((t, i) => i === idx ? { ...t, status: 'failed', error: e instanceof Error ? e.message : 'load_failed' } : t));
      }
    };

    const run = async () => {
      while (!disposed) {
        const current = tilesRef.current;
        const nextIdx = current.findIndex(t => t.status === 'idle');
        if (nextIdx < 0) return;
        const next = current[nextIdx];
        if (!next) return;
        await loadOne(nextIdx, next.item);
      }
    };
    run().catch(() => {});
    return () => { disposed = true; };
  }, [loadSeq]);

  useEffect(() => {
    if (!compareTilesRef.current.length) return;
    let disposed = false;
    const loadOne = async (idx: number, item: LocateItem) => {
      setCompareTiles(prev => prev.map((t, i) => i === idx ? { ...t, status: 'loading', error: undefined } : t));
      try {
        if (!item?.fileUrl) throw new Error('file_url_missing');
        const resp = await bridgeApi.get<ArrayBuffer>(item.fileUrl, { responseType: 'arraybuffer' });
        if (disposed) return;
        const contentType = String((resp.headers as Record<string, unknown>)['content-type'] || '');
        const buf = resp.data as ArrayBuffer;
        let bitmap: ImageBitmap;
        let width = item.width || 512;
        let height = item.height || 512;
        const looksLikeTiff = isTiffPath(item.path) || contentType.includes('tif') || contentType.includes('tiff');
        if (looksLikeTiff) {
          try {
            const raster = await decodeTiffToRgba(buf);
            if (disposed) return;
            width = raster.width;
            height = raster.height;
            bitmap = await createBitmapFromRgba(raster);
          } catch {
            bitmap = await createBitmapFromImageBuffer(buf, contentType || 'image/png');
            width = bitmap.width || width;
            height = bitmap.height || height;
          }
        } else {
          bitmap = await createBitmapFromImageBuffer(buf, contentType);
          width = bitmap.width || width;
          height = bitmap.height || height;
        }
        const boundsWorld = computeBoundsWorld(item.tfw || null, width, height);
        setCompareTiles(prev => prev.map((t, i) => i === idx ? { ...t, status: 'loaded', bitmap, width, height, boundsWorld } : t));
      } catch (e) {
        if (disposed) return;
        setCompareTiles(prev => prev.map((t, i) => i === idx ? { ...t, status: 'failed', error: e instanceof Error ? e.message : 'load_failed' } : t));
      }
    };

    const run = async () => {
      while (!disposed) {
        const current = compareTilesRef.current;
        const nextIdx = current.findIndex(t => t.status === 'idle');
        if (nextIdx < 0) return;
        const next = current[nextIdx];
        if (!next) return;
        await loadOne(nextIdx, next.item);
      }
    };
    run().catch(() => {});
    return () => { disposed = true; };
  }, [compareLoadSeq]);

  useEffect(() => {
    const loaded = tiles.filter(t => t.status === 'loaded' && t.boundsWorld);
    if (loaded.length === 0) {
      setWorldBounds(null);
      return;
    }
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const t of loaded) {
      const b = t.boundsWorld!;
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return;
    setWorldBounds({ minX, minY, maxX, maxY });
  }, [tiles]);

  const resetView = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || !worldBounds) return;
    const w = Math.max(1, viewer.clientWidth);
    const h = Math.max(1, viewer.clientHeight);
    setView(fitToBounds(worldBounds, w, h));
  }, [worldBounds]);

  const isTileVisible = useCallback((tile?: LoadedTile | null) => {
    if (!tile || !tile.boundsWorld) return false;
    const viewer = viewerRef.current;
    if (!viewer) return false;
    const w = Math.max(1, viewer.clientWidth);
    const h = Math.max(1, viewer.clientHeight);
    const { minX, minY, maxX, maxY } = tile.boundsWorld;
    const sx1 = minX * view.scale + view.offsetX;
    const sy1 = -minY * view.scale + view.offsetY;
    const sx2 = maxX * view.scale + view.offsetX;
    const sy2 = -maxY * view.scale + view.offsetY;
    const left = Math.min(sx1, sx2);
    const right = Math.max(sx1, sx2);
    const top = Math.min(sy1, sy2);
    const bottom = Math.max(sy1, sy2);
    return right >= 0 && left <= w && bottom >= 0 && top <= h;
  }, [view]);

  useEffect(() => {
    if (!worldBounds) return;
    if (skipResetRef.current) {
      skipResetRef.current = false;
      return;
    }
    resetView();
  }, [worldBounds, resetView]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const baseCanvas = baseCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!viewer || !baseCanvas || !overlayCanvas || !maskCanvas) return;

    const draw = () => {
      const w = Math.max(1, viewer.clientWidth);
      const h = Math.max(1, viewer.clientHeight);
      baseCanvas.width = w;
      baseCanvas.height = h;
      overlayCanvas.width = w;
      overlayCanvas.height = h;
      maskCanvas.width = w;
      maskCanvas.height = h;

      const ctx = baseCanvas.getContext('2d');
      const octx = overlayCanvas.getContext('2d');
      const mctx = maskCanvas.getContext('2d');
      if (!ctx || !octx || !mctx) return;
      ctx.clearRect(0, 0, w, h);
      octx.clearRect(0, 0, w, h);
      mctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = false;

      const scale = view.scale;
      const offsetX = view.offsetX;
      const offsetY = view.offsetY;

      const drawTileRaster = (target: CanvasRenderingContext2D, t: LoadedTile) => {
        if (t.status !== 'loaded' || !t.bitmap) return;
        const tfw = t.item.tfw || null;
        if (!tfw) return;
        target.setTransform(
          scale * tfw.a,
          -scale * tfw.d,
          scale * tfw.b,
          -scale * tfw.e,
          scale * tfw.c + offsetX,
          -scale * tfw.f + offsetY,
        );
        target.drawImage(t.bitmap, 0, 0);
      };

      if ((viewMode === 'merged_result' || viewMode === 'segment_result') && mergedSwipeEnabled && compareTiles.length) {
        for (const t of tiles) {
          drawTileRaster(ctx, t);
        }
        const splitX = clamp(mergedSwipeRatio, 0, 1) * w;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.beginPath();
        ctx.rect(0, 0, splitX, h);
        ctx.clip();
        for (const t of compareTiles) {
          drawTileRaster(ctx, t);
        }
        ctx.restore();
        octx.save();
        octx.beginPath();
        octx.moveTo(splitX, 0);
        octx.lineTo(splitX, h);
        octx.strokeStyle = '#3b82f6';
        octx.lineWidth = 1;
        octx.stroke();
        octx.restore();
      } else {
        for (const t of tiles) {
          drawTileRaster(ctx, t);
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      if (showMask && viewMode === 'segment' && maskOverlayBitmap && selected?.tfw) {
        const tfw = selected.tfw;
        mctx.setTransform(
          scale * tfw.a,
          -scale * tfw.d,
          scale * tfw.b,
          -scale * tfw.e,
          scale * tfw.c + offsetX,
          -scale * tfw.f + offsetY,
        );
        mctx.globalAlpha = 1;
        mctx.drawImage(maskOverlayBitmap, 0, 0);
        mctx.setTransform(1, 0, 0, 1, 0, 0);
      }

      if (isEditingMask && selected?.tfw && polygonPoints.length) {
        const tfw = selected.tfw;
        const toScreen = (px: [number, number]) => {
          const wp = pixelToWorld(tfw, px);
          if (!wp) return null;
          return [wp[0] * scale + offsetX, -wp[1] * scale + offsetY] as [number, number];
        };
        const pts: Array<[number, number]> = [];
        for (const p of polygonPoints) {
          const s = toScreen(p);
          if (s) pts.push(s);
        }
        if (pts.length) {
          mctx.save();
          mctx.beginPath();
          mctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i += 1) {
            mctx.lineTo(pts[i][0], pts[i][1]);
          }
          if (polygonHover) {
            const hv = toScreen(polygonHover);
            if (hv) {
              mctx.lineTo(hv[0], hv[1]);
            }
          }
          mctx.strokeStyle = '#f59e0b';
          mctx.lineWidth = 2;
          mctx.setLineDash([6, 4]);
          mctx.stroke();
          for (const p of pts) {
            mctx.beginPath();
            mctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
            mctx.fillStyle = '#fbbf24';
            mctx.fill();
          }
          mctx.restore();
        }
      }

      const drawPolyWorldCoords = (worldPts: Array<[number, number]>, color: string, lineWidth: number, dash?: number[]) => {
        if (worldPts.length < 2) return;
        octx.beginPath();
        const first = worldPts[0];
        octx.moveTo(first[0] * scale + offsetX, -first[1] * scale + offsetY);
        for (let i = 1; i < worldPts.length; i++) {
          octx.lineTo(worldPts[i][0] * scale + offsetX, -worldPts[i][1] * scale + offsetY);
        }
        octx.strokeStyle = color;
        octx.lineWidth = lineWidth;
        if (dash && dash.length) {
          octx.setLineDash(dash);
        } else {
          octx.setLineDash([]);
        }
        octx.stroke();
      };

      const drawPointWorldCoords = (worldPt: [number, number], color: string, radius: number) => {
        const x = worldPt[0] * scale + offsetX;
        const y = -worldPt[1] * scale + offsetY;
        octx.beginPath();
        octx.arc(x, y, radius, 0, Math.PI * 2);
        octx.fillStyle = color;
        octx.fill();
      };

      if (viewMode === 'merged_result' || viewMode === 'segment_result') {
        for (const seg of segmentItems) {
          if (!seg.tfw) continue;
          if (showBridgeRange && Array.isArray(seg.bridgePolygonPx)) {
            const worldPts: Array<[number, number]> = [];
            for (const p of seg.bridgePolygonPx) {
              const wp = pixelToWorld(seg.tfw, p);
              if (wp) worldPts.push(wp);
            }
            drawPolyWorldCoords(worldPts, '#2563eb', 3);
          }
          if (showCenterline && Array.isArray(seg.centerlinePx)) {
            const worldPts: Array<[number, number]> = [];
            for (const p of seg.centerlinePx) {
              const wp = pixelToWorld(seg.tfw, p);
              if (wp) worldPts.push(wp);
            }
            drawPolyWorldCoords(worldPts, '#ef4444', 3);
          }
          if (showCenterline && seg.centerPointPx) {
            const wp = pixelToWorld(seg.tfw, seg.centerPointPx);
            if (wp) drawPointWorldCoords(wp, '#ef4444', 4);
          }
          if (showLightDirection && seg.lightDirection && seg.centerPointPx) {
            const wp = pixelToWorld(seg.tfw, seg.centerPointPx);
            if (wp && seg.tfw) {
              const [dx, dy] = seg.lightDirection;
              const a = seg.tfw.a ?? 1;
              const b = seg.tfw.b ?? 0;
              const d = seg.tfw.d ?? 0;
              const e = seg.tfw.e ?? 1;
              const wdx = a * dx + b * dy;
              const wdy = d * dx + e * dy;
              const wLen = Math.sqrt(wdx * wdx + wdy * wdy);
              const nwdx = wLen > 0 ? wdx / wLen : 0;
              const nwdy = wLen > 0 ? wdy / wLen : 0;
              const arrowLen = Math.max(30, Math.min(80, (wp[0] * scale + offsetX) * 0.1));
              const sx = wp[0] * scale + offsetX;
              const sy = -wp[1] * scale + offsetY;
              const ex = sx + nwdx * arrowLen;
              const ey = sy - nwdy * arrowLen;
              octx.beginPath();
              octx.moveTo(sx, sy);
              octx.lineTo(ex, ey);
              octx.strokeStyle = '#facc15';
              octx.lineWidth = 3;
              octx.setLineDash([]);
              octx.stroke();
              const headLen = 10;
              const angle = Math.atan2(ey - sy, ex - sx);
              octx.beginPath();
              octx.moveTo(ex, ey);
              octx.lineTo(ex - headLen * Math.cos(angle - Math.PI / 6), ey - headLen * Math.sin(angle - Math.PI / 6));
              octx.lineTo(ex - headLen * Math.cos(angle + Math.PI / 6), ey - headLen * Math.sin(angle + Math.PI / 6));
              octx.closePath();
              octx.fillStyle = '#facc15';
              octx.fill();
            }
          }
          if (showImpactRange && Array.isArray(seg.impactPolygonPx)) {
            const worldPts: Array<[number, number]> = [];
            for (const p of seg.impactPolygonPx) {
              const wp = pixelToWorld(seg.tfw, p);
              if (wp) worldPts.push(wp);
            }
            drawPolyWorldCoords(worldPts, '#2563eb', 2, [6, 4]);
          }
        }
      }

      for (let i = 0; i < tiles.length; i += 1) {
        const t = tiles[i];
        if (t.status !== 'loaded' || !t.item.tfw) continue;
        const tfw = t.item.tfw;
        const drawPolyWorld = (pointsPx: Array<[number, number]>, color: string, lineWidth: number, dash?: number[]) => {
          const pts: Array<[number, number]> = [];
          for (const p of pointsPx) {
            const wp = pixelToWorld(tfw, p);
            if (wp) pts.push(wp);
          }
          if (pts.length < 2) return;
          octx.beginPath();
          const first = pts[0];
          octx.moveTo(first[0] * scale + offsetX, -first[1] * scale + offsetY);
          for (let i = 1; i < pts.length; i++) {
            octx.lineTo(pts[i][0] * scale + offsetX, -pts[i][1] * scale + offsetY);
          }
          octx.strokeStyle = color;
          octx.lineWidth = lineWidth;
          if (dash && dash.length) {
            octx.setLineDash(dash);
          } else {
            octx.setLineDash([]);
          }
          octx.stroke();
        };
        const drawPointWorld = (pointPx: [number, number], color: string, radius: number) => {
          const wp = pixelToWorld(tfw, pointPx);
          if (!wp) return;
          const x = wp[0] * scale + offsetX;
          const y = -wp[1] * scale + offsetY;
          octx.beginPath();
          octx.arc(x, y, radius, 0, Math.PI * 2);
          octx.fillStyle = color;
          octx.fill();
        };
        const drawLightDirectionArrow = (centerPx: [number, number], dir: [number, number]) => {
          const wp = pixelToWorld(tfw, centerPx);
          if (!wp) return;
          const [dx, dy] = dir;
          const a = tfw.a ?? 1;
          const b = tfw.b ?? 0;
          const d = tfw.d ?? 0;
          const e = tfw.e ?? 1;
          const wdx = a * dx + b * dy;
          const wdy = d * dx + e * dy;
          const wLen = Math.sqrt(wdx * wdx + wdy * wdy);
          const nwdx = wLen > 0 ? wdx / wLen : 0;
          const nwdy = wLen > 0 ? wdy / wLen : 0;
          const arrowLen = Math.max(30, Math.min(80, (wp[0] * scale + offsetX) * 0.1));
          const sx = wp[0] * scale + offsetX;
          const sy = -wp[1] * scale + offsetY;
          const ex = sx + nwdx * arrowLen;
          const ey = sy - nwdy * arrowLen;
          octx.beginPath();
          octx.moveTo(sx, sy);
          octx.lineTo(ex, ey);
          octx.strokeStyle = '#facc15';
          octx.lineWidth = 3;
          octx.setLineDash([]);
          octx.stroke();
          const headLen = 10;
          const angle = Math.atan2(ey - sy, ex - sx);
          octx.beginPath();
          octx.moveTo(ex, ey);
          octx.lineTo(ex - headLen * Math.cos(angle - Math.PI / 6), ey - headLen * Math.sin(angle - Math.PI / 6));
          octx.lineTo(ex - headLen * Math.cos(angle + Math.PI / 6), ey - headLen * Math.sin(angle + Math.PI / 6));
          octx.closePath();
          octx.fillStyle = '#facc15';
          octx.fill();
        };
        const drawLabelForPolygon = (pointsPx: Array<[number, number]>, name: string, color: string) => {
          if (!name || !pointsPx || pointsPx.length < 2) return;
          let minX = Infinity;
          let maxX = -Infinity;
          let minY = Infinity;
          for (const p of pointsPx) {
            const wp = pixelToWorld(tfw, p);
            if (!wp) continue;
            const x = wp[0] * scale + offsetX;
            const y = -wp[1] * scale + offsetY;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
          }
          if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY)) return;
          const x = (minX + maxX) / 2;
          const y = minY - 6;
          octx.save();
          octx.font = '12px sans-serif';
          octx.fillStyle = color;
          octx.textAlign = 'center';
          octx.textBaseline = 'bottom';
          octx.fillText(name, x, y);
          octx.restore();
        };

        if (showBridgeRange) {
          if (viewMode === 'segment') {
            if (i === domIndex && Array.isArray(t.item.bridgePolygonPx)) {
              drawPolyWorld(t.item.bridgePolygonPx, '#2563eb', 3);
            }
          } else {
            if (Array.isArray(t.item.predecessorBridgePolygonsPx)) {
              for (const p of t.item.predecessorBridgePolygonsPx) {
                if (Array.isArray(p)) drawPolyWorld(p, '#ec4899', 2);
              }
            }
            if (Array.isArray(t.item.successorBridgePolygonsPx)) {
              for (const p of t.item.successorBridgePolygonsPx) {
                if (Array.isArray(p)) drawPolyWorld(p, '#fde68a', 2);
              }
            }
            if (Array.isArray(t.item.bridgePolygonPx)) {
              drawPolyWorld(t.item.bridgePolygonPx, '#2563eb', 3);
            }
          }
        }

        if (showCenterline) {
          if (viewMode === 'segment') {
            if (i === domIndex && Array.isArray(t.item.centerlinePx)) {
              drawPolyWorld(t.item.centerlinePx, '#ef4444', 3);
            }
            if (i === domIndex && t.item.centerPointPx) {
              drawPointWorld(t.item.centerPointPx, '#ef4444', 4);
            }
          } else {
            if (Array.isArray(t.item.centerlinePx)) {
              drawPolyWorld(t.item.centerlinePx, '#ef4444', 3);
            }
          }
        }

        if (showLightDirection && viewMode === 'segment' && i === domIndex && t.item.lightDirection && t.item.centerPointPx) {
          drawLightDirectionArrow(t.item.centerPointPx, t.item.lightDirection);
        }
        
        if (showImpactRange) {
          if (Array.isArray(t.item.predecessorImpactPolygonsPx)) {
            for (const p of t.item.predecessorImpactPolygonsPx) {
              if (Array.isArray(p)) drawPolyWorld(p, '#ec4899', 2, [6, 4]);
            }
          }
          if (Array.isArray(t.item.successorImpactPolygonsPx)) {
            for (const p of t.item.successorImpactPolygonsPx) {
              if (Array.isArray(p)) drawPolyWorld(p, '#fde68a', 2, [6, 4]);
            }
          }
          if (Array.isArray(t.item.predecessorImpactLabelItems)) {
            for (const item of t.item.predecessorImpactLabelItems) {
              const name = typeof item?.name === 'string' ? item.name.trim() : '';
              if (!name || !Array.isArray(item?.polygonPx)) continue;
              drawLabelForPolygon(item.polygonPx, name, '#ec4899');
            }
          }
          if (Array.isArray(t.item.successorImpactLabelItems)) {
            for (const item of t.item.successorImpactLabelItems) {
              const name = typeof item?.name === 'string' ? item.name.trim() : '';
              if (!name || !Array.isArray(item?.polygonPx)) continue;
              drawLabelForPolygon(item.polygonPx, name, '#fde68a');
            }
          }
          if (Array.isArray(t.item.impactPolygonPx)) {
            drawPolyWorld(t.item.impactPolygonPx, '#2563eb', 2, [6, 4]);
          }
        }

        if (viewMode === 'segment' && i === domIndex) {
          const w = t.width || t.item.width || 0;
          const h = t.height || t.item.height || 0;
          if (w > 0 && h > 0) {
            drawPolyWorld([[0, 0], [w, 0], [w, h], [0, h], [0, 0]], '#22c55e', 2);
          }
        }
      }
    };

    draw();
  }, [tiles, compareTiles, mergedSwipeEnabled, mergedSwipeRatio, view, showBridgeRange, showImpactRange, showCenterline, showLightDirection, viewMode, domIndex, showMask, maskOverlayBitmap, selected, isEditingMask, polygonPoints, polygonHover, segmentItems]);

  const headerTitle = useMemo(() => {
    if (taskName) return taskName;
    return editByQuery ? '子任务编辑' : '子任务定位';
  }, [taskName, editByQuery]);

  const rendering = useMemo(() => {
    return tiles.some(t => t.status === 'loading');
  }, [tiles]);

  const maskCursor = useMemo(() => {
    if (!editMask || viewMode !== 'segment') return undefined;
    const size = Math.max(6, Math.min(120, Math.round(brushSize)));
    const r = Math.max(2, size / 4);
    if (maskTool === 'brush' || maskTool === 'erase') {
      const fill = maskTool === 'erase' ? '#000000' : 'none';
      const stroke = '#000000';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1"/></svg>`;
      const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      return `url("${url}") ${size / 2} ${size / 2}, crosshair`;
    }
    return 'crosshair';
  }, [editMask, viewMode, maskTool, brushSize]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <button className="text-2xl font-bold text-blue-600 hover:text-blue-800" type="button" onClick={() => navigate(-1)}>
            {headerTitle}
          </button>
          <div className="text-xs text-gray-500">
            DOM {data?.domCount ?? 0}，分段 {segments.length}，前置 {data?.dependencyCount ?? 0}，后置 {data?.successorCount ?? 0}
          </div>
        </div>
        <div className="flex items-center gap-2 relative z-[10000]">
          {inpaintRunning && (
            <button className="px-3 py-2 text-sm border rounded" onClick={cancelInpaint}>
              取消生成
            </button>
          )}
        </div>
      </div>

      {!loading && !error && (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-3 bg-white rounded shadow border">
            <div className="px-3 py-2 border-b">
              <div className="text-sm font-medium text-gray-700">
                {viewMode === 'segment'
                  ? '分段列表'
                  : (viewMode === 'segment_result'
                    ? '成果列表'
                    : (viewMode === 'merged_result' ? '合并成果列表' : 'DOM列表'))}
              </div>
              <div className="mt-2 flex gap-2">
                {editByQuery && (
                  <button
                    className={`px-2 py-1 text-xs border rounded ${viewMode === 'segment' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}
                    disabled={!segmentItems.length}
                    onClick={() => { setViewMode('segment'); setDomIndex(0); }}
                  >
                    分段 ({segmentItems.length})
                  </button>
                )}
                <button
                  className={`px-2 py-1 text-xs border rounded ${viewMode === 'segment_result' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}
                  disabled={!segmentResultItems.length}
                  onClick={() => { setViewMode('segment_result'); setDomIndex(0); }}
                >
                  成果 ({segmentResultItems.length})
                </button>
                <button
                  className={`px-2 py-1 text-xs border rounded ${viewMode === 'merged_result' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}
                  disabled={!mergedResultItems.length}
                  onClick={() => { setViewMode('merged_result'); setDomIndex(0); }}
                >
                  合并成果 ({mergedResultItems.length})
                </button>
                {editByQuery && (
                  <button
                    className={`px-2 py-1 text-xs border rounded ${viewMode === 'dom' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}
                    onClick={() => { setViewMode('dom'); setDomIndex(0); }}
                  >
                    DOM ({doms.length})
                  </button>
                )}
              </div>
            </div>
            {editByQuery && viewMode === 'segment_result' && (
              <div className="px-3 py-2 border-b">
                <button
                  className="w-full px-3 py-2 text-sm border rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                  onClick={() => { void mergeAllResults(); }}
                  disabled={!allSegmentResultsReady || mergeRunning || !taskId}
                  title={!allSegmentResultsReady ? '存在缺失分段成果，无法合并' : (mergeRunning ? '合并中...' : '所有成果影像合并')}
                >
                  {mergeRunning ? '合并中...' : '所有成果影像合并'}
                </button>
              </div>
            )}
            <div className="max-h-[70vh] overflow-auto">
              {items.map((d, idx) => (
                <button
                  key={`${d.path}-${idx}`}
                  className={`relative w-full text-left px-3 py-2 pr-32 text-sm border-b hover:bg-gray-50 ${idx === domIndex ? 'bg-blue-50' : ''}`}
                  onClick={() => {
                    setDomIndex(idx);
                    if (items.length === 1) {
                      const tile = tiles[idx];
                      if (!isTileVisible(tile)) {
                        resetView();
                      }
                    }
                  }}
                >
                  {viewMode === 'segment' && d.kind !== 'segment_result' && (
                    <div className="absolute right-2 top-2 flex items-center gap-2">
                      {(() => {
                        const previousSegment = idx > 0 ? segmentItems[idx - 1] : null;
                        const previousConfirmed = !previousSegment || !!previousSegment.resultConfirmed;
                        const runningCurrentItem = normalizePath(inpaintRunningPath) === normalizePath(d.path);
                        const inpaintDisabled = !taskId || (inpaintRunning && !runningCurrentItem) || !previousConfirmed;
                        const inpaintTitle = !previousConfirmed ? '请先完成上一分段确认' : (inpaintRunning ? '取消生成' : '生成影像');
                        const segmentResultJobId = d.inpaintJobId || null;
                        const resultSelectDisabled = !taskId || !segmentResultJobId || d.hasUnconfirmedBatch !== true;
                        const resultSelectTitle = resultSelectDisabled ? '该分段暂无可选择影像结果' : '结果选择';
                        return (
                          <>
                      {d.jsonUrl && (
                        <button
                          className="w-6 h-6 inline-flex items-center justify-center text-xs border rounded-full text-gray-600 bg-white hover:bg-gray-50"
                          onClick={e => {
                            e.stopPropagation();
                            setDomIndex(idx);
                            openSegmentInfo(d);
                          }}
                          title="分段JSON信息"
                          type="button"
                        >
                          i
                        </button>
                      )}
                      <button
                        className="w-6 h-6 inline-flex items-center justify-center text-xs border rounded-full text-gray-700 bg-gradient-to-b from-white to-gray-100 shadow-sm ring-1 ring-gray-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:translate-y-0 disabled:shadow-none disabled:from-gray-100 disabled:to-gray-200 disabled:text-gray-300 disabled:cursor-not-allowed"
                        onClick={e => {
                          e.stopPropagation();
                          setDomIndex(idx);
                          triggerMaskGenerate(d);
                        }}
                        disabled={maskGenerating || !taskId}
                        title="生成掩膜"
                        type="button"
                      >
                        📄
                      </button>
                      <button
                        className="w-6 h-6 inline-flex items-center justify-center text-xs border rounded-full text-gray-700 bg-gradient-to-b from-white to-gray-100 shadow-sm ring-1 ring-gray-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:translate-y-0 disabled:shadow-none disabled:from-gray-100 disabled:to-gray-200 disabled:text-gray-300 disabled:cursor-not-allowed"
                        onClick={e => {
                          e.stopPropagation();
                          setDomIndex(idx);
                          if (inpaintRunning) {
                            cancelInpaint();
                          } else {
                            triggerInpaint(d);
                          }
                        }}
                        disabled={inpaintDisabled}
                        title={inpaintTitle}
                        type="button"
                      >
                        {inpaintRunning && runningCurrentItem ? '⏸' : '▶'}
                      </button>
                      <button
                        className="w-6 h-6 inline-flex items-center justify-center text-xs border rounded-full text-gray-700 bg-gradient-to-b from-white to-gray-100 shadow-sm ring-1 ring-gray-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:translate-y-0 disabled:shadow-none disabled:from-gray-100 disabled:to-gray-200 disabled:text-gray-300 disabled:cursor-not-allowed"
                        onClick={e => {
                          e.stopPropagation();
                          setDomIndex(idx);
                          openInpaintResults(d);
                        }}
                        disabled={resultSelectDisabled}
                        title={resultSelectTitle}
                        type="button"
                      >
                        选
                      </button>
                          </>
                        );
                      })()}
                    </div>
                  )}
                  <div className="font-medium text-gray-900 break-all">
                    {viewMode === 'segment'
                      ? `分段 ${d.segmentId ?? idx + 1} - ${basename(d.path)}`
                      : (viewMode === 'segment_result'
                        ? `成果 ${d.segmentId ?? idx + 1} - ${basename(d.path)}`
                        : (viewMode === 'merged_result'
                          ? `合并成果 ${d.segmentId ?? idx + 1} - ${basename(d.path)}`
                          : basename(d.path)))}
                  </div>
                  <div className="text-xs text-gray-500 break-all">{d.path}</div>
                </button>
              ))}
              {items.length === 0 && (
                <div className="px-3 py-6 text-sm text-gray-500 text-center">
                  {viewMode === 'segment'
                    ? (segmentsLoading ? '分段数据包加载中...' : (segmentsError || '无分段数据包'))
                    : (viewMode === 'segment_result'
                      ? (segmentsLoading ? '分段成果加载中...' : '无分段成果')
                      : (viewMode === 'merged_result' ? (segmentsLoading ? '合并成果加载中...' : '无合并成果') : '无关联DOM'))}
                </div>
              )}
            </div>
          </div>
          {viewMode === 'segment' && segmentInfoOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
              onClick={() => setSegmentInfoOpen(false)}
            >
              <div
                className="bg-white rounded shadow-lg border w-[90vw] max-w-3xl max-h-[80vh] flex flex-col"
                onClick={e => e.stopPropagation()}
              >
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <div className="text-sm text-gray-700 truncate">分段JSON：{segmentInfoPath ? basename(segmentInfoPath) : '-'}</div>
                  <button
                    className="text-gray-500 hover:text-gray-700"
                    onClick={() => setSegmentInfoOpen(false)}
                  >
                    关闭
                  </button>
                </div>
                <div className="p-4 overflow-auto">
                  {segmentInfoLoading && <div className="text-sm text-gray-500">加载中...</div>}
                  {segmentInfoError && <div className="text-sm text-red-600">{segmentInfoError}</div>}
                  {!segmentInfoLoading && !segmentInfoError && segmentInfoText && (
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap break-all">{segmentInfoText}</pre>
                  )}
                </div>
              </div>
            </div>
          )}
          {resultsOpen && taskId && resultJobId && (
            <BridgeInpaintResultsPage
              mode="modal"
              taskId={taskId}
              jobId={resultJobId}
              onClose={() => setResultsOpen(false)}
              onRetry={() => {
                void triggerInpaint();
                setResultsOpen(false);
              }}
              onConfirmed={() => {
                reloadSegments().catch(() => undefined);
              }}
            />
          )}

          <div className="col-span-12 md:col-span-9 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {selected ? `${domIndex + 1}/${items.length}` : '-'}，已加载 {tiles.filter(t => t.status === 'loaded').length}/{tiles.length}
              </div>
              <div className="flex items-center gap-2">
                {showMask && viewMode === 'segment' && (
                  <div className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded bg-white">
                    <span>透明度</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(maskOpacity * 100)}
                      onChange={e => setMaskOpacity(Number(e.target.value) / 100)}
                    />
                    <span>{Math.round(maskOpacity * 100)}%</span>
                  </div>
                )}
                {showMask && (
                  <button
                    className={`px-3 py-2 text-sm border rounded disabled:opacity-50 ${editMask ? 'bg-blue-600 text-white border-blue-600' : ''}`}
                    onClick={() => setEditMask(v => !v)}
                  >
                    掩膜编辑
                  </button>
                )}
                <div className="relative" ref={displayMenuRef}>
                  <button
                    className="list-none cursor-pointer px-3 py-2 text-sm border rounded bg-white"
                    type="button"
                    onClick={() => setDisplayMenuOpen(v => !v)}
                  >
                    显示开关
                  </button>
                  {displayMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 rounded border bg-white shadow z-[10001]">
                      <label className="flex items-center gap-2 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={showBridgeRange}
                          onChange={e => setShowBridgeRange(e.target.checked)}
                        />
                        桥梁范围
                      </label>
                      <label className="flex items-center gap-2 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={showCenterline}
                          onChange={e => setShowCenterline(e.target.checked)}
                        />
                        中心线
                      </label>
                      <label className="flex items-center gap-2 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={showLightDirection}
                          onChange={e => setShowLightDirection(e.target.checked)}
                        />
                        光照方向
                      </label>
                      <label className="flex items-center gap-2 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={showImpactRange}
                          onChange={e => setShowImpactRange(e.target.checked)}
                        />
                        影响范围
                      </label>
                      <label className={`flex items-center gap-2 px-3 py-2 text-sm ${viewMode !== 'segment' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <input
                          type="checkbox"
                          checked={showMask}
                          disabled={viewMode !== 'segment'}
                          onChange={e => { void handleShowMaskToggle(e.target.checked); }}
                        />
                        掩膜
                      </label>
                    </div>
                  )}
                </div>
                <button
                  className="px-3 py-2 text-sm border rounded disabled:opacity-50"
                  disabled={domIndex <= 0}
                  onClick={async () => {
                    if (!(await confirmSwitchIfDirty())) return;
                    if (editMask && maskDirty) {
                      triggerMaskSave();
                    }
                    setDomIndex(i => Math.max(0, i - 1));
                  }}
                >
                  上一幅
                </button>
                <button
                  className="px-3 py-2 text-sm border rounded disabled:opacity-50"
                  disabled={domIndex >= items.length - 1}
                  onClick={async () => {
                    if (!(await confirmSwitchIfDirty())) return;
                    if (editMask && maskDirty) {
                      triggerMaskSave();
                    }
                    setDomIndex(i => Math.min(items.length - 1, i + 1));
                  }}
                >
                  下一幅
                </button>
              </div>
            </div>

            {editByQuery && viewMode === 'segment' && segmentsError && (
              <div className="bg-white rounded shadow border p-3">
                <div className="flex gap-2">
                  <button
                    className="px-3 py-2 text-sm border rounded disabled:opacity-50"
                    disabled={segmentsGenerating || segmentsLoading || !taskId}
                    onClick={() => {
                      if (!taskId) return;
                      setSegmentsGenerating(true);
                      setSegmentsGenerateError(null);
                      bridgeApi.post(`/api/v1/tasks/${taskId}/preprocess-generate`).then(() => {
                        return reloadSegments();
                      }).catch(e => {
                        const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as { message?: unknown }).message) : '生成分段数据包失败';
                        const message = msg || '生成分段数据包失败';
                        setSegmentsGenerateError(message);
                        setRunStatus(message);
                      }).finally(() => {
                        setSegmentsGenerating(false);
                      });
                    }}
                  >
                    {segmentsGenerating ? '生成中...' : '生成分段数据包'}
                  </button>
                  <button
                    className="px-3 py-2 text-sm border rounded disabled:opacity-50"
                    disabled={segmentsGenerating || segmentsLoading}
                    onClick={() => reloadSegments().catch(() => undefined)}
                  >
                    刷新分段
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white rounded shadow border p-3">
              {selected?.bridgeGeometryMissing && (
                <div className="mb-2 px-3 py-2 text-sm border rounded bg-yellow-50 text-yellow-800">
                  桥梁多边形缺失或非 Polygon，无法绘制桥梁范围。原因：{selected.bridgeGeometryMissingReason || 'unknown'}
                </div>
              )}
              <div
                ref={viewerRefCallback}
                className="relative w-full overflow-hidden bg-black"
                style={{ height: '70vh', touchAction: 'none' }}
                onMouseDown={e => {
                  if (isEditingMask && e.button !== 1) return;
                  if (localEditActive && e.button === 0) return;
                  if (e.button === 1) {
                    e.preventDefault();
                  }
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const splitX = rect.left + clamp(mergedSwipeRatio, 0, 1) * rect.width;
                  const dividerMode = (viewMode === 'merged_result' || viewMode === 'segment_result')
                    && mergedSwipeEnabled
                    && e.button === 0
                    && Math.abs(e.clientX - splitX) <= 12;
                  dragRef.current = {
                    mode: dividerMode ? 'divider' : 'pan',
                    x: e.clientX,
                    y: e.clientY,
                    ox: view.offsetX,
                    oy: view.offsetY,
                  };
                }}
                onMouseMove={e => {
                  if (!dragRef.current.mode) {
                    if ((viewMode === 'merged_result' || viewMode === 'segment_result') && mergedSwipeEnabled) {
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      if (rect.width > 0) {
                        const ratio = (e.clientX - rect.left) / rect.width;
                        setMergedSwipeRatio(clamp(ratio, 0.05, 0.95));
                      }
                    }
                    return;
                  }
                  if (dragRef.current.mode === 'divider') {
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    if (rect.width > 0) {
                      const ratio = (e.clientX - rect.left) / rect.width;
                      setMergedSwipeRatio(clamp(ratio, 0.05, 0.95));
                    }
                    return;
                  }
                  const dx = e.clientX - dragRef.current.x;
                  const dy = e.clientY - dragRef.current.y;
                  setView(v => ({ ...v, offsetX: dragRef.current.ox + dx, offsetY: dragRef.current.oy + dy }));
                }}
                onMouseUp={() => { dragRef.current.mode = null; }}
                onMouseLeave={() => { dragRef.current.mode = null; }}
              >
                <canvas ref={baseCanvasRef} className="absolute inset-0" />
                <canvas ref={overlayCanvasRef} className="absolute inset-0 pointer-events-none" />
                <canvas
                  ref={maskCanvasRef}
                  className={`absolute inset-0 ${editMask ? 'pointer-events-auto' : 'pointer-events-none'}`}
                  style={{ cursor: maskCursor }}
                  onMouseDown={handleMaskMouseDown}
                  onMouseMove={handleMaskMouseMove}
                  onMouseUp={handleMaskMouseUp}
                  onMouseLeave={handleMaskMouseLeave}
                  onDoubleClick={handleMaskDoubleClick}
                  onContextMenu={handleMaskContextMenu}
                />
                <button
                  className="absolute top-2 left-2 w-9 h-9 flex items-center justify-center rounded border bg-white/90 text-gray-700 shadow hover:bg-white"
                  type="button"
                  onClick={() => resetView()}
                  title="适配视图"
                  aria-label="适配视图"
                >
                  ⤢
                </button>
                {(viewMode === 'merged_result' || viewMode === 'segment_result') && (
                  <button
                    className={`absolute top-2 left-12 w-9 h-9 flex items-center justify-center rounded border shadow ${mergedSwipeEnabled ? 'bg-blue-600 text-white border-blue-600' : 'bg-white/90 text-gray-700 hover:bg-white'}`}
                    type="button"
                    onClick={() => {
                      setMergedSwipeEnabled(v => !v);
                      setMergedSwipeRatio(0.5);
                    }}
                    title={mergedSwipeEnabled ? '关闭卷帘对比' : '开启卷帘对比'}
                    aria-label={mergedSwipeEnabled ? '关闭卷帘对比' : '开启卷帘对比'}
                  >
                    ◫
                  </button>
                )}
                {viewMode === 'merged_result' && (
                  <button
                    className={`absolute top-2 left-[88px] w-9 h-9 flex items-center justify-center rounded border shadow ${localEditActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white/90 text-gray-700 hover:bg-white'}`}
                    type="button"
                    onClick={() => setLocalEditActive(v => !v)}
                    title={localEditActive ? '关闭局部编辑' : '局部编辑'}
                    aria-label={localEditActive ? '关闭局部编辑' : '局部编辑'}
                  >
                    ✎
                  </button>
                )}
                {editMask && viewMode === 'segment' && (
                  <div
                    className="absolute top-2 right-2 bg-white/90 border rounded shadow flex flex-col gap-2 p-2"
                    style={{ width: `${toolbarWidth}px` }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-gray-700">掩膜工具</div>
                      <button
                        className="text-xs text-gray-500 hover:text-gray-800"
                        onClick={handleCloseEdit}
                      >
                        关闭
                      </button>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        className={`px-2 py-1 text-xs border rounded text-left ${maskTool === 'brush' ? 'bg-blue-600 text-white border-blue-600' : ''}`}
                        onClick={() => setMaskTool('brush')}
                      >
                        涂抹 (B)
                      </button>
                      <button
                        className={`px-2 py-1 text-xs border rounded text-left ${maskTool === 'polygon' ? 'bg-blue-600 text-white border-blue-600' : ''}`}
                        onClick={() => setMaskTool('polygon')}
                      >
                        多边形 (P)
                      </button>
                      <button
                        className={`px-2 py-1 text-xs border rounded text-left ${maskTool === 'erase' ? 'bg-blue-600 text-white border-blue-600' : ''}`}
                        onClick={() => setMaskTool('erase')}
                      >
                        擦除 (E)
                      </button>
                      <button
                        className="px-2 py-1 text-xs border rounded text-left"
                        onClick={clearMask}
                      >
                        清空掩膜
                      </button>
                      <button
                        className="px-2 py-1 text-xs border rounded text-left disabled:opacity-50"
                        disabled={maskSaving || !maskDirty}
                        onClick={() => triggerMaskSave()}
                      >
                        {maskSaving ? '保存中...' : '保存 (Ctrl+S)'}
                      </button>
                      <button
                        className="px-2 py-1 text-xs border rounded text-left disabled:opacity-50"
                        disabled={maskHistoryIndex <= 0}
                        onClick={() => triggerUndo()}
                      >
                        撤销 (Ctrl+Z)
                      </button>
                    </div>
                    <div className="text-[11px] text-gray-600">
                      历史：{maskHistoryLength ? maskHistoryIndex + 1 : 0}/{maskHistoryLength}
                    </div>
                    {(maskTool === 'brush' || maskTool === 'erase') && (
                      <div className="flex flex-col gap-1">
                        <div className="text-xs text-gray-600">画笔大小</div>
                        <input
                          type="range"
                          min={2}
                          max={80}
                          value={brushSize}
                          onChange={e => setBrushSize(Number(e.target.value))}
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      <div className="text-xs text-gray-600">工具栏宽度</div>
                      <input
                        type="range"
                        min={160}
                        max={360}
                        value={toolbarWidth}
                        onChange={e => setToolbarWidth(Number(e.target.value))}
                      />
                    </div>
                    <div className="text-[11px] text-gray-600">
                      {maskDirty ? '未保存' : '已保存'}
                    </div>
                  </div>
                )}
                {rendering && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-white bg-black bg-opacity-50">
                    渲染中...
                  </div>
                )}
                {viewMode === 'merged_result' && selected && (
                  <LocalEditPanel
                    taskId={taskId}
                    imagePath={selected.path}
                    imageWidth={selected.width}
                    imageHeight={selected.height}
                    tfw={selected.tfw || null}
                    view={view}
                    active={localEditActive}
                    onToggle={() => setLocalEditActive(v => !v)}
                    onApplied={async () => {
                      skipResetRef.current = true;
                      await reloadSegments().catch(() => undefined);
                      const ts = Date.now();
                      setSegments(prev => prev.map(s => {
                        if (s.kind !== 'merged_result') return s;
                        const addTs = (url: string) => {
                          const sep = url.includes('?') ? '&' : '?';
                          return `${url}${sep}_t=${ts}`;
                        };
                        return {
                          ...s,
                          fileUrl: addTs(s.fileUrl),
                          resultFileUrl: s.resultFileUrl ? addTs(s.resultFileUrl) : s.resultFileUrl,
                        };
                      }));
                    }}
                  />
                )}
              </div>
              {selected && (
                <div className="mt-2 text-xs text-gray-600 break-all">
                  当前{viewMode === 'segment' ? '分段' : 'DOM'}：{selected.path}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="mt-3 space-y-1">
        {runStatus && <div className="text-sm text-blue-600">{runStatus}</div>}
      </div>
      {confirmDialog}
    </div>
  );
};
