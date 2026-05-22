import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { BridgeTask, BridgeUser } from '../../types';
import { bridgeTaskService, bridgeProjectService, bridgeSystemService } from '../../services/bridgeService';
import { bridgeUserService } from '../../services/bridgeService';
import { useAuth } from '../../context/AuthContext';
import { BridgeProjectParamsModal } from './BridgeProjectParamsModal';
import { parseJson } from '../../utils/json';
import { getTaskFailureMessage } from '../../utils/taskHelpers';
import { BRIDGE_APP_EXTERNAL_SYSTEM, BRIDGE_PROJECT_TYPES, parseFeedbackItems } from './projects/types';
import type { DecomposeOrderStrategy, DecomposeOverwriteStrategy, DecomposeMaskGenerateStrategy, FeedbackItem } from './projects/types';
import { logger } from '../../utils/logger';
import { toast } from '../common/Toast';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ServerFileBrowser } from '../common/ServerFileBrowser';

export const BridgeProjects: React.FC = () => {
  const { user } = useAuth();
  const permissions = useMemo(() => (user?.permissions as string[]) || [], [user?.permissions]);
  const canReadGlobalProjects = permissions.includes('project:read_global') || permissions.includes('project:read');
  const canReadDepartmentProjects = permissions.includes('project:read_department') || permissions.includes('project:read_global') || permissions.includes('project:read');
  const canReadOwnProjects = permissions.includes('project:read_own') || permissions.includes('project:read_department') || permissions.includes('project:read_global') || permissions.includes('project:read');
  const canReadParticipantProjects = permissions.includes('project:read_participant') || permissions.includes('project:read_own') || permissions.includes('project:read_department') || permissions.includes('project:read_global') || permissions.includes('project:read');
  const canDeleteProject = permissions.includes('project:delete_global') || permissions.includes('project:delete_department') || permissions.includes('project:delete');
  const canCreateProject = permissions.includes('project:create');
  const canReadUsers = permissions.includes('user:read');
  const canEditProject = permissions.includes('project:update_global') || permissions.includes('project:update_department') || permissions.includes('project:update_own') || permissions.includes('project:update');
  const userId = user?.userId;
  const userName = user?.username;
  const userDepartmentId = user?.departmentId || undefined;
  const shouldTrustParticipantProjectScope = canReadParticipantProjects
    && !canReadGlobalProjects
    && !canReadDepartmentProjects
    && !canReadOwnProjects;

  const [shpFileBrowserOpen, setShpFileBrowserOpen] = useState(false);
  const [domDirBrowserOpen, setDomDirBrowserOpen] = useState(false);

  const [projects, setProjects] = useState<BridgeTask[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<{ id: string; externalTaskId: string } | null>(null);
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [editingProject, setEditingProject] = useState<BridgeTask | null>(null);
  const [infoProject, setInfoProject] = useState<BridgeTask | null>(null);
  const [name, setName] = useState('');
  const [departments, setDepartments] = useState<Array<{ id: string; departmentName: string }>>([]);
  const [userNameById, setUserNameById] = useState<Record<string, string>>({});
  const [userOptions, setUserOptions] = useState<BridgeUser[]>([]);
  const [shpFilePath, setShpFilePath] = useState('');
  const [domDir, setDomDir] = useState('');
  const [decomposeProjectId, setDecomposeProjectId] = useState<string | null>(null);
  const [isDecomposeModalOpen, setIsDecomposeModalOpen] = useState(false);
  const [decomposeOrderStrategy, setDecomposeOrderStrategy] = useState<DecomposeOrderStrategy>('ASC');
  const [decomposeOverwriteStrategy, setDecomposeOverwriteStrategy] = useState<DecomposeOverwriteStrategy>('SKIP');
  const [decomposeMaskGenerate, setDecomposeMaskGenerate] = useState<DecomposeMaskGenerateStrategy>('AUTO');
  const [isDecomposeProgressOpen, setIsDecomposeProgressOpen] = useState(false);
  const [decomposeProgressProjectId, setDecomposeProgressProjectId] = useState<string | null>(null);
  const [decomposeProgressTaskId, setDecomposeProgressTaskId] = useState<string | null>(null);
  const [decomposeProgressTask, setDecomposeProgressTask] = useState<BridgeTask | null>(null);
  const [decomposeProgressLogs, setDecomposeProgressLogs] = useState<FeedbackItem[]>([]);
  const [decomposeProgressError, setDecomposeProgressError] = useState<string | null>(null);
  const [decomposeSubtaskCount, setDecomposeSubtaskCount] = useState(0);
  const [isDecomposeDone, setIsDecomposeDone] = useState(false);
  const [participantProject, setParticipantProject] = useState<BridgeTask | null>(null);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [participantSaving, setParticipantSaving] = useState(false);
  const [isDecomposeStarting, setIsDecomposeStarting] = useState(false);
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; variant: 'danger' | 'primary'; onConfirm: () => void } | null>(null);
  const decomposePollTickRef = useRef(0);

  const loadProjects = useCallback(async () => {
    const [scopedData, externalData] = await Promise.all([
      bridgeProjectService.list({
        size: 500,
        sort: 'createdAt,desc',
        category: 'PROJECT',
      }),
      bridgeProjectService.list({
        size: 500,
        sort: 'createdAt,desc',
        category: 'PROJECT',
        externalSystem: BRIDGE_APP_EXTERNAL_SYSTEM
      })
    ]);
    const extractTasks = (data: unknown): BridgeTask[] => {
      if (Array.isArray(data)) return data;
      if (data && typeof data === 'object' && 'content' in data && Array.isArray((data as { content: unknown }).content)) {
        return (data as { content: BridgeTask[] }).content;
      }
      return [];
    };
    const scopedTasks: BridgeTask[] = extractTasks(scopedData);
    const externalTasks: BridgeTask[] = extractTasks(externalData);
    const merged = new Map<string, BridgeTask>();
    for (const t of scopedTasks) {
      if (t?.id) merged.set(t.id, t);
    }
    for (const t of externalTasks) {
      if (t?.id) merged.set(t.id, t);
    }
    const items = Array.from(merged.values())
      .filter(t => t.category === 'PROJECT' && BRIDGE_PROJECT_TYPES.has(t.type))
      .filter(project => {
        if (canReadGlobalProjects) return true;
        if (canReadDepartmentProjects && userDepartmentId) {
          if (project.departmentId === userDepartmentId || project.createdDepartmentId === userDepartmentId) return true;
        }
        if (canReadOwnProjects) {
          if (userId && (project.projectLeaderId === userId || project.assigneeId === userId)) return true;
          if (userName && project.createdByName === userName) return true;
          if (userId && project.createdByName === userId) return true;
        }
        if (canReadParticipantProjects && userId) {
          if (!Array.isArray(project.operatorIds)) {
            if (shouldTrustParticipantProjectScope) return true;
          } else if (project.operatorIds.includes(userId)) {
            return true;
          }
        }
        return false;
      });
    setProjects(items);
    return items;
  }, [
    canReadDepartmentProjects,
    canReadGlobalProjects,
    canReadOwnProjects,
    canReadParticipantProjects,
    shouldTrustParticipantProjectScope,
    userDepartmentId,
    userId,
    userName
  ]);

  useEffect(() => {
    if (!isDecomposeProgressOpen || !decomposeProgressTaskId) return;
    let disposed = false;
    let timer: number | null = null;
    decomposePollTickRef.current = 0;
    const projectId = decomposeProgressProjectId;
    const taskId = decomposeProgressTaskId;

    const stop = () => {
      disposed = true;
      if (timer != null) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    const poll = async () => {
      if (disposed) return;
      try {
        const BridgeTask = await bridgeTaskService.getTask(taskId) as BridgeTask;
        if (disposed) return;
        setDecomposeProgressTask(BridgeTask);

        const input = parseJson(BridgeTask?.inputParams);
        const feedback = parseFeedbackItems(input);
        setDecomposeProgressLogs(feedback);

        decomposePollTickRef.current += 1;
        if (decomposePollTickRef.current % 2 === 0) {
          if (projectId) {
            const subtasks = await bridgeProjectService.getSubTasks(projectId);
            if (!disposed) setDecomposeSubtaskCount(Array.isArray(subtasks) ? subtasks.length : 0);
          }
        }

        if (BridgeTask?.status === 'FAILED') {
          setDecomposeProgressError(getTaskFailureMessage(BridgeTask));
          setIsDecomposeDone(true);
          stop();
          return;
        }
        if (BridgeTask?.status === 'COMPLETED') {
          setIsDecomposeDone(true);
          stop();
          await loadProjects();
        }
      } catch (err) {
        if (disposed) return;
        const axiosErr = err as { response?: { status?: number } } | null;
        if (axiosErr?.response?.status === 404) {
          return;
        }
        logger.error('pollDecomposeProgress', err);
        setDecomposeProgressError(getErrorMessage(err, '获取分解进度失败'));
        setIsDecomposeDone(true);
        stop();
      }
    };

    poll().catch(() => {});
    timer = window.setInterval(() => { poll().catch(() => {}); }, 1000);
    return () => {
      disposed = true;
      if (timer != null) window.clearInterval(timer);
    };
  }, [isDecomposeProgressOpen, decomposeProgressProjectId, decomposeProgressTaskId, loadProjects]);

  useEffect(() => {
    loadProjects().catch((e) => logger.error('loadProjects', e));
  }, [loadProjects]);

  useEffect(() => {
    bridgeSystemService.getSystemStatus().then(s => {
      setIsLocalMode(s.localMode);
    });
  }, []);

  useEffect(() => {
    bridgeUserService.getDepartments().then(setDepartments).catch(() => {});
  }, []);

  useEffect(() => {
    if (!canReadUsers) {
      setUserNameById({});
      setUserOptions([]);
      return;
    }
    bridgeUserService.getUsers().then(users => {
      const map: Record<string, string> = {};
      users.forEach((u: BridgeUser) => {
        if (u?.userId) {
          map[u.userId] = u.username;
        }
      });
      setUserNameById(map);
      setUserOptions(users);
    }).catch(() => {});
  }, [canReadUsers]);

  useEffect(() => {
    if (!isCreating) return;
    setCreateError(null);
    setCreateSuccess(null);
    bridgeUserService.getDepartments().then(setDepartments).catch(() => {});
  }, [isCreating]);

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (err instanceof Error && err.message) return err.message;
    const error = err as { response?: { status?: number; data?: { message?: string } } };
    const status = error?.response?.status;
    const data = (error as { response?: { data?: unknown } })?.response?.data;
    const message = (data as { message?: unknown })?.message;
    const errorCode = (data as { error?: unknown })?.error;
    if (status === 403) return (typeof message === 'string' && message) ? message : '无权限执行该操作';
    if (typeof message === 'string' && message) return message;
    if (typeof errorCode === 'string' && errorCode) return errorCode;
    if (data != null) {
      try {
        const s = JSON.stringify(data);
        if (s && s !== '{}' && s !== '""') return s;
      } catch {
        return fallback;
      }
    }
    return fallback;
  };

  const openDecomposeModal = (project: BridgeTask) => {
    const input = parseJson(project.inputParams);
    const order = typeof input['decompose_order_strategy'] === 'string' ? String(input['decompose_order_strategy']).toUpperCase() : '';
    const overwrite = typeof input['decompose_overwrite_strategy'] === 'string' ? String(input['decompose_overwrite_strategy']).toUpperCase() : '';
    const maskGen = typeof input['decompose_mask_generate'] === 'string' ? String(input['decompose_mask_generate']).toUpperCase() : '';
    setDecomposeOrderStrategy(order === 'DESC' ? 'DESC' : 'ASC');
    setDecomposeOverwriteStrategy(overwrite === 'OVERWRITE' ? 'OVERWRITE' : overwrite === 'OVERWRITE_PENDING' ? 'OVERWRITE_PENDING' : 'SKIP');
    setDecomposeMaskGenerate(maskGen === 'SKIP' ? 'SKIP' : 'AUTO');
    setDecomposeProjectId(project.id);
    setIsDecomposeModalOpen(true);
  };

  const confirmDecompose = async () => {
    if (!decomposeProjectId) return;
    if (isDecomposeStarting) return;
    const projectId = decomposeProjectId;
    setIsDecomposeStarting(true);
    
    try {
      const project = await bridgeTaskService.getTask(projectId);
      const input = parseJson(project?.inputParams);
      input['decompose_order_strategy'] = decomposeOrderStrategy;
      input['decompose_overwrite_strategy'] = decomposeOverwriteStrategy;
      input['decompose_mask_generate'] = decomposeMaskGenerate;
      await bridgeTaskService.updateTask(projectId, { inputParams: JSON.stringify(input) });

      const decomposeInput = {
        ...input,
        decompose_task: true,
        project_id: projectId
      };
      const decomposeTaskName = `${project?.name || '项目'}-分解`;
      const decomposeTask = await bridgeProjectService.create({
        name: decomposeTaskName,
        category: 'SYSTEM_TASK',
        type: 'BRIDGE_REMOVAL_BATCH',
        status: 'PENDING',
        priority: 1,
        createdByName: user?.username || user?.userId || undefined,
        parentTaskId: projectId,
        inputParams: JSON.stringify(decomposeInput)
      });

      await bridgeTaskService.executeTask(decomposeTask.id);
      
      setIsDecomposeModalOpen(false);
      setIsDecomposeProgressOpen(true);
      setDecomposeProgressProjectId(projectId);
      setDecomposeProgressTaskId(decomposeTask.id);
      setDecomposeProgressError(null);
      setIsDecomposeDone(false);
      setDecomposeSubtaskCount(0);
      setDecomposeProgressTask(null);
      setDecomposeProgressLogs([]);

      await loadProjects();
    } catch (err) {
      logger.error('confirmDecompose', err);
      toast.error(getErrorMessage(err, '启动分解任务失败'));
    } finally {
      setIsDecomposeStarting(false);
      if (!isDecomposeProgressOpen) {
         // Only clear if we didn't open the progress modal (meaning we failed or logic changed)
         // But here we rely on isDecomposeModalOpen being false to close the modal.
         // If we failed, we might want to keep the modal open? 
         // In catch block we alerted.
         // If success, we closed modal and opened progress.
      }
    }
  };

  const openParticipantModal = (project: BridgeTask) => {
    setParticipantProject(project);
    setParticipantIds(project.operatorIds || []);
  };

  const saveParticipants = async () => {
    if (!participantProject) return;
    if (participantSaving) return;
    setParticipantSaving(true);
    try {
      await bridgeTaskService.updateTask(participantProject.id, { operatorIds: participantIds });
      setParticipantProject(null);
      await loadProjects();
    } catch (err) {
      logger.error('saveParticipants', err);
      toast.error(getErrorMessage(err, '保存参与人员失败'));
    } finally {
      setParticipantSaving(false);
    }
  };

  const toggleParticipantId = (id: string) => {
    setParticipantIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
  };

  const handleCreate = async (executeAfterCreate: boolean) => {
    if (createSubmitting) return;
    setCreateError(null);
    if (!name.trim()) {
      setCreateError('请输入项目名称');
      toast.warning('请输入项目名称');
      return;
    }
    if (!shpFilePath.trim()) {
      setCreateError('请输入桥梁矢量文件（SHP）路径，或使用“选择文件”按钮');
      toast.warning('请输入桥梁矢量文件（SHP）路径');
      return;
    }
    if (!shpFilePath.toLowerCase().endsWith('.shp')) {
      setCreateError('桥梁矢量文件（SHP）路径必须以 .shp 结尾');
      toast.warning('桥梁矢量文件（SHP）路径必须以 .shp 结尾');
      return;
    }
    if (!domDir.trim()) {
      setCreateError('请输入DOM目录路径');
      toast.warning('请输入DOM目录路径');
      return;
    }

    const inputParams = {
      shp_file_path: shpFilePath.trim(),
      dom_dir: domDir.trim()
    };

    const externalTaskId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `bridge-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setCreateSubmitting(true);
    try {
      const created = await bridgeProjectService.create({
        name: name.trim(),
        category: 'PROJECT',
        type: 'BRIDGE_REMOVAL_BATCH',
        status: 'PENDING',
        priority: 1,
        externalSystem: BRIDGE_APP_EXTERNAL_SYSTEM,
        externalTaskId,
        departmentId: user?.departmentId || null,
        createdByName: user?.username || null,
        createdDepartmentId: user?.departmentId || null,
        createdDepartmentName: user?.departmentName || null,
        project_leader_id: user?.userId || null,
        input_params: JSON.stringify(inputParams)
      });

      const createdId = (created as BridgeTask | null)?.id;
      if (!createdId) {
        setCreateError('创建接口未返回项目ID（请检查后端返回字段）');
        return;
      }
      setCreateSuccess({ id: createdId, externalTaskId });

      let confirmed: BridgeTask | null = null;
      try {
        confirmed = await bridgeTaskService.getTask(createdId) as BridgeTask;
      } catch {
        confirmed = null;
        setCreateError(`项目已创建（ID=${createdId}），但回查失败；请检查权限/服务连接，然后用“打开流程”验证。`);
      }
      if (confirmed && confirmed.id) {
        setProjects(prev => {
          const existing = new Set(prev.map(p => p.id));
          const next: BridgeTask[] = [];
          if (!existing.has(confirmed!.id)) next.push(confirmed!);
          for (const p of prev) next.push(p);
          return next;
        });
      }

      const items = await loadProjects();
      if (!items.some(p => p.id === createdId)) {
        setCreateError(`项目创建已返回ID=${createdId}，但未出现在项目列表中（可能是 externalSystem/type/category 不符合过滤条件，或当前账号读取范围不足）。可点击“打开流程”确认是否真实存在。`);
        return;
      }

      setIsCreating(false);
      setName('');
      setShpFilePath('');
      setDomDir('');
      setCreateSuccess(null);

      if (executeAfterCreate && createdId) {
        openDecomposeModal(confirmed || (created as BridgeTask));
      }
    } catch (err) {
      logger.error('createProject', err);
      setCreateError(getErrorMessage(err, '创建失败'));
    } finally {
      setCreateSubmitting(false);
    }
  };

  const rows = useMemo(() => {
    return projects.map(p => {
      const input = parseJson(p.inputParams);
      const vector = typeof input['shp_file_path'] === 'string' ? (input['shp_file_path'] as string) : '';
      const domDir = typeof input['dom_dir'] === 'string' ? (input['dom_dir'] as string) : '';
      const domCount = typeof input['dom_count'] === 'number'
        ? (input['dom_count'] as number)
        : (Array.isArray(input['source_doms']) ? (input['source_doms'] as unknown[]).length : 0);
      const bridgeCount = typeof input['bridge_count'] === 'number'
        ? (input['bridge_count'] as number)
        : 0;
      return { project: p, vector, domCount, domDir, bridgeCount };
    });
  }, [projects]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">项目清单</h1>
        <div className="space-x-2">
          <button className="px-3 py-2 text-sm border rounded" onClick={() => loadProjects().catch((e) => logger.error('loadProjects', e))}>
            刷新
          </button>
          {canCreateProject && (
            <button className="px-3 py-2 text-sm bg-blue-600 text-white rounded" onClick={() => setIsCreating(true)}>
              新建项目
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">项目</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">创建信息</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">负责信息</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">矢量</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DOM 数量</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.map(r => (
              <tr key={r.project.id}>
                <td className="px-6 py-4 text-sm font-medium text-gray-900 whitespace-normal break-words">
                  <button
                    className="text-blue-600 hover:text-blue-800 text-left"
                    onClick={() => setInfoProject(r.project)}
                  >
                    {r.project.name}
                  </button>
                  {r.project.source === 'local' && !r.project.tmsSynced && (
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                      本地
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  <div className="leading-tight">
                    <div>
                      {(departments.find(d => d.id === r.project.createdDepartmentId)?.departmentName
                        || r.project.createdDepartmentName
                        || r.project.createdDepartmentId
                        || '-') as string}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{r.project.createdByName || '-'}</div>
                    {r.project.createdAt && (
                      <div className="text-xs text-gray-400 mt-1">
                        {new Date(r.project.createdAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  <div className="leading-tight">
                    <div>
                      {departments.find(d => d.id === r.project.departmentId)?.departmentName || r.project.departmentId || '-'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <span>{r.project.assigneeId ? (userNameById[r.project.assigneeId] || r.project.assigneeId) : '-'}</span>
                      {canEditProject && (
                        <button
                          className="text-blue-600 hover:text-blue-800 ml-1"
                          title="修改负责人"
                          onClick={() => setEditingProject(r.project)}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 whitespace-normal break-all">
                  {r.bridgeCount > 0 && (
                    <div className="text-xs text-gray-500 mb-1">
                      共 {r.bridgeCount} 座桥梁
                    </div>
                  )}
                  <div>{r.vector || '-'}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  <div className="whitespace-nowrap">{r.domCount} 幅</div>
                  {r.domDir && (
                    <div className="text-xs text-gray-500 mt-1 break-all max-w-xs" title={r.domDir}>
                      {r.domDir}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm space-x-3">
                  <Link className="text-blue-600 hover:text-blue-800" to={`/projects/${r.project.id}/workflow`}>
                    子任务
                  </Link>
                  {canEditProject && (
                    <button
                      className="text-blue-600 hover:text-blue-800"
                      onClick={() => openParticipantModal(r.project)}
                    >
                      人员
                    </button>
                  )}
                  {canEditProject && (
                    <button
                      className="text-blue-600 hover:text-blue-800"
                      onClick={() => setEditingProject(r.project)}
                    >
                      参数
                    </button>
                  )}
                  {canEditProject && (
                    <button
                      className="text-indigo-600 hover:text-indigo-800"
                      onClick={() => openDecomposeModal(r.project)}
                    >
                      分解
                    </button>
                  )}
                  {canDeleteProject && r.project.source === 'local' && !r.project.tmsSynced && (
                    <button
                      className="text-emerald-600 hover:text-emerald-800"
                      onClick={() => {
                        setConfirmState({
                          title: '提交到 TMS',
                          message: `确认将项目「${r.project.name}」提交到任务管理服务？提交后质检环节将由 TMS 管理。`,
                          variant: 'primary',
                          onConfirm: async () => {
                            setConfirmState(null);
                            try {
                              await bridgeProjectService.submitToTms(r.project.id);
                              await loadProjects();
                            } catch (err: unknown) {
                              const msg = err instanceof Error ? err.message : '提交失败';
                              toast.error(`提交到 TMS 失败：${msg}`);
                            }
                          },
                        });
                      }}
                    >
                      提交TMS
                    </button>
                  )}
                  {canDeleteProject && (
                    <button
                      className="text-red-600 hover:text-red-800"
                      onClick={() => {
                        setConfirmState({
                          title: '删除项目',
                          message: `确认删除项目「${r.project.name}」？此操作不可恢复。`,
                          variant: 'danger',
                          onConfirm: async () => {
                            setConfirmState(null);
                            try {
                              await bridgeProjectService.delete(r.project.id);
                              await loadProjects();
                            } catch (err) {
                              logger.error('deleteProject', err);
                              toast.error('删除失败（可能无权限或存在关联任务）');
                            }
                          },
                        });
                      }}
                    >
                      删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">
                  暂无项目
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {participantProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">项目参与人员</h2>
            <div className="mb-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-sm text-gray-500 mb-2 flex items-center gap-1">
                    <X size={14} className="text-gray-400" />
                    待选
                  </div>
                  <div className="border rounded p-2 h-56 overflow-auto space-y-1">
                    {userOptions.filter(u => !participantIds.includes(u.userId)).map(u => (
                      <button
                        key={u.userId}
                        type="button"
                        className="w-full flex items-center justify-between text-sm px-2 py-1 rounded hover:bg-gray-50"
                        onClick={() => toggleParticipantId(u.userId)}
                      >
                        <span className="truncate">{u.username}</span>
                      </button>
                    ))}
                    {userOptions.filter(u => !participantIds.includes(u.userId)).length === 0 && (
                      <div className="text-xs text-gray-400 px-2 py-1">暂无待选</div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-2 flex items-center gap-1">
                    <Check size={14} className="text-green-600" />
                    已选
                  </div>
                  <div className="border rounded p-2 h-56 overflow-auto space-y-1">
                    {userOptions.filter(u => participantIds.includes(u.userId)).map(u => (
                      <button
                        key={u.userId}
                        type="button"
                        className="w-full flex items-center justify-between text-sm px-2 py-1 rounded hover:bg-gray-50"
                        onClick={() => toggleParticipantId(u.userId)}
                      >
                        <span className="truncate">{u.username}</span>
                      </button>
                    ))}
                    {userOptions.filter(u => participantIds.includes(u.userId)).length === 0 && (
                      <div className="text-xs text-gray-400 px-2 py-1">暂无已选</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-2 text-sm border rounded"
                onClick={() => setParticipantProject(null)}
              >
                取消
              </button>
              <button
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded disabled:opacity-50"
                onClick={saveParticipants}
                disabled={participantSaving}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {isCreating && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-xl">
            <h2 className="text-xl font-bold mb-4">新建项目</h2>
            {isLocalMode && (
              <div className="mb-4 px-3 py-2 text-sm border rounded bg-blue-50 text-blue-700">
                TPM服务未连接 — 当前创建的为本地项目，仅在本系统内可见
              </div>
            )}
            {createSuccess && (
              <div className="mb-4 px-3 py-2 text-sm border rounded bg-green-50 text-green-800">
                已收到创建返回：ID={createSuccess.id}
                <div className="mt-2 space-x-3">
                  <Link className="text-blue-700 hover:text-blue-900 underline" to={`/projects/${createSuccess.id}/workflow`}>
                    打开流程
                  </Link>
                  <span className="text-xs text-gray-600">externalTaskId={createSuccess.externalTaskId}</span>
                </div>
              </div>
            )}
            {createError && (
              <div className="mb-4 px-3 py-2 text-sm border rounded bg-red-50 text-red-700">
                {createError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">项目名称</label>
                <input className="w-full border rounded p-2" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">桥梁矢量文件（SHP）路径</label>
                <div className="flex gap-2">
                  <input
                    className="w-full border rounded p-2"
                    value={shpFilePath}
                    onChange={e => setShpFilePath(e.target.value)}
                    placeholder="例如：D:/data/bridges.shp"
                  />
                  <button
                    className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
                    onClick={() => setShpFileBrowserOpen(true)}
                    title="浏览服务器文件系统选择 .shp 文件"
                  >
                    浏览
                  </button>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  输入服务器上的 SHP 文件完整路径，或点击“浏览”从服务器文件系统选择。系统会自动推断同目录同名 .shx/.dbf 并校验。
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">DOM目录</label>
                <div className="flex gap-2">
                  <input
                    className="w-full border rounded p-2"
                    value={domDir}
                    onChange={e => setDomDir(e.target.value)}
                    placeholder="例如：D:/data/dom_tiles"
                  />
                  <button
                    className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
                    onClick={() => setDomDirBrowserOpen(true)}
                    title="浏览服务器文件系统选择 DOM 目录"
                  >
                    浏览
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-2">
              <button className="px-4 py-2 text-gray-600 disabled:opacity-50" disabled={createSubmitting} onClick={() => setIsCreating(false)}>取消</button>
              <button className="px-4 py-2 border rounded disabled:opacity-50" disabled={createSubmitting} onClick={() => { handleCreate(false); }}>
                {createSubmitting ? '创建中...' : '仅创建'}
              </button>
              <button className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50" disabled={createSubmitting} onClick={() => { handleCreate(true); }}>
                {createSubmitting ? '创建中...' : '创建并分解'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingProject && (
        <BridgeProjectParamsModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSaved={() => {
            setEditingProject(null);
            loadProjects().catch((e) => logger.error('loadProjects', e));
          }}
        />
      )}

      {infoProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setInfoProject(null)}>
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">项目信息</h2>
              <button onClick={() => setInfoProject(null)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="space-y-2 text-sm">
              <div><span className="text-gray-500">ID：</span>{infoProject.id}</div>
              <div><span className="text-gray-500">名称：</span>{infoProject.name}</div>
              <div><span className="text-gray-500">类型：</span>{infoProject.type}</div>
              <div><span className="text-gray-500">状态：</span>{infoProject.status}</div>
              {infoProject.inputParams && (
                <div><span className="text-gray-500">输入参数：</span><pre className="bg-gray-50 p-2 rounded text-xs overflow-auto max-h-48 mt-1">{JSON.stringify(typeof infoProject.inputParams === 'string' ? JSON.parse(infoProject.inputParams) : infoProject.inputParams, null, 2)}</pre></div>
              )}
            </div>
          </div>
        </div>
      )}

      {isDecomposeModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">分解任务策略</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">子任务依赖/排序策略</label>
                <select
                  className="w-full border rounded p-2"
                  value={decomposeOrderStrategy}
                  onChange={e => setDecomposeOrderStrategy((e.target.value as DecomposeOrderStrategy) || 'ASC')}
                >
                  <option value="ASC">从小到大</option>
                  <option value="DESC">从大到小</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">覆盖策略</label>
                <select
                  className="w-full border rounded p-2"
                  value={decomposeOverwriteStrategy}
                  onChange={e => setDecomposeOverwriteStrategy((e.target.value as DecomposeOverwriteStrategy) || 'SKIP')}
                >
                  <option value="OVERWRITE">覆盖现有子任务</option>
                  <option value="OVERWRITE_PENDING">仅覆盖待处理子任务</option>
                  <option value="SKIP">跳过现有子任务</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">掩膜生成</label>
                <select
                  className="w-full border rounded p-2"
                  value={decomposeMaskGenerate}
                  onChange={e => setDecomposeMaskGenerate((e.target.value as DecomposeMaskGenerateStrategy) || 'AUTO')}
                >
                  <option value="AUTO">分解后自动生成掩膜</option>
                  <option value="SKIP">跳过掩膜生成</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-2">
              <button
                className="px-4 py-2 text-gray-600 disabled:opacity-50"
                disabled={isDecomposeStarting}
                onClick={() => {
                  setIsDecomposeModalOpen(false);
                  setDecomposeProjectId(null);
                }}
              >
                取消
              </button>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
                disabled={isDecomposeStarting}
                onClick={() => confirmDecompose().catch((e) => logger.error('confirmDecompose', e))}
              >
                {isDecomposeStarting ? '启动中...' : '开始分解'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isDecomposeProgressOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-2xl">
            <h2 className="text-xl font-bold mb-4">分解进度</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm text-gray-700">
                <div>任务状态：{decomposeProgressTask?.status || 'IN_PROGRESS'}</div>
                <div>进度：{typeof decomposeProgressTask?.progress === 'number' ? decomposeProgressTask.progress : 0}%</div>
              </div>
              <div className="w-full bg-gray-200 rounded h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-2"
                  style={{ width: `${Math.min(100, Math.max(0, typeof decomposeProgressTask?.progress === 'number' ? decomposeProgressTask.progress : 0))}%` }}
                />
              </div>
              <div className="text-sm text-gray-700">
                当前：{(decomposeProgressLogs[decomposeProgressLogs.length - 1]?.message || (decomposeProgressError ? '分解失败' : '处理中...'))}
              </div>
              <div className="text-sm text-gray-600">
                子任务数量：{decomposeSubtaskCount}
              </div>
              <div className="border rounded p-3 bg-gray-50 max-h-64 overflow-auto text-sm">
                {(decomposeProgressLogs.length > 0 ? decomposeProgressLogs : [{ message: '等待分解日志...' }]).slice(-200).map((item, idx) => (
                  <div key={`${item.at || ''}-${idx}`} className="py-1 border-b border-gray-200 last:border-b-0">
                    <div className="text-gray-800">{item.message}</div>
                    <div className="text-xs text-gray-500">
                      {item.at ? item.at : ''}{item.by ? `  ${item.by}` : ''}{item.stage ? `  ${item.stage}` : ''}
                    </div>
                  </div>
                ))}
              </div>
              {decomposeProgressError && (
                <div className="text-sm text-red-600">
                  {decomposeProgressError}
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end space-x-2">
              <button
                className="px-4 py-2 border rounded disabled:opacity-50"
                disabled={!isDecomposeDone}
                onClick={() => {
                  setIsDecomposeProgressOpen(false);
                  setDecomposeProgressProjectId(null);
                  setDecomposeProgressTaskId(null);
                  setDecomposeProgressTask(null);
                  setDecomposeProgressLogs([]);
                  setDecomposeProgressError(null);
                  setDecomposeSubtaskCount(0);
                  setIsDecomposeDone(false);
                }}
              >
                关闭
              </button>
              <Link
                className={`px-4 py-2 bg-blue-600 text-white rounded ${isDecomposeDone ? '' : 'opacity-50 pointer-events-none'}`}
                to={decomposeProgressProjectId ? `/projects/${decomposeProgressProjectId}/workflow` : '/projects'}
              >
                打开流程
              </Link>
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

      <ServerFileBrowser
        open={shpFileBrowserOpen}
        onClose={() => setShpFileBrowserOpen(false)}
        onSelect={path => setShpFilePath(path)}
        mode="file"
        fileFilter="shp"
        title="选择 SHP 文件"
      />
      <ServerFileBrowser
        open={domDirBrowserOpen}
        onClose={() => setDomDirBrowserOpen(false)}
        onSelect={path => setDomDir(path)}
        mode="directory"
        title="选择 DOM 目录"
      />
    </div>
  );
};
