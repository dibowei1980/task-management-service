import React, { useState, useEffect, useMemo } from 'react';
import { User } from '../../types';
import { taskService } from '../../services/taskService';
import { userService } from '../../services/userService';
import { useAuth } from '../../context/AuthContext';
import { useProjectTypeStore } from '../../hooks/useProjectTypeStore';
import { hasAnyPermission } from '../../utils/constants';

interface CreateProjectModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [projectType, setProjectType] = useState('');
  const [description, setDescription] = useState('');
  const [workload, setWorkload] = useState<number | ''>('');
  const [workloadUnit, setWorkloadUnit] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [plannedDueAt, setPlannedDueAt] = useState<string>('');
  const [leaders, setLeaders] = useState<Array<{ id: string; username: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; departmentName: string }>>([]);
  const [departmentId, setDepartmentId] = useState<string>('');
  const [qaDepartmentId, setQaDepartmentId] = useState<string>('');
  const [qaAssigneeId, setQaAssigneeId] = useState<string>('');
  const [qaUsers, setQaUsers] = useState<Array<{ id: string; username: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { enabledProjectTypes, enabledMeasurementUnits } = useProjectTypeStore();
  const { user } = useAuth();
  const allAuths = [...(user?.roles || []), ...(user?.permissions || [])];
  const canUpdateGlobal = hasAnyPermission(allAuths, 'project:update_global');

  const showDeptFields = canUpdateGlobal;
  const effectiveDepartmentId = canUpdateGlobal ? departmentId : (user?.departmentId || '');
  const effectiveQaDeptId = canUpdateGlobal ? qaDepartmentId : (user?.departmentId || '');

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
    if (!effectiveQaDeptId) { setQaUsers([]); return; }
    userService.getInspectors()
      .then(list => {
        const filtered = list.filter((u: User) => !u.departmentId || u.departmentId === effectiveQaDeptId);
        setQaUsers(filtered.map(u => ({ id: u.id, username: u.username })));
      })
      .catch(console.error);
  }, [effectiveQaDeptId]);

  useEffect(() => {
    if (!effectiveDepartmentId) {
      setLeaders([]);
      setAssigneeId('');
      return;
    }
    userService.getEligibleProjectLeaders(effectiveDepartmentId, 'PROJECT')
      .then((list: User[]) => {
        setLeaders(list.map(u => ({ id: String(u.id || ''), username: String(u.username || '') })));
      })
      .catch(console.error);
  }, [effectiveDepartmentId]);

  const projectTypeOptions = useMemo(() => {
    return enabledProjectTypes.map(pt => ({ value: pt.code, label: pt.name }));
  }, [enabledProjectTypes]);

  useEffect(() => {
    if (!canUpdateGlobal && user?.departmentId) {
      setDepartmentId(user.departmentId);
    }
  }, [canUpdateGlobal, user?.departmentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const trimmedDescription = description.trim();
      const payload: Record<string, unknown> = {
        name,
        category: 'PROJECT' as const,
        type: projectType,
        status: 'PENDING' as const,
        priority: 1,
        workload: workload || undefined,
        workloadUnit: workloadUnit || undefined,
        departmentId: effectiveDepartmentId || null,
        createdById: user?.id || null,
        createdByName: user?.username || null,
        createdDepartmentId: user?.departmentId || null,
        createdDepartmentName: user?.departmentName || null,
        projectLeaderId: assigneeId || null,
        plannedDueAt: plannedDueAt || null,
        inputParams: trimmedDescription ? JSON.stringify({ description: trimmedDescription }) : undefined,
      };
      if (effectiveQaDeptId) payload.qaDepartmentId = effectiveQaDeptId;
      if (qaAssigneeId) payload.qaAssigneeId = qaAssigneeId;
      await taskService.createTask(payload as Parameters<typeof taskService.createTask>[0]);
      onCreated();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e?.response?.data?.message || '创建失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-[640px] max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold">新建项目</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">项目名称</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full border rounded p-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">项目类型</label>
              <select
                value={projectType}
                onChange={e => setProjectType(e.target.value)}
                className="w-full border rounded p-2"
                required
              >
                <option value="">-- 请选择 --</option>
                {projectTypeOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">工作量</label>
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  value={workload}
                  onChange={e => setWorkload(e.target.value ? parseFloat(e.target.value) : '')}
                  className="w-full border rounded p-2"
                  required
                  placeholder="如 100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">单位</label>
                <select
                  value={workloadUnit}
                  onChange={e => setWorkloadUnit(e.target.value)}
                  className="w-full border rounded p-2"
                  required
                >
                  <option value="">--</option>
                  {enabledMeasurementUnits.map(u => (
                    <option key={u.id} value={u.code}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {showDeptFields && (
              <div>
                <label className="block text-sm font-medium mb-1">执行部门</label>
                <select
                  value={departmentId}
                  onChange={e => { setDepartmentId(e.target.value); setAssigneeId(''); }}
                  className="w-full border rounded p-2"
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
                disabled={!effectiveDepartmentId}
              >
                <option value="">{effectiveDepartmentId ? '-- 未指定 --' : '-- 请先选择部门 --'}</option>
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
                >
                  <option value="">-- 可选 --</option>
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
            <div className="col-span-2">
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
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">描述</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full border rounded p-2"
                rows={2}
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2 mt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600">取消</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60">
              {saving ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
