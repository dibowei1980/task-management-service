import React, { useEffect, useMemo, useState } from 'react';
import { Task, User } from '../../types';
import { taskService } from '../../services/taskService';
import { userService } from '../../services/userService';
import { TASK_STATUS_LABELS, hasAnyPermission } from '../../utils/constants';
import { ProjectTypeSelect } from '../common/ProjectTypeSelect';
import { TaskTypeSelect } from '../common/TaskTypeSelect';
import { MeasurementUnitSelect } from '../common/MeasurementUnitSelect';
import { useProjectTypeStore } from '../../hooks/useProjectTypeStore';
import { useUserPermissions } from '../../hooks/useUserPermissions';
import { useWeightValidation } from '../../hooks/useWeightValidation';
import { useAuth } from '../../context/AuthContext';

interface Props {
  task: Task;
  onClose: () => void;
  onSaved: () => void;
  hasChildren?: boolean;
}

export const TaskEditModal: React.FC<Props> = ({ task, onClose, onSaved, hasChildren }) => {
  const isProject = task.category === 'PROJECT' || task.category === 'PHASE';
  const [name, setName] = useState(task.name);
  const [priority, setPriority] = useState<number>(task.priority);
  const [assigneeId, setAssigneeId] = useState<string>(task.assigneeId || (task.operatorIds?.[0] || ''));
  const [inspectorIds] = useState<string[]>(task.inspectorIds || []);
  const [plannedDueAt, setPlannedDueAt] = useState<string>(task.plannedDueAt || task.dueAt || '');
  const [saving, setSaving] = useState(false);
  const [leaders, setLeaders] = useState<Array<{id: string, username: string}>>([]);
  const [qaUsers, setQaUsers] = useState<Array<{id: string, username: string}>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; departmentName: string }>>([]);
  const [departmentId, setDepartmentId] = useState<string>(task.departmentId || '');
  const [type, setType] = useState<string>(task.type || '');
  const [workload, setWorkload] = useState<number | ''>(task.workload ?? '');
  const [workloadUnit, setWorkloadUnit] = useState<string>(task.workloadUnit || '');
  const [weight, setWeight] = useState<number | ''>(task.weight ?? '');
  const [progress, setProgress] = useState<number | ''>(task.progress ?? '');
  const [inProgressWeight, setInProgressWeight] = useState<number>(task.inProgressWeight ?? 0.95);
  const [qaDepartmentId, setQaDepartmentId] = useState<string>(task.qaDepartmentId || '');
  const [qaAssigneeId, setQaAssigneeId] = useState<string>(task.qaAssigneeId || '');
  const [parentQaDeptId, setParentQaDeptId] = useState<string>('');
  const { projectTypes, measurementUnits } = useProjectTypeStore();
  const { user } = useAuth();
  const allAuths = [...(user?.roles || []), ...(user?.permissions || [])];
  const canUpdateGlobal = hasAnyPermission(allAuths, 'project:update_global');
  const isController = !!(user?.id && task.controllerId && task.controllerId === user.id);
  const showDeptFields = canUpdateGlobal;
  const effectiveDeptId = canUpdateGlobal ? departmentId : (user?.departmentId || task.departmentId || '');
  const effectiveQaDeptId = (() => {
    const raw = qaDepartmentId === '__inherit__' ? parentQaDeptId : qaDepartmentId;
    return canUpdateGlobal ? raw : (user?.departmentId || raw || '');
  })();

  const { canManage } = useUserPermissions();
  const [dependencies, setDependencies] = useState<{predecessors: Task[], successors: Task[], dependencyDetails: Array<{predecessorId: string, successorId: string, unlockStatus: string, dependencyType: string}>}>({ predecessors: [], successors: [], dependencyDetails: [] });
  const [siblingTasks, setSiblingTasks] = useState<Task[]>([]);
  const [parentCompositionMode, setParentCompositionMode] = useState<'HOMOGENEOUS' | 'HETEROGENEOUS' | null>(null);
  const [newDepTaskId, setNewDepTaskId] = useState<string>('');
  const [newDepUnlockStatus, setNewDepUnlockStatus] = useState<string>('QA_COMPLETED');
  const [depLoading, setDepLoading] = useState(false);

  const UNLOCK_STATUS_OPTIONS = [
    { value: 'IN_PROGRESS', label: '进行中' },
    { value: 'SUBMITTED_FOR_QA', label: '待质检' },
    { value: 'QA_COMPLETED', label: '质检完成' },
    { value: 'COMPLETED', label: '已完成' },
  ];

  useEffect(() => {
    taskService.getTaskDependencies(task.id)
      .then(data => setDependencies(data || {}))
      .catch(console.error);
  }, [task.id]);

  useEffect(() => {
    if (task.parentTaskId) {
      taskService.getSubTasks(task.parentTaskId)
        .then(tasks => setSiblingTasks(tasks.filter(t => t.id !== task.id)))
        .catch(console.error);
      taskService.getTaskById(task.parentTaskId)
        .then(parent => {
          setParentCompositionMode(parent.compositionMode ?? null);
          const pQa = parent.qaDepartmentId || '';
          setParentQaDeptId(pQa);
          if (isProject && pQa && (!task.qaDepartmentId || task.qaDepartmentId === pQa)) {
            setQaDepartmentId('__inherit__');
          }
        })
        .catch(console.error);
    }
  }, [task.parentTaskId, task.id, task.qaDepartmentId, isProject]);

  const handleAddDependency = async () => {
    if (!newDepTaskId) return;
    setDepLoading(true);
    try {
      await taskService.addDependency(task.id, newDepTaskId, canManage ? newDepUnlockStatus : undefined);
      const data = await taskService.getTaskDependencies(task.id);
      setDependencies(data || {});
      setNewDepTaskId('');
    } catch (err) {
      console.error(err);
      alert('添加依赖失败');
    } finally {
      setDepLoading(false);
    }
  };

  const hasExternalSystem = !!task.externalSystem;

  useEffect(() => {
    userService.getDepartments().then((allDepts) => {
      if (canUpdateGlobal) {
        setDepartments(allDepts);
      } else if (user?.departmentId) {
        const ownDept = allDepts.find(d => d.id === user.departmentId);
        setDepartments(ownDept ? [ownDept] : []);
      } else {
        setDepartments([]);
      }
    }).catch(console.error);
  }, [canUpdateGlobal, user?.departmentId]);

  useEffect(() => {
    if (!effectiveDeptId) {
      setLeaders([]);
      setAssigneeId('');
      return;
    }
    userService.getEligibleProjectLeaders(effectiveDeptId, isProject ? 'PROJECT' : 'OPERATION_TASK')
      .then((list: User[]) => {
        setLeaders(list.map(u => ({ id: String(u.id || ''), username: String(u.username || '') })));
      })
      .catch(console.error);
  }, [effectiveDeptId, isProject]);

  useEffect(() => {
    if (!effectiveQaDeptId) { setQaUsers([]); setQaAssigneeId(''); return; }
    userService.getInspectors()
      .then(list => {
        const filtered = list.filter((u: User) => !u.departmentId || u.departmentId === effectiveQaDeptId);
        setQaUsers(filtered.map(u => ({ id: u.id, username: u.username })));
      })
      .catch(console.error);
  }, [effectiveQaDeptId]);

  useEffect(() => {
    taskService.checkEditPermission(task.id)
      .then(result => {
        if (!result.allowed) {
          alert(result.message || '仅创建部门可修改');
          onClose();
        }
      })
      .catch(() => {
        alert('权限校验失败');
        onClose();
      });
  }, [task.id, onClose]);

  const selectedProjectType = useMemo(() => {
    return projectTypes.find((item) => item.code === type) || null;
  }, [projectTypes, type]);

  useEffect(() => {
  }, [selectedProjectType]);

  const weightMismatchWarning = useWeightValidation(parentCompositionMode, siblingTasks, weight);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (workload !== '' && workload <= 0) {
      alert('工作量必须大于 0');
      return;
    }
    if (weightMismatchWarning) {
      const confirmed = window.confirm(
        `⚠️ 权重告警\n\n${weightMismatchWarning}\n\n仍要保存吗？`
      );
      if (!confirmed) return;
    }
    setSaving(true);
    const finalQaDeptId = qaDepartmentId === '__inherit__' ? (parentQaDeptId || null) : (qaDepartmentId || null);
    try {
      await taskService.updateTask(task.id, {
        name,
        type,
        priority,
        operatorIds: assigneeId ? [assigneeId] : [],
        inspectorIds,
        plannedDueAt: plannedDueAt || null,
        departmentId: effectiveDeptId || null,
        workload: workload === '' ? null : workload,
        workloadUnit: workloadUnit || null,
        weight: weight === '' ? null : weight,
        remarks: null,
        progress: hasExternalSystem ? undefined : (progress === '' ? null : progress),
        inProgressWeight,
        qaDepartmentId: canUpdateGlobal ? finalQaDeptId : (user?.departmentId || finalQaDeptId),
        qaAssigneeId: qaAssigneeId || null,
      });
      onSaved();
    } catch (err) {
      console.error(err);
      const error = err as { response?: { status?: number; data?: { message?: string } } };
      if (error?.response?.status === 403) {
        alert(error?.response?.data?.message || '仅创建部门可修改');
      } else {
        alert('保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[640px] max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold">编辑{isProject ? '项目' : '任务'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">{isProject ? '项目' : '任务'}名称</label>
              <input 
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full border rounded p-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{isProject ? '项目' : '任务'}类型</label>
              {isProject ? (
                <ProjectTypeSelect
                  projectTypes={projectTypes}
                  value={type}
                  onChange={(code) => setType(code)}
                  required
                />
              ) : (
                <TaskTypeSelect
                  value={type}
                  onChange={(code) => setType(code)}
                  required
                />
              )}
            </div>
            {(isProject && task.parentTaskId) ? (
              <>
                {showDeptFields && (
                  <div>
                    <label className="block text-sm font-medium mb-1">执行部门</label>
                    <select
                      value={departmentId}
                      onChange={e => { setDepartmentId(e.target.value); setAssigneeId(''); }}
                      className="w-full border rounded p-2"
                      disabled={!isController}
                    >
                      <option value="">-- 可选 --</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.departmentName}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">项目负责人</label>
                  <select
                    value={assigneeId}
                    onChange={e => setAssigneeId(e.target.value)}
                    className="w-full border rounded p-2"
                    disabled={!effectiveDeptId || !isController}
                  >
                    <option value="">{effectiveDeptId ? '-- 未指定 --' : '-- 请先选择部门 --'}</option>
                    {leaders.map(u => (
                      <option key={u.id} value={u.id}>{u.username}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">计划完成时间</label>
                  <input 
                    type="datetime-local"
                    value={plannedDueAt ? plannedDueAt.substring(0, 16) : ''}
                    onChange={e => {
                      const v = e.target.value;
                      setPlannedDueAt(v ? new Date(v).toISOString() : '');
                    }}
                    className="w-full border rounded p-2"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-1">工作量</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={workload}
                      onChange={e => setWorkload(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full border rounded p-2"
                      placeholder="如 12.5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">单位</label>
                    <MeasurementUnitSelect
                      measurementUnits={measurementUnits}
                      value={workloadUnit}
                      onChange={setWorkloadUnit}
                    />
                  </div>
                </div>
                {showDeptFields && (
                  <div>
                    <label className="block text-sm font-medium mb-1">质检部门</label>
                    <select
                      value={qaDepartmentId}
                      onChange={e => { setQaDepartmentId(e.target.value); setQaAssigneeId(''); }}
                      className="w-full border rounded p-2"
                    >
                      <option value="">-- 可选 --</option>
                      {parentQaDeptId && (
                        <option value="__inherit__">继承上级项目 ({departments.find(d => d.id === parentQaDeptId)?.departmentName || parentQaDeptId})</option>
                      )}
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.departmentName}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">质检员</label>
                  <select
                    value={qaAssigneeId}
                    onChange={e => setQaAssigneeId(e.target.value)}
                    className="w-full border rounded p-2"
                    disabled={!effectiveQaDeptId}
                  >
                    <option value="">-- 可选 --</option>
                    {qaUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.username}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">进行中状态权重</label>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={inProgressWeight}
                    onChange={e => setInProgressWeight(parseFloat(e.target.value) || 0.95)}
                    className="w-full border rounded p-2"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">进度公式中 IN_PROGRESS 状态的权重 (0~1)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">优先级</label>
                  <input 
                    type="number"
                    value={priority}
                    onChange={e => setPriority(parseInt(e.target.value || '0', 10))}
                    className="w-full border rounded p-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">在上级项目中的权重</label>
                  <input
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={weight}
                    onChange={e => setWeight(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className={`w-full border rounded p-2 ${weightMismatchWarning ? 'border-amber-400 bg-amber-50' : ''}`}
                    placeholder="0.01 ~ 100，默认 1"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">该子项目在上级项目中的相对权重，用于统计工作量</p>
                  {weightMismatchWarning && (
                    <p className="text-xs text-amber-600 mt-1">⚠ {weightMismatchWarning}</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">优先级</label>
                  <input 
                    type="number"
                    value={priority}
                    onChange={e => setPriority(parseInt(e.target.value || '0', 10))}
                    className="w-full border rounded p-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">权重</label>
                  <input
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={weight}
                    onChange={e => setWeight(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className={`w-full border rounded p-2 ${weightMismatchWarning ? 'border-amber-400 bg-amber-50' : ''}`}
                    placeholder="0.01 ~ 100，默认 1"
                  />
                  {weightMismatchWarning && (
                    <p className="text-xs text-amber-600 mt-1">⚠ {weightMismatchWarning}</p>
                  )}
                </div>
                {showDeptFields && (
                  <div>
                    <label className="block text-sm font-medium mb-1">执行部门</label>
                    <select
                      value={departmentId}
                      onChange={e => { setDepartmentId(e.target.value); setAssigneeId(''); }}
                      className="w-full border rounded p-2"
                      disabled={!isController}
                    >
                      <option value="">-- 可选 --</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.departmentName}</option>
                      ))}
                    </select>
                  </div>
                )}
                {isProject && (
                  <div>
                    <label className="block text-sm font-medium mb-1">项目负责人</label>
                    <select
                      value={assigneeId}
                      onChange={e => setAssigneeId(e.target.value)}
                      className="w-full border rounded p-2"
                      disabled={!effectiveDeptId || !isController}
                    >
                      <option value="">{effectiveDeptId ? '-- 未指定 --' : '-- 请先选择部门 --'}</option>
                      {leaders.map(u => (
                        <option key={u.id} value={u.id}>{u.username}</option>
                      ))}
                    </select>
                  </div>
                )}
                {!isProject && (
                  <div>
                    <label className="block text-sm font-medium mb-1">执行人</label>
                    <select
                      value={assigneeId}
                      onChange={e => setAssigneeId(e.target.value)}
                      className="w-full border rounded p-2"
                      disabled={!effectiveDeptId || !isController}
                    >
                      <option value="">{effectiveDeptId ? '-- 未指定 --' : '-- 请先选择部门 --'}</option>
                      {leaders.map(u => (
                        <option key={u.id} value={u.id}>{u.username}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">计划完成时间</label>
                  <input 
                    type="datetime-local"
                    value={plannedDueAt ? plannedDueAt.substring(0, 16) : ''}
                    onChange={e => {
                      const v = e.target.value;
                      setPlannedDueAt(v ? new Date(v).toISOString() : '');
                    }}
                    className="w-full border rounded p-2"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-1">工作量</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={workload}
                      onChange={e => setWorkload(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full border rounded p-2"
                      placeholder="如 12.5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">单位</label>
                    <MeasurementUnitSelect
                      measurementUnits={measurementUnits}
                      value={workloadUnit}
                      onChange={setWorkloadUnit}
                    />
                  </div>
                </div>
                {!hasExternalSystem && !(isProject && task.parentTaskId) && (
                  <div>
                    <label className="block text-sm font-medium mb-1">进度（%）</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={progress}
                      onChange={e => setProgress(e.target.value === '' ? '' : Math.min(100, Math.max(0, parseInt(e.target.value, 10))))}
                      className="w-full border rounded p-2"
                      placeholder="0 ~ 100"
                      disabled
                    />
                    {!hasChildren && <p className="text-xs text-gray-400 mt-0.5">叶子节点进度由工作量驱动，不可手动编辑</p>}
                    {hasChildren && <p className="text-xs text-gray-400 mt-0.5">非叶子节点进度由子节点推导</p>}
                  </div>
                )}
                {showDeptFields && (
                  <div>
                    <label className="block text-sm font-medium mb-1">质检部门</label>
                    <select
                      value={qaDepartmentId}
                      onChange={e => { setQaDepartmentId(e.target.value); setQaAssigneeId(''); }}
                      className="w-full border rounded p-2"
                    >
                      <option value="">-- 可选 --</option>
                      {parentQaDeptId && (
                        <option value="__inherit__">继承上级项目 ({departments.find(d => d.id === parentQaDeptId)?.departmentName || parentQaDeptId})</option>
                      )}
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.departmentName}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">质检员</label>
                  <select
                    value={qaAssigneeId}
                    onChange={e => setQaAssigneeId(e.target.value)}
                    className="w-full border rounded p-2"
                    disabled={!effectiveQaDeptId}
                  >
                    <option value="">-- 可选 --</option>
                    {qaUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.username}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">IN_PROGRESS 权重</label>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={inProgressWeight}
                    onChange={e => setInProgressWeight(parseFloat(e.target.value) || 0.95)}
                    className="w-full border rounded p-2"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">进度公式中 IN_PROGRESS 状态的权重 (0~1)</p>
                </div>
              </>
            )}
          </div>

          <div className="mt-5 border-t pt-4">
            <h3 className="text-sm font-semibold mb-2">前置依赖</h3>
            {dependencies.predecessors.length > 0 ? (
              <ul className="space-y-1 mb-3">
                {dependencies.predecessors.map((pred) => {
                  const detail = dependencies.dependencyDetails?.find(d => d.predecessorId === pred.id);
                  return (
                    <li key={pred.id} className="flex items-center gap-2 text-sm bg-gray-50 rounded px-2 py-1">
                      <span className="flex-1">{pred.name}</span>
                      {detail?.unlockStatus && (
                        <span className="text-xs text-gray-500">
                          解锁状态: {TASK_STATUS_LABELS[detail.unlockStatus] || detail.unlockStatus}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-gray-400 mb-3">暂无前置依赖</p>
            )}
            {siblingTasks.length > 0 && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">添加前置任务</label>
                  <select
                    value={newDepTaskId}
                    onChange={e => setNewDepTaskId(e.target.value)}
                    className="w-full border rounded p-1.5 text-sm"
                  >
                    <option value="">-- 选择同级任务 --</option>
                    {siblingTasks
                      .filter(t => !dependencies.predecessors.some(p => p.id === t.id))
                      .map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                  </select>
                </div>
                {canManage && newDepTaskId && (
                  <div className="w-36">
                    <label className="block text-xs text-gray-500 mb-1">解锁状态</label>
                    <select
                      value={newDepUnlockStatus}
                      onChange={e => setNewDepUnlockStatus(e.target.value)}
                      className="w-full border rounded p-1.5 text-sm"
                    >
                      {UNLOCK_STATUS_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleAddDependency}
                  disabled={!newDepTaskId || depLoading}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm disabled:opacity-50"
                >
                  {depLoading ? '...' : '添加'}
                </button>
              </div>
            )}
          </div>
          <div className="flex justify-end space-x-2 mt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600">取消</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded">
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
