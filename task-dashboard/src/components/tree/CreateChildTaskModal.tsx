import React, { useEffect, useMemo, useState } from 'react';
import { Task, User } from '../../types';
import { taskService } from '../../services/taskService';
import { userService } from '../../services/userService';
import { useTaskConstraintChecks } from '../../hooks/useTaskConstraintChecks';
import { useProjectTypeStore } from '../../hooks/useProjectTypeStore';
import { TaskTypeSelect } from '../common/TaskTypeSelect';
import { MAX_TREE_DEPTH, TASK_CATEGORY_LABELS, hasAnyPermission } from '../../utils/constants';
import { useAuth } from '../../context/AuthContext';

interface Props {
  parentTask: Task;
  parentDepth: number;
  siblings: Task[];
  childCategory: 'PROJECT' | 'OPERATION_TASK';
  onClose: () => void;
  onSaved: () => void;
}

export const CreateChildTaskModal: React.FC<Props> = ({ parentTask, parentDepth, siblings, childCategory, onClose, onSaved }) => {
  const isSubProject = childCategory === 'PROJECT';

  const defaultType = isSubProject && parentTask.type ? parentTask.type : '';
  const defaultUnit = parentTask.workloadUnit || '';

  const remainingWorkload = useMemo(() => {
    if (!parentTask.workload) return null;
    const siblingsWorkload = siblings
      .reduce((sum, s) => sum + (s.workload ?? 0), 0);
    return Math.max(0, parentTask.workload - siblingsWorkload);
  }, [parentTask.workload, siblings]);

  const [name, setName] = useState('');
  const [type, setType] = useState(defaultType);
  const [workloadUnit, setWorkloadUnit] = useState(defaultUnit);
  const [priority, setPriority] = useState<number>(parentTask.priority || 1);
  const [workload, setWorkload] = useState<number | ''>(remainingWorkload ?? '');
  const [weight] = useState<number | ''>(1);
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [plannedDueAt, setPlannedDueAt] = useState('');
  const [inProgressWeight, setInProgressWeight] = useState<number>(0.95);
  const parentQaDeptId = parentTask.qaDepartmentId || '';
  const [qaDepartmentId, setQaDepartmentId] = useState<string>(isSubProject && parentQaDeptId ? '__inherit__' : '');
  const [qaAssigneeId, setQaAssigneeId] = useState<string>('');
  const [qaUsers, setQaUsers] = useState<Array<{ id: string; username: string }>>([]);
  const [projectDeptId, setProjectDeptId] = useState<string>(parentTask.departmentId || '');
  const [leaders, setLeaders] = useState<Array<{ id: string; username: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Array<{ id: string; departmentName: string }>>([]);

  const { enabledProjectTypes, enabledMeasurementUnits } = useProjectTypeStore();
  const { user } = useAuth();
  const allAuths = [...(user?.roles || []), ...(user?.permissions || [])];
  const canUpdateGlobal = hasAnyPermission(allAuths, 'project:update_global');

  const showDeptFields = canUpdateGlobal;
  const effectiveDeptId = canUpdateGlobal ? projectDeptId : (user?.departmentId || parentTask.departmentId || '');
  const effectiveQaDeptId = (() => {
    if (childCategory === 'OPERATION_TASK') return canUpdateGlobal ? (parentQaDeptId || qaDepartmentId) : (user?.departmentId || parentQaDeptId || '');
    const raw = qaDepartmentId === '__inherit__' ? parentQaDeptId : qaDepartmentId;
    return canUpdateGlobal ? raw : (user?.departmentId || raw || '');
  })();

  const childDepth = parentDepth + 1;
  const depthOk = childDepth < MAX_TREE_DEPTH;

  const candidateWorkload = workload === '' ? null : Number(workload);
  const candidateWeight = weight === '' ? null : Number(weight);

  const { errors, warnings, canSubmit } = useTaskConstraintChecks(
    parentTask,
    siblings,
    type || null,
    candidateWorkload,
    candidateWeight,
    MAX_TREE_DEPTH,
    childDepth,
  );

  const typeValid = type !== '';

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
    if (!effectiveQaDeptId) { setQaUsers([]); setQaAssigneeId(''); return; }
    userService.getInspectors()
      .then(list => {
        const filtered = list.filter((u: { departmentId?: string }) => !u.departmentId || u.departmentId === effectiveQaDeptId);
        setQaUsers(filtered.map(u => ({ id: u.id, username: u.username })));
      })
      .catch(console.error);
  }, [effectiveQaDeptId]);

  useEffect(() => {
    if (!effectiveDeptId) { setLeaders([]); setAssigneeId(''); return; }
    userService.getEligibleProjectLeaders(effectiveDeptId, childCategory)
      .then((list: User[]) => {
        setLeaders(list.map(u => ({ id: String(u.id || ''), username: String(u.username || '') })));
      })
      .catch(console.error);
  }, [effectiveDeptId, childCategory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depthOk) {
      setError(`已达最大层级（${MAX_TREE_DEPTH}层），不可创建子任务`);
      return;
    }
    if (!typeValid) {
      setError(childCategory === 'PROJECT' ? '必须选择项目类型' : '必须指定任务类型');
      return;
    }
    if (!canSubmit) {
      setError(errors.map(e => e.message).join('；'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const projectId = parentTask.category === 'PROJECT' ? parentTask.id : parentTask.projectId;
      const payload: Record<string, unknown> = {
        name,
        type,
        category: childCategory,
        priority: childCategory === 'PROJECT' ? 1 : priority,
        parentTaskId: parentTask.id,
        projectId: projectId || parentTask.projectId || parentTask.id,
        plannedDueAt: plannedDueAt || undefined,
        departmentId: effectiveDeptId || parentTask.departmentId,
        workload: candidateWorkload ?? undefined,
        workloadUnit: workloadUnit || undefined,
        createdById: user?.id || null,
        createdByName: user?.username || null,
        createdDepartmentId: user?.departmentId || null,
        createdDepartmentName: user?.departmentName || null,
      };
      if (qaDepartmentId === '__inherit__') {
        if (parentQaDeptId) payload.qaDepartmentId = parentQaDeptId;
      } else if (qaDepartmentId) {
        payload.qaDepartmentId = qaDepartmentId;
      } else if (!canUpdateGlobal && user?.departmentId) {
        payload.qaDepartmentId = user.departmentId;
      }
      if (qaAssigneeId) {
        payload.qaAssigneeId = qaAssigneeId;
      }
      if (childCategory === 'PROJECT') {
        payload.departmentId = effectiveDeptId || parentTask.departmentId || null;
        if (assigneeId) payload.projectLeaderId = assigneeId;
      }
      if (childCategory === 'OPERATION_TASK') {
        payload.operatorIds = assigneeId ? [assigneeId] : undefined;
        payload.weight = candidateWeight ?? undefined;
        payload.inProgressWeight = inProgressWeight;
      }
      await taskService.createTask(payload as Parameters<typeof taskService.createTask>[0]);
      onSaved();
    } catch (err) {
      console.error(err);
      const e = err as { response?: { status?: number; data?: { message?: string } } };
      if (e?.response?.status === 400) {
        setError(e?.response?.data?.message || '创建失败，请检查参数');
      } else if (e?.response?.status === 403) {
        setError('无权限创建子任务');
      } else {
        setError('创建失败');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold">{childCategory === 'PROJECT' ? '创建子项目' : '创建子任务'}</h2>
            <p className="text-sm text-gray-500 mt-1">
              父任务：{parentTask.name}
              <span className="mx-1">·</span>
              层级：L{childDepth} / L{MAX_TREE_DEPTH - 1}
              {!depthOk && (
                <span className="text-red-500 ml-1">（已达上限）</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        {!depthOk && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            任务树深度已达上限（{MAX_TREE_DEPTH}层），不可在此节点下创建子任务。请选择更上层的节点创建。
          </div>
        )}

        {errors.length > 0 && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 space-y-1">
            {errors.map((v, i) => <div key={i}>{v.message}</div>)}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 space-y-1">
            {warnings.map((v, i) => <div key={i}>⚠ {v.message}</div>)}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">任务名称</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border rounded p-2"
              required
              disabled={!depthOk}
              placeholder="输入子任务名称"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">任务分类</label>
              <input
                value={childCategory === 'PROJECT' ? '项目' : (TASK_CATEGORY_LABELS['OPERATION_TASK'] || 'OPERATION_TASK')}
                className="w-full border rounded p-2 bg-gray-50 text-gray-500"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">优先级</label>
              <input
                type="number"
                value={priority}
                onChange={e => setPriority(parseInt(e.target.value || '0', 10))}
                className="w-full border rounded p-2"
                min={0}
                disabled={!depthOk}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {childCategory === 'PROJECT' ? '项目类型' : '任务类型'}
              <span className="text-red-500 ml-1">*</span>
            </label>
            {childCategory === 'PROJECT' ? (
              <>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full border rounded p-2"
                  required
                  disabled={!depthOk || isSubProject}
                >
                  <option value="">-- 请选择项目类型 --</option>
                  {enabledProjectTypes.map(pt => (
                    <option key={pt.id} value={pt.code}>{pt.name}</option>
                  ))}
                </select>
                {isSubProject && <p className="text-xs text-gray-400 mt-0.5">子项目为同质分解，项目类型与父项目一致</p>}
              </>
            ) : (
              <TaskTypeSelect
                value={type}
                onChange={(code) => setType(code)}
                required
                disabled={!depthOk}
              />
            )}
            {!typeValid && (
              <p className="text-xs text-red-500 mt-1">{childCategory === 'PROJECT' ? '必须选择项目类型' : '必须指定任务类型'}</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">工作量{childCategory === 'PROJECT' && <span className="text-red-500 ml-1">*</span>}</label>
              <input
                type="number"
                step="any"
                min="0"
                value={workload}
                onChange={e => setWorkload(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="w-full border rounded p-2"
                placeholder="如 12.5"
                disabled={!depthOk}
                required={childCategory === 'PROJECT'}
              />
              {remainingWorkload !== null && remainingWorkload > 0 && (
                <p className="text-xs text-gray-500 mt-1">父节点剩余工作量：{remainingWorkload}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">单位{childCategory === 'PROJECT' && <span className="text-red-500 ml-1">*</span>}</label>
              <select
                value={workloadUnit}
                onChange={e => setWorkloadUnit(e.target.value)}
                className="w-full border rounded p-2"
                disabled={!depthOk || isSubProject}
                required={childCategory === 'PROJECT'}
              >
                <option value="">--</option>
                {enabledMeasurementUnits.map(u => (
                  <option key={u.id} value={u.code}>{u.name}</option>
                ))}
              </select>
              {isSubProject && <p className="text-xs text-gray-400 mt-0.5">子项目为同质分解，计量单位与父项目一致</p>}
            </div>
          </div>

          {childCategory === 'OPERATION_TASK' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">执行人</label>
                <select
                  value={assigneeId}
                  onChange={e => setAssigneeId(e.target.value)}
                  className="w-full border rounded p-2"
                  disabled={!depthOk || !effectiveDeptId}
                >
                  <option value="">{effectiveDeptId ? '-- 未指定 --' : '-- 请先选择部门 --'}</option>
                  {leaders.map(u => (
                    <option key={u.id} value={u.id}>{u.username}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">质检员</label>
                <select
                  value={qaAssigneeId}
                  onChange={e => setQaAssigneeId(e.target.value)}
                  className="w-full border rounded p-2"
                  disabled={!depthOk || !effectiveQaDeptId}
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
                  onChange={e => setInProgressWeight(parseFloat(e.target.value) || 0.5)}
                  className="w-full border rounded p-2"
                  disabled={!depthOk}
                />
              </div>
            </>
          )}

          {childCategory === 'PROJECT' && (
            <>
              {showDeptFields && (
                <div>
                  <label className="block text-sm font-medium mb-1">执行部门</label>
                  <select
                    value={projectDeptId}
                    onChange={e => { setProjectDeptId(e.target.value); setAssigneeId(''); }}
                    className="w-full border rounded p-2"
                    disabled={!depthOk}
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
                  disabled={!depthOk || !effectiveDeptId}
                >
                  <option value="">{effectiveDeptId ? '-- 未指定 --' : '-- 请先选择部门 --'}</option>
                  {leaders.map(u => (
                    <option key={u.id} value={u.id}>{u.username}</option>
                  ))}
                </select>
              </div>
              {showDeptFields && (
                <div>
                  <label className="block text-sm font-medium mb-1">质检部门</label>
                  <select
                    value={qaDepartmentId}
                    onChange={e => { setQaDepartmentId(e.target.value); setQaAssigneeId(''); }}
                    className="w-full border rounded p-2"
                    disabled={!depthOk}
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
                  disabled={!depthOk || !effectiveQaDeptId}
                >
                  <option value="">-- 可选 --</option>
                  {qaUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.username}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">计划完成时间</label>
            <input
              type="datetime-local"
              value={plannedDueAt}
              onChange={e => setPlannedDueAt(e.target.value ? new Date(e.target.value).toISOString() : '')}
              className="w-full border rounded p-2"
              disabled={!depthOk}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600">取消</button>
            <button
              type="submit"
              disabled={saving || !depthOk || !canSubmit}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {saving ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
