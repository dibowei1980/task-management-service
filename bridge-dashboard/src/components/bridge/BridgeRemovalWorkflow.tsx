import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BridgeTask, BridgeUser } from '../../types';
import { bridgeTaskService, bridgeProjectService, bridgeUserService } from '../../services/bridgeService';
import { useAuth } from '../../context/AuthContext';
import { parseJson } from '../../utils/json';
import { buildMaskPath } from '../../utils/pathBuilders';
import { getErrorMessage } from '../../utils/taskHelpers';
import { WORKFLOW_TABS, getWorkflowStatus, getWorkflowStatusLabel } from './workflow/types';
import type { WorkflowStatus, PreprocessSegmentItem } from './workflow/types';
import { logger } from '../../utils/logger';
import { toast } from '../common/Toast';
import { ConfirmDialog } from '../common/ConfirmDialog';

export const BridgeRemovalWorkflow: React.FC<{ projectId?: string }> = ({ projectId }) => {
  const params = useParams();
  const effectiveProjectId = projectId || params.projectId;
  const { user } = useAuth();
  const roles = user?.permissions || [];
  const navigate = useNavigate();

  const [project, setProject] = useState<BridgeTask | null>(null);
  const [allTasks, setAllTasks] = useState<BridgeTask[]>([]);
  const [activeTab, setActiveTab] = useState<WorkflowStatus>('处理中');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const [userOptions, setUserOptions] = useState<BridgeUser[]>([]);
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; variant: 'danger' | 'primary'; onConfirm: () => void } | null>(null);
  const [projectById, setProjectById] = useState<Record<string, BridgeTask>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showOnlyMineTasks, setShowOnlyMineTasks] = useState(true);
  const [infoTask, setInfoTask] = useState<BridgeTask | null>(null);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [batchMaskGenerating, setBatchMaskGenerating] = useState(false);
  const [batchMaskMessage, setBatchMaskMessage] = useState<string | null>(null);
  const [batchMaskError, setBatchMaskError] = useState<string | null>(null);
  const [enableShadow, setEnableShadow] = useState(false);
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const userSelectedTabRef = useRef(false);
  const showOnlyMineTouchedRef = useRef(false);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const focusTimerRef = useRef<number | null>(null);

  const canDeleteTask = roles.includes('task:update_global') || roles.includes('project:update_global');
  const canQualityCheck = roles.includes('quality:check') || roles.includes('task:update_global');
  const userId = user?.userId;
  const userName = user?.username;
  const hasBroadProjectRead = roles.includes('project:read_global') || roles.includes('project:read_department') || roles.includes('project:read_own') || roles.includes('project:read') || roles.includes('project:create');

  const userNameById = useMemo(() => {
    const map: Record<string, string> = {};
    userOptions.forEach(u => {
      if (u?.userId) map[u.userId] = u.username;
    });
    return map;
  }, [userOptions]);

  const loadProject = useCallback(async () => {
    if (!effectiveProjectId) {
      setProject(null);
      setLoadError(null);
      return;
    }
    try {
      const p = await bridgeTaskService.getTask(effectiveProjectId);
      setProject(p as BridgeTask);
      if (p?.id) {
        setProjectById(prev => ({ ...prev, [p.id]: p as BridgeTask }));
      }
      setLoadError(null);
    } catch (e) {
      logger.error('loadProject', e);
      setProject(null);
      setLoadError(`加载项目失败：${getErrorMessage(e, '请检查项目ID/权限/服务连接')}`);
    }
  }, [effectiveProjectId]);

  const loadUnits = useCallback(async () => {
    try {
      if (effectiveProjectId) {
        const subtasks = await bridgeProjectService.getSubTasks(effectiveProjectId);
        const tasks: BridgeTask[] = Array.isArray(subtasks) ? subtasks : [];
        setAllTasks(tasks.filter(task => task.category !== 'SYSTEM_TASK'));
        if (project?.id) {
          setProjectById({ [project.id]: project });
        }
        setLoadError(null);
      }
    } catch (e) {
      logger.error('loadUnits', e);
      setAllTasks([]);
      setLoadError(`加载任务失败：${getErrorMessage(e, '请检查权限/服务连接')}`);
    }
  }, [effectiveProjectId, project]);

  useEffect(() => {
    loadUnits().catch((e) => logger.error('loadUnits', e));
  }, [loadUnits]);

  const canReadAllUsers = roles.includes('user:read');
  const canReadDeptUsers = roles.includes('user:read_department');
  const userDepartmentId = user?.departmentId;

  useEffect(() => {
    loadProject().catch((e) => logger.error('loadProject', e));
  }, [loadProject]);

  useEffect(() => {
    if (!canReadAllUsers && !canReadDeptUsers) {
      setUserOptions([]);
      return;
    }
    const deptId = canReadAllUsers ? undefined : userDepartmentId;
    bridgeUserService.getUsers(undefined, deptId).then(setUserOptions).catch(() => setUserOptions([]));
  }, [canReadAllUsers, canReadDeptUsers, userDepartmentId]);

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
  }, [activeTab]);

  useEffect(() => {
    setSelectedIds(prev => {
      const allowed = new Set(allTasks.map(t => t.id));
      return prev.filter(id => allowed.has(id));
    });
  }, [allTasks]);

  const getBridgeLength = (task: BridgeTask): string => {
    const input = parseJson(task.inputParams);
    const feature = input['bridge_feature'] as Record<string, unknown> | undefined;
    const props = feature?.['properties'] as Record<string, unknown> | undefined;
    const len = props?.['Shape_Leng'] || props?.['length'] || props?.['LENGTH'] || props?.['Length'] || input['bridge_length'];
    if (typeof len === 'number') return len.toFixed(2);
    if (typeof len === 'string') return len;
    const lineLen = getLineLength(input['bridge_centerline']);
    if (typeof lineLen === 'number' && Number.isFinite(lineLen) && lineLen > 0) return lineLen.toFixed(2);
    return '-';
  };

  const getBridgeWidth = (task: BridgeTask): string => {
    const input = parseJson(task.inputParams);
    const feature = input['bridge_feature'] as Record<string, unknown> | undefined;
    const props = feature?.['properties'] as Record<string, unknown> | undefined;
    const width = props?.['bridge_width'] || input['bridge_width'];
    if (typeof width === 'number') return width.toFixed(2);
    if (typeof width === 'string') return width;
    return '-';
  };

  const getBridgeLengthWidth = (task: BridgeTask): string => {
    const length = getBridgeLength(task);
    const width = getBridgeWidth(task);
    if (length === '-' && width === '-') return '-';
    return `${length}/${width}`;
  };

  const getWorkflowStatusForTask = (task: BridgeTask): string | null => {
    return getWorkflowStatus(task) || (task.status === 'PAUSED' ? '已锁定' : null);
  };

  const getAssigneeDisplay = (task: BridgeTask): string => {
    const name = task.assigneeName;
    if (name) return name;
    const id = task.assigneeId || '';
    if (!id) return '-';
    if (id === userId && userName) return userName;
    return userNameById[id] || id;
  };

  const getLineLength = (geom: unknown): number | null => {
    if (!geom || typeof geom !== 'object') return null;
    const g = geom as { type?: string; coordinates?: unknown; geometries?: unknown };
    const distance = (a: number[], b: number[]) => {
      const dx = a[0] - b[0];
      const dy = a[1] - b[1];
      return Math.hypot(dx, dy);
    };
    const lengthOfLine = (coords: number[][]) => {
      let total = 0;
      for (let i = 1; i < coords.length; i += 1) {
        const a = coords[i - 1];
        const b = coords[i];
        if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) continue;
        total += distance(a, b);
      }
      return total;
    };
    if (g.type === 'LineString' && Array.isArray(g.coordinates)) {
      return lengthOfLine(g.coordinates as number[][]);
    }
    if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) {
      let total = 0;
      for (const line of g.coordinates as number[][][]) {
        if (Array.isArray(line)) total += lengthOfLine(line);
      }
      return total;
    }
    if (g.type === 'GeometryCollection' && Array.isArray(g.geometries)) {
      let total = 0;
      for (const child of g.geometries as unknown[]) {
        const len = getLineLength(child);
        if (typeof len === 'number') total += len;
      }
      return total;
    }
    return null;
  };

  const checkMaskExists = async (taskId: string, maskPath: string) => {
    try {
      await bridgeTaskService.preprocessFile(taskId, maskPath);
      return true;
    } catch (err) {
      const error = err as { response?: { status?: number } };
      if (error?.response?.status === 404) return false;
      throw err;
    }
  };

  const runBatchMaskGenerate = async () => {
    if (batchMaskGenerating || selectedTasks.length < 2) return;
    setBatchMaskGenerating(true);
    setBatchMaskError(null);
    setBatchMaskMessage(null);
    let skipped = 0;
    let generated = 0;
    let failed = 0;
    try {
      for (const task of selectedTasks) {
        let segments: PreprocessSegmentItem[] = [];
        try {
          const res = await bridgeTaskService.preprocessSegments(task.id);
          segments = Array.isArray(res?.segments) ? res.segments : [];
        } catch {
          failed += 1;
          continue;
        }
        const batchItems: Array<{ segment_json_path: string }> = [];
        for (const seg of segments) {
          const jsonPath = typeof seg.jsonPath === 'string' ? seg.jsonPath : '';
          const name = typeof seg.path === 'string' ? seg.path : (typeof seg.imagePath === 'string' ? seg.imagePath : '');
          if (!jsonPath) {
            skipped += 1;
            continue;
          }
          const maskPath = buildMaskPath(jsonPath, name);
          if (!maskPath) {
            skipped += 1;
            continue;
          }
          let exists = false;
          try {
            exists = await checkMaskExists(task.id, maskPath);
          } catch {
            failed += 1;
            continue;
          }
          if (exists) {
            skipped += 1;
            continue;
          }
          batchItems.push({ segment_json_path: jsonPath });
        }
        if (!batchItems.length) {
          continue;
        }
        try {
          await bridgeTaskService.maskGenerate(task.id, { batch: batchItems, inputParams: { enable_shadow: enableShadow } });
          generated += batchItems.length;
        } catch {
          failed += batchItems.length;
        }
        setBatchMaskMessage(`处理中：已生成 ${generated}，已跳过 ${skipped}，失败 ${failed}`);
      }
      setBatchMaskMessage(`批处理完成：生成 ${generated}，跳过 ${skipped}，失败 ${failed}`);
    } catch (err) {
      const msg = getErrorMessage(err, '批量掩膜生成失败');
      setBatchMaskError(msg);
    } finally {
      setBatchMaskGenerating(false);
    }
  };

  const taskById = useMemo(() => {
    const map: Record<string, BridgeTask> = {};
    allTasks.forEach(t => {
      if (t?.id) map[t.id] = t;
    });
    Object.values(projectById).forEach(t => {
      if (t?.id) map[t.id] = t;
    });
    if (project?.id) map[project.id] = project;
    return map;
  }, [allTasks, projectById, project]);

  const taskBreadcrumb = useMemo(() => {
    if (!project?.id) return [];
    const chain: BridgeTask[] = [];
    const seen = new Set<string>();
    let current: BridgeTask | undefined = project;
    while (current?.id && !seen.has(current.id)) {
      chain.unshift(current);
      seen.add(current.id);
      const parentId: string | undefined = current.parentTaskId;
      current = parentId ? taskById[parentId] : undefined;
    }
    return chain;
  }, [project, taskById]);

  const visibleTasks = useMemo(() => {
    if (hasBroadProjectRead) return allTasks;
    return allTasks.filter(task => {
      const hasAssignee = task.assigneeId != null;
      const hasOperators = Array.isArray(task.operatorIds) && task.operatorIds.length > 0;
      if (userId && (task.assigneeId === userId || (hasOperators && task.operatorIds?.includes(userId)))) {
        return true;
      }
      if (!hasAssignee && !hasOperators && userId) {
        const projectRef = task.projectId ? projectById[task.projectId] : undefined;
        if (projectRef?.operatorIds?.includes(userId)) return true;
      }
      return false;
    });
  }, [allTasks, hasBroadProjectRead, projectById, userId]);

  const filtered = useMemo(() => {
    const base = activeTab === '全部'
      ? visibleTasks
      : visibleTasks
      .map(t => ({ task: t, workflowStatus: getWorkflowStatusForTask(t) }))
      .filter(x => x.workflowStatus === activeTab)
      .map(x => x.task);
    if (['处理中', '待初检', '待写回', '需修改', '完成'].includes(activeTab) && showOnlyMineTasks && userId) {
      return base.filter(t => t.assigneeId === userId);
    }
    return base;
  }, [activeTab, showOnlyMineTasks, userId, visibleTasks]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { 全部: visibleTasks.length };
    visibleTasks.forEach(t => {
      const status = getWorkflowStatusForTask(t);
      if (!status) return;
      counts[status] = (counts[status] || 0) + 1;
    });
    if (showOnlyMineTasks && userId && ['处理中', '待初检', '待写回', '需修改', '完成'].includes(activeTab)) {
      const mineCounts: Record<string, number> = {};
      visibleTasks.forEach(t => {
        if (t.assigneeId !== userId) return;
        const status = getWorkflowStatusForTask(t);
        if (!status) return;
        mineCounts[status] = (mineCounts[status] || 0) + 1;
      });
      ['处理中', '待初检', '待写回', '需修改', '完成'].forEach(key => {
        counts[key] = mineCounts[key] || 0;
      });
    }
    return counts;
  }, [activeTab, showOnlyMineTasks, userId, visibleTasks]);

  useEffect(() => {
    if (showOnlyMineTouchedRef.current) return;
    setShowOnlyMineTasks(!hasBroadProjectRead);
  }, [hasBroadProjectRead]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    if (userSelectedTabRef.current) return;
    const hasProcessing = visibleTasks.some(t => getWorkflowStatusForTask(t) === '处理中');
    const next = hasProcessing ? '处理中' : '待处理';
    if (activeTab !== next) {
      setActiveTab(next);
    }
  }, [activeTab, visibleTasks]);

  useEffect(() => {
    if (!focusTaskId) return;
    if (activeTab !== '处理中') return;
    const idx = filtered.findIndex(t => t.id === focusTaskId);
    if (idx < 0) return;
    const targetPage = Math.floor(idx / pageSize) + 1;
    if (page !== targetPage) {
      setPage(targetPage);
      return;
    }
    if (focusTimerRef.current) {
      window.clearTimeout(focusTimerRef.current);
    }
    const el = rowRefs.current[focusTaskId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    focusTimerRef.current = window.setTimeout(() => {
      setFocusTaskId(null);
    }, 3000);
    return () => {
      if (focusTimerRef.current) {
        window.clearTimeout(focusTimerRef.current);
      }
    };
  }, [focusTaskId]);

  const selectedTasks = useMemo(() => {
    if (!selectedIds.length) return [];
    const set = new Set(selectedIds);
    return allTasks.filter(t => set.has(t.id));
  }, [allTasks, selectedIds]);

  const isPageAllSelected = useMemo(() => {
    if (!pageItems.length) return false;
    return pageItems.every(t => selectedIds.includes(t.id));
  }, [pageItems, selectedIds]);

  const isPageIndeterminate = useMemo(() => {
    if (!pageItems.length) return false;
    const selectedOnPage = pageItems.filter(t => selectedIds.includes(t.id)).length;
    return selectedOnPage > 0 && selectedOnPage < pageItems.length;
  }, [pageItems, selectedIds]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isPageIndeterminate;
    }
  }, [isPageIndeterminate]);

  const toggleSelectAll = () => {
    const pageIds = pageItems.map(t => t.id);
    setSelectedIds(prev => {
      if (!pageIds.length) return prev;
      if (pageIds.every(id => prev.includes(id))) {
        return prev.filter(id => !pageIds.includes(id));
      }
      const next = new Set(prev);
      pageIds.forEach(id => next.add(id));
      return Array.from(next);
    });
  };

  const toggleSelectTask = (taskId: string) => {
    setSelectedIds(prev => (prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]));
  };

  const isPendingForReceive = (task: BridgeTask) => {
    const status = getWorkflowStatusForTask(task);
    if (status) return status === '待处理';
    return task.status === 'PENDING';
  };

  const updateWorkflow = async (taskId: string, workflowStatus: string, extra?: { commentStage?: string; commentResult?: string; commentMessage?: string; intermediatePath?: string }) => {
    await bridgeTaskService.updateWorkflowStatus(taskId, {
      workflowStatus,
      commentStage: extra?.commentStage,
      commentResult: extra?.commentResult,
      commentMessage: extra?.commentMessage,
      intermediatePath: extra?.intermediatePath
    });
    await loadUnits();
  };
  const changeWorkflow = async (taskId: string, workflowStatus: string) => {
    await updateWorkflow(taskId, workflowStatus);
  };

  const deleteTask = (task: BridgeTask) => {
    setConfirmState({
      title: '删除子任务',
      message: `确认删除子任务「${task.name}」？此操作不可恢复。`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await bridgeProjectService.delete(task.id);
          await loadUnits();
        } catch (e) {
          logger.error('deleteTask', e);
          toast.error('删除失败');
        }
      },
    });
  };

  const assignAndStart = async (task: BridgeTask) => {
    if (!userId) {
      toast.error('无法获取当前用户信息');
      return;
    }
    try {
      const operatorIds = Array.isArray(task.operatorIds) && task.operatorIds.length > 0
        ? Array.from(new Set([userId, ...task.operatorIds]))
        : [userId];
      await bridgeTaskService.updateTask(task.id, { assignee_id: userId, assignee_name: userName || '', operator_ids: operatorIds });
      await updateWorkflow(task.id, '处理中');
      setActiveTab('处理中');
      setFocusTaskId(task.id);
    } catch (e) {
      logger.error('acceptTask', e);
      toast.error('任务接收失败');
    }
  };

  const batchDelete = () => {
    if (!selectedTasks.length) return;
    setConfirmState({
      title: '批量删除',
      message: `确认批量删除已选 ${selectedTasks.length} 个子任务？此操作不可恢复。`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmState(null);
        setBatchMaskMessage(null);
        setBatchMaskError(null);
        const results = await Promise.allSettled(selectedTasks.map(t => bridgeProjectService.delete(t.id)));
        const failed = results.filter(r => r.status === 'rejected').length;
        await loadUnits();
        setSelectedIds([]);
        if (failed > 0) {
          setBatchMaskError(`批量删除完成，失败 ${failed} 个`);
        } else {
      setBatchMaskMessage('批量删除完成');
        }
      },
    });
  };

  const batchReceive = () => {
    if (!userId) {
      toast.error('无法获取当前用户信息');
      return;
    }
    const targets = selectedTasks.filter(isPendingForReceive);
    if (!targets.length) {
      toast.warning('已选任务中没有可接收的待处理任务');
      return;
    }
    setConfirmState({
      title: '批量接收',
      message: `确认接收已选 ${targets.length} 个子任务？`,
      variant: 'primary',
      onConfirm: async () => {
        setConfirmState(null);
        setBatchMaskMessage(null);
        setBatchMaskError(null);
        const results = await Promise.allSettled(targets.map(async task => {
          const operatorIds = Array.isArray(task.operatorIds) && task.operatorIds.length > 0
            ? Array.from(new Set([userId, ...task.operatorIds]))
            : [userId];
          await bridgeTaskService.updateTask(task.id, { assignee_id: userId, assignee_name: userName || '', operator_ids: operatorIds });
          await bridgeTaskService.updateWorkflowStatus(task.id, { workflowStatus: '处理中' });
        }));
        const failed = results.filter(r => r.status === 'rejected').length;
        await loadUnits();
        setActiveTab('处理中');
        const first = targets.find(t => t?.id);
        if (first?.id) {
          setFocusTaskId(first.id);
        }
        if (failed > 0) {
          setBatchMaskError(`批量接收完成，失败 ${failed} 个`);
        } else {
          setBatchMaskMessage('批量接收完成');
        }
      },
    });
  };

  const updatePriority = async (task: BridgeTask, value: number) => {
    try {
      await bridgeTaskService.updateTask(task.id, { priority: value });
      await loadUnits();
    } catch (e) {
      logger.error('updatePriority', e);
      toast.error('优先级更新失败');
    }
  };

  const renderPriority = (task: BridgeTask) => {
    if (!canDeleteTask) return `${task.priority}`;
    return (
      <select
        className="border rounded px-2 py-1 text-sm"
        value={task.priority}
        onChange={e => updatePriority(task, parseInt(e.target.value, 10))}
      >
        {[1, 2, 3, 4, 5].map(v => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
    );
  };

  const renderLocate = (task: BridgeTask) => (
    <button className="text-blue-600 hover:text-blue-900" type="button" onClick={() => navigate(`/tasks/${task.id}/locate`)}>
      定位
    </button>
  );

  const renderTaskName = (task: BridgeTask) => (
    <div className="flex items-start justify-between gap-2">
      <span className="truncate">{task.name}</span>
      <button
        className="text-xs text-gray-400 hover:text-gray-600 border border-gray-300 rounded px-1"
        type="button"
        onClick={() => setInfoTask(task)}
      >
        i
      </button>
    </div>
  );

  const renderView = (task: BridgeTask) => (
    <button className="text-blue-600 hover:text-blue-900" type="button" onClick={() => navigate(`/tasks/${task.id}/locate?mode=edit`)}>
      查看
    </button>
  );

  const renderDelete = (task: BridgeTask) => (
    <button className="text-red-600 hover:text-red-800" type="button" onClick={() => deleteTask(task)}>
      删除
    </button>
  );

  const columns = (() => {
    const cols: Array<{ key: string; label: string; render: (task: BridgeTask) => React.ReactNode }> = [];
    const addDelete = () => {
      if (canDeleteTask) {
        cols.push({ key: 'delete', label: '删除', render: renderDelete });
      }
    };
    const renderAssignee = (t: BridgeTask) => getAssigneeDisplay(t);
    if (activeTab === '待处理') {
      cols.push(
        { key: 'name', label: '子任务名称', render: renderTaskName },
        { key: 'receive', label: '任务接收', render: t => (
          <button className="text-sm text-blue-600 hover:text-blue-800" onClick={() => assignAndStart(t)}>接收</button>
        ) },
        { key: 'priority', label: '优先级', render: renderPriority },
        { key: 'length', label: '长度/宽度(m)', render: t => getBridgeLengthWidth(t) },
        { key: 'locate', label: '定位', render: renderLocate }
      );
      addDelete();
      return cols;
    }
    if (activeTab === '处理中' || activeTab === '需修改') {
      cols.push(
        { key: 'name', label: '子任务名称', render: renderTaskName },
        { key: 'assignee', label: '执行人', render: renderAssignee },
        { key: 'priority', label: '优先级', render: renderPriority },
        { key: 'length', label: '长度/宽度(m)', render: t => getBridgeLengthWidth(t) },
        { key: 'edit', label: '编辑', render: t => {
          const canEdit = t.assigneeId === userId;
          return (
            <button
              className={canEdit ? 'text-blue-600 hover:text-blue-900' : 'text-gray-400 cursor-not-allowed'}
              type="button"
              disabled={!canEdit}
              onClick={() => navigate(`/tasks/${t.id}/locate?mode=edit`)}
            >
              编辑
            </button>
          );
        } },
        { key: 'submit', label: '提交', render: t => {
          const canSubmit = t.assigneeId === userId;
          return (
            <button
              className={canSubmit ? 'text-indigo-600 hover:text-indigo-800' : 'text-gray-400 cursor-not-allowed'}
              type="button"
              disabled={!canSubmit}
              onClick={() => changeWorkflow(t.id, '待初检')}
            >
              提交
            </button>
          );
        } },
        { key: 'locate', label: '定位', render: renderLocate }
      );
      addDelete();
      return cols;
    }
    if (activeTab === '待初检') {
      cols.push(
        { key: 'name', label: '子任务名称', render: renderTaskName },
        { key: 'assignee', label: '执行人', render: renderAssignee },
        { key: 'priority', label: '优先级', render: renderPriority },
        { key: 'length', label: '长度/宽度(m)', render: t => getBridgeLengthWidth(t) },
        { key: 'withdraw', label: '撤回', render: t => {
          const canWithdraw = t.assigneeId === userId;
          return (
            <button
              className={canWithdraw ? 'text-blue-600 hover:text-blue-900' : 'text-gray-400 cursor-not-allowed'}
              type="button"
              disabled={!canWithdraw}
              onClick={() => changeWorkflow(t.id, '处理中')}
            >
              撤回
            </button>
          );
        } },
        {
          key: 'qa',
          label: '通过/不通过',
          render: t => {
            const isLocalUnsynced = t.source === 'local' && !t.tmsSynced;
            if (!canQualityCheck) return '-';
            if (isLocalUnsynced) {
              return (
                <span className="text-xs text-amber-600" title="本地项目需提交 TMS 后由质检人员完成">
                  需提交TMS
                </span>
              );
            }
            return (
              <div className="space-x-3">
                <button className="text-green-700 hover:text-green-900" type="button" onClick={() => updateWorkflow(t.id, '待写回')}>
                  通过
                </button>
                <button className="text-red-600 hover:text-red-800" type="button" onClick={() => updateWorkflow(t.id, '需修改')}>
                  不通过
                </button>
              </div>
            );
          }
        },
        { key: 'view', label: '查看', render: renderView },
        { key: 'locate', label: '定位', render: renderLocate }
      );
      addDelete();
      return cols;
    }
    if (activeTab === '待写回') {
      cols.push(
        { key: 'name', label: '子任务名称', render: renderTaskName },
        { key: 'assignee', label: '执行人', render: renderAssignee },
        { key: 'priority', label: '优先级', render: renderPriority },
        { key: 'length', label: '长度/宽度(m)', render: t => getBridgeLengthWidth(t) },
        { key: 'writeback', label: '写回', render: t => {
          const isLocalUnsynced = t.source === 'local' && !t.tmsSynced;
          if (isLocalUnsynced) {
            return (
              <span className="text-xs text-amber-600" title="本地项目需提交 TMS 后完成">
                需提交TMS
              </span>
            );
          }
          return (
            <button className="text-indigo-600 hover:text-indigo-800" type="button" onClick={() => updateWorkflow(t.id, '完成')}>
              写回
            </button>
          );
        } },
        { key: 'view', label: '查看', render: renderView },
        { key: 'locate', label: '定位', render: renderLocate }
      );
      addDelete();
      return cols;
    }
    if (activeTab === '完成') {
      cols.push(
        { key: 'name', label: '子任务名称', render: renderTaskName },
        { key: 'assignee', label: '执行人', render: renderAssignee },
        { key: 'priority', label: '优先级', render: renderPriority },
        { key: 'length', label: '长度/宽度(m)', render: t => getBridgeLengthWidth(t) },
        { key: 'view', label: '查看', render: renderView },
        { key: 'locate', label: '定位', render: renderLocate }
      );
      addDelete();
      return cols;
    }
    if (activeTab === '已锁定') {
      cols.push(
        { key: 'name', label: '子任务名称', render: renderTaskName },
        { key: 'priority', label: '优先级', render: renderPriority },
        { key: 'length', label: '长度/宽度(m)', render: t => getBridgeLengthWidth(t) },
        { key: 'locate', label: '定位', render: renderLocate }
      );
      addDelete();
      return cols;
    }
    cols.push(
      { key: 'name', label: '子任务名称', render: renderTaskName },
      { key: 'assignee', label: '执行人', render: renderAssignee },
      {
        key: 'status',
        label: '任务状态',
        render: t => {
          const current = getWorkflowStatusForTask(t);
          const label = getWorkflowStatusLabel(current);
          if (!canDeleteTask) return label;
          return (
            <select
              className="border rounded px-2 py-1 text-sm"
              value={current || ''}
              onChange={e => {
                const next = e.target.value;
                if (next) updateWorkflow(t.id, next);
              }}
            >
              {['待处理', '已锁定', '处理中', '待初检', '需修改', '待写回', '完成'].map(v => (
                <option key={v} value={v}>{getWorkflowStatusLabel(v)}</option>
              ))}
            </select>
          );
        }
      },
      { key: 'priority', label: '优先级', render: renderPriority },
      { key: 'length', label: '长度/宽度(m)', render: t => getBridgeLengthWidth(t) },
      { key: 'locate', label: '定位', render: renderLocate }
    );
    addDelete();
    return cols;
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {taskBreadcrumb.length > 0 ? (
          <div className="flex flex-wrap items-center text-2xl font-bold text-gray-900">
            {taskBreadcrumb.map((t, index) => {
              const isTop = index === 0;
              const isLast = index === taskBreadcrumb.length - 1;
              const canClick = isTop || !isLast;
              const label = t.name || t.id;
              const handleClick = () => {
                if (isTop) {
                  navigate('/projects');
                } else if (!isLast) {
                  navigate(`/projects/${t.id}/workflow`);
                }
              };
              return (
                <span key={t.id} className="flex items-center">
                  <button
                    type="button"
                    onClick={handleClick}
                    disabled={!canClick}
                    className={canClick ? 'text-blue-600 hover:text-blue-800' : 'text-gray-900'}
                  >
                    {label}
                  </button>
                  {!isLast && <span className="mx-2 text-gray-400">/</span>}
                </span>
              );
            })}
          </div>
        ) : (
          <h1 className="text-2xl font-bold text-gray-900">DOM桥梁去除流程</h1>
        )}
        <button className="text-sm text-blue-600 hover:text-blue-800" onClick={() => loadUnits().catch((e) => logger.error('loadUnits', e))}>
          刷新
        </button>
      </div>

      {loadError && (
        <div className="px-4 py-3 rounded border bg-red-50 text-red-800 text-sm">
          {loadError}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {WORKFLOW_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => {
                userSelectedTabRef.current = true;
                setActiveTab(t.key);
              }}
              className={`px-3 py-1 rounded text-sm border ${activeTab === t.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
            >
              {t.label}({tabCounts[t.key] || 0})
            </button>
          ))}
        </div>
        {['处理中', '待初检', '待写回', '需修改', '完成'].includes(activeTab) && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showOnlyMineTasks}
              onChange={e => {
                showOnlyMineTouchedRef.current = true;
                setShowOnlyMineTasks(e.target.checked);
              }}
            />
            仅看自已的任务
          </label>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded border bg-blue-50 px-3 py-2">
          <div className="text-sm font-medium text-blue-800">批任务生成组</div>
          {((activeTab === '待处理' && canDeleteTask) || activeTab === '处理中') && (
            <>
              <label className="flex items-center gap-1 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableShadow}
                  onChange={(e) => setEnableShadow(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                阴影识别
              </label>
              <button
                className="px-3 py-1 text-sm border rounded bg-blue-600 text-white border-blue-600 disabled:opacity-50"
                disabled={batchMaskGenerating}
                onClick={runBatchMaskGenerate}
              >
                {batchMaskGenerating ? '批生成中...' : '掩膜批生成'}
              </button>
            </>
          )}
          {canDeleteTask && (
            <button
              className="px-3 py-1 text-sm border rounded bg-red-600 text-white border-red-600"
              onClick={batchDelete}
            >
              批量删除
            </button>
          )}
          {activeTab === '待处理' && (
            <button
              className="px-3 py-1 text-sm border rounded bg-indigo-600 text-white border-indigo-600"
              onClick={batchReceive}
            >
              批量接收
            </button>
          )}
          <div className="text-xs text-gray-600">已选 {selectedIds.length} 个子任务</div>
          {batchMaskMessage && <div className="text-xs text-gray-600">{batchMaskMessage}</div>}
          {batchMaskError && <div className="text-xs text-red-600">{batchMaskError}</div>}
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-10 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  aria-label="选择当前页"
                  checked={isPageAllSelected}
                  onChange={toggleSelectAll}
                />
              </th>
              {columns.map(col => {
                const headerClassName = col.key === 'name'
                  ? 'px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40'
                  : 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider';
                return (
                  <th key={col.key} className={headerClassName}>
                    {col.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {pageItems.map(t => (
              <tr
                key={t.id}
                ref={el => { rowRefs.current[t.id] = el; }}
                className={focusTaskId === t.id ? 'bg-yellow-50' : ''}
              >
                <td className="w-10 px-2 py-4 whitespace-nowrap text-sm">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(t.id)}
                    onChange={() => toggleSelectTask(t.id)}
                  />
                </td>
                {columns.map(col => {
                  const cellClassName = col.key === 'name'
                    ? 'px-3 py-4 whitespace-nowrap text-sm text-gray-600'
                    : 'px-6 py-4 whitespace-nowrap text-sm text-gray-600';
                  return (
                    <td key={col.key} className={cellClassName}>
                      {col.render(t)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-6 py-10 text-center text-sm text-gray-500">
                  当前状态暂无任务
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          共 {filtered.length} 条，{safePage}/{totalPages} 页
        </div>
        <div className="space-x-2">
          <button
            className="px-3 py-1 text-sm border rounded disabled:opacity-50"
            disabled={safePage <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <button
            className="px-3 py-1 text-sm border rounded disabled:opacity-50"
            disabled={safePage >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >
            下一页
          </button>
        </div>
      </div>

      {infoTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setInfoTask(null)}>
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">任务详情</h2>
              <button onClick={() => setInfoTask(null)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="space-y-2 text-sm">
              <div><span className="text-gray-500">ID：</span>{infoTask.id}</div>
              <div><span className="text-gray-500">名称：</span>{infoTask.name}</div>
              <div><span className="text-gray-500">类型：</span>{infoTask.type}</div>
              <div><span className="text-gray-500">状态：</span>{infoTask.status}</div>
              <div><span className="text-gray-500">优先级：</span>{infoTask.priority}</div>
              <div><span className="text-gray-500">工作流状态：</span>{getWorkflowStatusForTask(infoTask) || '-'}</div>
              {infoTask.inputParams && (
                <div>
                  <span className="text-gray-500">输入参数：</span>
                  <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto max-h-64 mt-1">{JSON.stringify(parseJson(infoTask.inputParams), null, 2)}</pre>
                </div>
              )}
              {infoTask.outputResults && (
                <div>
                  <span className="text-gray-500">输出结果：</span>
                  <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto max-h-64 mt-1">{typeof infoTask.outputResults === 'string' ? JSON.stringify(parseJson(infoTask.outputResults), null, 2) : JSON.stringify(infoTask.outputResults, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title ?? ''}
        message={confirmState?.message ?? ''}
        variant={confirmState?.variant ?? 'primary'}
        confirmLabel="确认"
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
};
