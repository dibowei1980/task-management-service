import React, { useEffect, useState } from 'react';
import { Task, User } from '../../types';
import { taskService } from '../../services/taskService';
import { userService } from '../../services/userService';
import { attachmentService, AttachmentResponse } from '../../services/attachmentService';
import { ProjectTypeSelect } from '../common/ProjectTypeSelect';
import { MeasurementUnitSelect } from '../common/MeasurementUnitSelect';
import { useProjectTypeStore } from '../../hooks/useProjectTypeStore';
import { useWeightValidation } from '../../hooks/useWeightValidation';
import { useAuth } from '../../context/AuthContext';
import { hasAnyPermission } from '../../utils/constants';

interface Props {
  project: Task;
  onClose: () => void;
  onSaved: () => void;
  hasChildren?: boolean;
}

export const ProjectEditModal: React.FC<Props> = ({ project, onClose, onSaved }) => {
  const [name, setName] = useState(project.name);
  const [priority, setPriority] = useState<number>(project.priority);
  const [plannedDueAt, setPlannedDueAt] = useState<string>(project.plannedDueAt || project.dueAt || '');
  const [assigneeId, setAssigneeId] = useState<string>(project.assigneeId || '');
  const [leaders, setLeaders] = useState<Array<{ id: string; username: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; departmentName: string }>>([]);
  const [departmentId, setDepartmentId] = useState<string>(project.departmentId || '');
  const [qaDepartmentId, setQaDepartmentId] = useState<string>(project.qaDepartmentId || '');
  const [qaAssigneeId, setQaAssigneeId] = useState<string>(project.qaAssigneeId || '');
  const [qaUsers, setQaUsers] = useState<Array<{ id: string; username: string }>>([]);
  const [parentQaDeptId, setParentQaDeptId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState(project.type || '');
  const [workload, setWorkload] = useState<number | ''>(project.workload ?? '');
  const [workloadUnit, setWorkloadUnit] = useState<string>(project.workloadUnit || '');
  const [weight, setWeight] = useState<number | ''>(project.weight ?? '');
  const [remarks, setRemarks] = useState<string>(project.remarks || '');
  const [attachments, setAttachments] = useState<AttachmentResponse[]>([]);
  const [uploading, setUploading] = useState(false);
  const [siblingTasks, setSiblingTasks] = useState<Task[]>([]);
  const [parentCompositionMode, setParentCompositionMode] = useState<'HOMOGENEOUS' | 'HETEROGENEOUS' | null>(null);
  const { projectTypes, measurementUnits } = useProjectTypeStore();
  const { user } = useAuth();
  const allAuths = [...(user?.roles || []), ...(user?.permissions || [])];
  const canUpdateGlobal = hasAnyPermission(allAuths, 'project:update_global');
  const isController = !!(user?.id && project.controllerId && project.controllerId === user.id);

  const showDeptFields = canUpdateGlobal;
  const effectiveDeptId = canUpdateGlobal ? departmentId : (user?.departmentId || project.departmentId || '');
  const effectiveQaDeptId = (() => {
    const raw = qaDepartmentId === '__inherit__' ? parentQaDeptId : qaDepartmentId;
    return canUpdateGlobal ? raw : (user?.departmentId || raw || '');
  })();

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
    userService.getEligibleProjectLeaders(effectiveDeptId, 'PROJECT')
      .then((list: User[]) => {
        setLeaders(list.map(u => ({ id: String(u.id || ''), username: String(u.username || '') })));
      })
      .catch(console.error);
  }, [effectiveDeptId]);

  useEffect(() => {
    if (!effectiveQaDeptId) { setQaUsers([]); setQaAssigneeId(''); return; }
    userService.getInspectors()
      .then(list => {
        const filtered = list.filter(u => !u.departmentId || u.departmentId === effectiveQaDeptId);
        setQaUsers(filtered.map(u => ({ id: u.id, username: u.username })));
      })
      .catch(console.error);
  }, [effectiveQaDeptId]);

  useEffect(() => {
    taskService.checkEditPermission(project.id)
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
  }, [project.id, onClose]);

  useEffect(() => {
    if (project.parentTaskId) {
      taskService.getSubTasks(project.parentTaskId)
        .then(tasks => setSiblingTasks(tasks.filter(t => t.id !== project.id)))
        .catch(console.error);
      taskService.getTaskById(project.parentTaskId)
        .then(parent => {
          setParentCompositionMode(parent.compositionMode ?? null);
          const pQa = parent.qaDepartmentId || '';
          setParentQaDeptId(pQa);
          if (pQa && (!project.qaDepartmentId || project.qaDepartmentId === pQa)) {
            setQaDepartmentId('__inherit__');
          }
        })
        .catch(console.error);
    }
  }, [project.parentTaskId, project.id, project.qaDepartmentId]);

  const weightMismatchWarning = useWeightValidation(parentCompositionMode, siblingTasks, weight);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (weightMismatchWarning) {
      const confirmed = window.confirm(
        `⚠️ 权重告警\n\n${weightMismatchWarning}\n\n仍要保存吗？`
      );
      if (!confirmed) return;
    }
    setSaving(true);
    const finalQaDeptId = qaDepartmentId === '__inherit__' ? (parentQaDeptId || null) : (qaDepartmentId || null);
    try {
      await taskService.updateTask(project.id, {
        name,
        type,
        priority,
        projectLeaderId: assigneeId || null,
        plannedDueAt: plannedDueAt || null,
        departmentId: effectiveDeptId || null,
        workload: workload === '' ? null : workload,
        workloadUnit: workloadUnit || null,
        weight: weight === '' ? null : weight,
        qaDepartmentId: canUpdateGlobal ? finalQaDeptId : (user?.departmentId || finalQaDeptId),
        qaAssigneeId: qaAssigneeId || null,
        remarks: remarks || null
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
          <h2 className="text-xl font-bold">编辑项目</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
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
              <ProjectTypeSelect
                projectTypes={projectTypes}
                value={type}
                onChange={(code) => setType(code)}
                required
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
                  placeholder="如 120"
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
                <label className="block text-sm font-medium mb-1">执行部门</label>
                <select
                  value={departmentId}
                  onChange={e => setDepartmentId(e.target.value)}
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
            <div>
              <label className="block text-sm font-medium mb-1">优先级</label>
              <input
                type="number"
                value={priority}
                onChange={e => setPriority(parseInt(e.target.value || '0', 10))}
                className="w-full border rounded p-2"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">备注</label>
              <textarea
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                className="w-full border rounded p-2"
                rows={2}
                placeholder="工作范围、质量要求、交付标准等"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">附件</label>
              <input
                type="file"
                disabled={uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  try {
                    const res = await attachmentService.upload(project.id, file);
                    setAttachments(prev => [...prev, res]);
                  } catch {
                    alert('上传失败');
                  } finally {
                    setUploading(false);
                    e.target.value = '';
                  }
                }}
                className="w-full text-sm"
              />
              {uploading && <div className="text-sm text-gray-500 mt-1">上传中...</div>}
              {attachments.length > 0 && (
                <ul className="text-sm mt-2 space-y-1">
                  {attachments.map(a => (
                    <li key={a.id} className="flex justify-between items-center">
                      <a href={attachmentService.downloadUrl(a.id)} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline text-xs">
                        {a.fileName}
                      </a>
                      <button
                        type="button"
                        className="text-red-500 text-xs ml-2"
                        onClick={async () => {
                          try {
                            await attachmentService.delete(project.id, a.id);
                            setAttachments(prev => prev.filter(x => x.id !== a.id));
                          } catch { alert('删除失败'); }
                        }}
                      >删除</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
