import React, { useEffect, useState } from 'react';
import { Task, User } from '../../types';
import { taskService } from '../../services/taskService';
import { userService } from '../../services/userService';
import { useProjectTypeStore } from '../../hooks/useProjectTypeStore';
import { hasAnyPermission } from '../../utils/constants';
import { ActionAttachmentsPanel } from './ActionAttachmentsPanel';
import { attachmentService } from '../../services/attachmentService';

interface Props {
  task: Task;
  userAuthorities?: string[];
  currentUserDepartmentId?: string;
  currentUserId?: string;
  onClose: () => void;
  onAssigned: () => void;
}

export const AssignModal: React.FC<Props> = ({ task, userAuthorities = [], currentUserDepartmentId, currentUserId, onClose, onAssigned }) => {
  const { getUnitName } = useProjectTypeStore();
  const isProject = task.category === 'PROJECT';
  const unitDisplay = task.workloadUnit ? getUnitName(task.workloadUnit) : '';

  const canUpdateGlobal = hasAnyPermission(userAuthorities, 'project:update_global');
  const isController = !!(currentUserId && task.controllerId && task.controllerId === currentUserId);

  const effectiveCanReadAllDepts = canUpdateGlobal;
  const effectiveCanSelectDept = canUpdateGlobal;
  const effectiveCanSelectAssignee = isController;

  const [departmentId, setDepartmentId] = useState(
    effectiveCanReadAllDepts ? (task.departmentId || '') : (currentUserDepartmentId || task.departmentId || '')
  );
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [qaDepartmentId, setQaDepartmentId] = useState(
    effectiveCanReadAllDepts ? (task.qaDepartmentId || '') : (currentUserDepartmentId || task.qaDepartmentId || '')
  );
  const [qaAssigneeId, setQaAssigneeId] = useState<string>('');
  const [departments, setDepartments] = useState<Array<{ id: string; departmentName: string }>>([]);
  const [users, setUsers] = useState<Array<{ id: string; username: string }>>([]);
  const [qaUsers, setQaUsers] = useState<Array<{ id: string; username: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [taskAttachmentIds, setTaskAttachmentIds] = useState<string[]>([]);

  useEffect(() => {
    if (task.attachmentCount && task.attachmentCount > 0) {
      attachmentService.list(task.id).then(atts => {
        setTaskAttachmentIds(atts.map(a => a.id));
      }).catch(() => {});
    }
  }, [task.id, task.attachmentCount]);

  useEffect(() => {
    userService.getDepartments().then((allDepts) => {
      if (effectiveCanReadAllDepts) {
        setDepartments(allDepts);
      } else if (currentUserDepartmentId) {
        const ownDept = allDepts.find(d => d.id === currentUserDepartmentId);
        setDepartments(ownDept ? [ownDept] : []);
      } else {
        setDepartments([]);
      }
    }).catch(console.error);
  }, [effectiveCanReadAllDepts, currentUserDepartmentId]);

  useEffect(() => {
    if (!departmentId) { setUsers([]); return; }
    if (!effectiveCanSelectAssignee) { setUsers([]); return; }
    userService.getEligibleProjectLeaders(departmentId, task.category)
      .then((list: User[]) => {
        if (Array.isArray(list) && list.length > 0) {
          setUsers(list.map((u) => ({ id: String(u.id || ''), username: String(u.username || '') })));
        } else {
          setUsers([]);
        }
      })
      .catch(console.error);
  }, [departmentId, effectiveCanSelectAssignee, task.category]);

  useEffect(() => {
    if (!qaDepartmentId) { setQaUsers([]); return; }
    userService.getInspectors()
      .then((list: User[]) => {
        const filtered = list.filter(u => !u.departmentId || u.departmentId === qaDepartmentId);
        setQaUsers(filtered.map(u => ({ id: u.id, username: u.username })));
      })
      .catch(console.error);
  }, [qaDepartmentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!departmentId) { alert('请选择执行部门'); return; }
    setSubmitting(true);
    try {
      await taskService.assignTask(task.id, {
        departmentId,
        assigneeId: assigneeId || null,
        qaDepartmentId: qaDepartmentId || null,
        qaAssigneeId: qaAssigneeId || null,
      });
      onAssigned();
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      alert(error?.response?.data?.message || '指派失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[480px] max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">{isProject ? '指派项目负责人' : '指派任务'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">✕</button>
        </div>

        <div className="mb-4 p-3 bg-gray-50 rounded text-sm">
          <span className="font-medium">{task.name}</span>
          {task.workload != null && (
            <span className="text-gray-500 ml-2">({task.workload} {unitDisplay})</span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{isProject ? '负责部门' : '执行部门'} <span className="text-red-500">*</span></label>
            <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className="w-full border rounded p-2" required disabled={!effectiveCanSelectDept}>
              <option value="">请选择部门</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.departmentName}</option>
              ))}
            </select>
            {!effectiveCanSelectDept && <p className="text-xs text-gray-400 mt-1">仅限本部门</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{isProject ? '项目负责人' : '执行人'}</label>
            <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className="w-full border rounded p-2" disabled={!effectiveCanSelectAssignee}>
              <option value="">{isProject ? '不指定' : '不指定（部门内指派）'}</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.username}</option>
              ))}
            </select>
          </div>

          <hr className="my-2" />

          <div>
            <label className="block text-sm font-medium mb-1">质检部门</label>
            <select value={qaDepartmentId} onChange={e => setQaDepartmentId(e.target.value)} className="w-full border rounded p-2" disabled={!effectiveCanSelectDept}>
              <option value="">不指定</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.departmentName}</option>
              ))}
            </select>
            {!effectiveCanSelectDept && <p className="text-xs text-gray-400 mt-1">仅限本部门</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">质检员</label>
            <select value={qaAssigneeId} onChange={e => setQaAssigneeId(e.target.value)} className="w-full border rounded p-2" disabled={!effectiveCanSelectAssignee}>
              <option value="">不指定</option>
              {qaUsers.map(u => (
                <option key={u.id} value={u.id}>{u.username}</option>
              ))}
            </select>
          </div>

          <hr className="my-2" />

          <ActionAttachmentsPanel
            taskId={task.id}
            action="ASSIGN"
            mode="edit"
            currentUserId={currentUserId}
            taskAttachmentIds={taskAttachmentIds}
          />

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">取消</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50">
              {submitting ? '提交中...' : '确认指派'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
