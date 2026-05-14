import React, { useEffect, useMemo, useState } from 'react';
import { Task, User } from '../../types';
import { taskService } from '../../services/taskService';
import { userService } from '../../services/userService';
import { taskTypeService } from '../../services/taskTypeService';
import { taskTypeGroupService } from '../../services/taskTypeGroupService';
import type { TaskTypeResponse } from '../../services/taskTypeService';
import type { TaskTypeGroupResponse } from '../../services/taskTypeGroupService';
import { Plus, Trash2 } from 'lucide-react';
import { useProjectTypeStore } from '../../hooks/useProjectTypeStore';
import { hasAnyPermission } from '../../utils/constants';

interface SubTaskEntry {
  name: string;
  groupId: string;
  type: string;
  workload: number;
  workloadUnit: string;
  departmentId: string;
  assigneeId: string;
  qaDepartmentId: string;
  qaAssigneeId: string;
}

interface Props {
  task: Task;
  userAuthorities?: string[];
  currentUserDepartmentId?: string;
  currentUserId?: string;
  onClose: () => void;
  onDecomposed: () => void;
}

const QA_INHERIT = '__inherit__';

function createEmptySubTask(unit?: string, deptId?: string, qaDeptId?: string): SubTaskEntry {
  return { name: '', groupId: '', type: '', workload: 0, workloadUnit: unit || '', departmentId: deptId || '', assigneeId: '', qaDepartmentId: qaDeptId || '', qaAssigneeId: '' };
}

export const DecomposeModal: React.FC<Props> = ({ task, userAuthorities = [], currentUserDepartmentId, currentUserId, onClose, onDecomposed }) => {
  const { getUnitName } = useProjectTypeStore();
  const unitDisplay = task.workloadUnit ? getUnitName(task.workloadUnit) : '';
  const canUpdateGlobal = hasAnyPermission(userAuthorities, 'project:update_global');
  const canCreateProject = hasAnyPermission(userAuthorities, 'project:create');
  const canCreateTask = hasAnyPermission(userAuthorities, 'task:create');
  const isController = !!(currentUserId && task.controllerId && task.controllerId === currentUserId);
  const hasBothCreatePermissions = canCreateProject && canCreateTask;
  const defaultCategory = canCreateProject && !canCreateTask ? 'PROJECT' : (task.category || 'OPERATION_TASK');
  const [decomposeCategory, setDecomposeCategory] = useState<'PROJECT' | 'OPERATION_TASK'>(defaultCategory as 'PROJECT' | 'OPERATION_TASK');
  const isDecomposeProject = decomposeCategory === 'PROJECT';
  const showTypeColumns = !isDecomposeProject;

  const canSelectDept = canUpdateGlobal;
  const canSelectAssignee = isController;
  const canReadAllDepts = canUpdateGlobal;

  const defaultDeptId = canSelectDept ? '' : (currentUserDepartmentId || '');
  const parentQaDeptId = task.qaDepartmentId || '';
  const defaultQaDeptId = isDecomposeProject && parentQaDeptId ? QA_INHERIT : (parentQaDeptId || '');
  const [subTasks, setSubTasks] = useState<SubTaskEntry[]>([{
    ...createEmptySubTask(task.workloadUnit || undefined, defaultDeptId, defaultQaDeptId),
    workload: task.workload ?? 0,
  }]);
  const [departments, setDepartments] = useState<Array<{ id: string; departmentName: string }>>([]);
  const [departmentUsers, setDepartmentUsers] = useState<Record<string, User[]>>({});
  const [inspectorUsers, setInspectorUsers] = useState<Record<string, Array<{ id: string; username: string }>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [typeGroups, setTypeGroups] = useState<TaskTypeGroupResponse[]>([]);
  const [allTypes, setAllTypes] = useState<TaskTypeResponse[]>([]);

  useEffect(() => {
    taskTypeGroupService.listEnabled().then(setTypeGroups).catch(console.error);
    taskTypeService.list().then(setAllTypes).catch(console.error);
  }, []);

  useEffect(() => {
    userService.getDepartments().then((allDepts) => {
      if (canReadAllDepts) {
        setDepartments(allDepts);
      } else if (currentUserDepartmentId) {
        const ownDept = allDepts.find(d => d.id === currentUserDepartmentId);
        setDepartments(ownDept ? [ownDept] : []);
      } else {
        setDepartments([]);
      }
    }).catch(console.error);
  }, [canReadAllDepts, currentUserDepartmentId]);

  useEffect(() => {
    if (!canSelectAssignee) return;
    const deptIds = new Set<string>();
    subTasks.forEach(st => {
      if (st.departmentId) deptIds.add(st.departmentId);
    });
    if (!canSelectDept && currentUserDepartmentId) {
      deptIds.add(currentUserDepartmentId);
    }
    deptIds.forEach(deptId => {
      if (!departmentUsers[deptId]) {
        userService.getEligibleProjectLeaders(deptId, isDecomposeProject ? 'PROJECT' : 'OPERATION_TASK').then(list => {
          setDepartmentUsers(prev => ({ ...prev, [deptId]: list }));
        }).catch(console.error);
      }
    });
  }, [canSelectAssignee, canSelectDept, subTasks, currentUserDepartmentId, departmentUsers, isDecomposeProject]);

  useEffect(() => {
    const qaDeptIds = new Set<string>();
    subTasks.forEach(st => {
      const effective = st.qaDepartmentId === QA_INHERIT ? parentQaDeptId : st.qaDepartmentId;
      if (effective) qaDeptIds.add(effective);
    });
    qaDeptIds.forEach(deptId => {
      if (!inspectorUsers[deptId]) {
        userService.getInspectors().then(list => {
          const filtered = list.filter((u: { departmentId?: string }) => !u.departmentId || u.departmentId === deptId);
          setInspectorUsers(prev => ({ ...prev, [deptId]: filtered.map((u: { id: string; username: string }) => ({ id: u.id, username: u.username })) }));
        }).catch(console.error);
      }
    });
  }, [subTasks, parentQaDeptId, inspectorUsers]);

  const totalWorkload = subTasks.reduce((sum, st) => sum + (st.workload || 0), 0);
  const parentWorkload = task.workload ?? 0;
  const hasMultipleTypes = new Set(subTasks.filter(st => st.type).map(st => st.type)).size > 1;
  const workloadExceeded = !hasMultipleTypes && parentWorkload > 0 && totalWorkload > parentWorkload;

  const typeWorkloadWarnings = useMemo(() => {
    if (isDecomposeProject || parentWorkload <= 0) return [];
    const warnings: string[] = [];
    const validTasks = subTasks.filter(st => st.name.trim() && st.workload > 0 && st.type);
    if (validTasks.length === 0) return [];
    const byType: Record<string, { name: string; sum: number }> = {};
    validTasks.forEach(st => {
      const typeName = allTypes.find(t => t.code === st.type)?.name || st.type;
      if (!byType[st.type]) {
        byType[st.type] = { name: typeName, sum: 0 };
      }
      byType[st.type].sum += st.workload;
    });
    Object.entries(byType).forEach(([, info]) => {
      if (Math.abs(info.sum - parentWorkload) > 0.01) {
        warnings.push(`类型"${info.name}"工作量合计 ${info.sum.toFixed(1)}，与父任务总工作量 ${parentWorkload} 不一致`);
      }
    });
    return warnings;
  }, [subTasks, allTypes, parentWorkload, isDecomposeProject]);

  const hasTypeWorkloadError = typeWorkloadWarnings.length > 0;

  const duplicateWarnings = useMemo(() => {
    const warnings: string[] = [];
    const deptCount: Record<string, number> = {};
    const assigneeCount: Record<string, number> = {};
    const nameCount: Record<string, number> = {};
    const validTasks = subTasks.filter(st => st.name.trim() && st.workload > 0);
    validTasks.forEach(st => {
      if (st.departmentId) deptCount[st.departmentId] = (deptCount[st.departmentId] || 0) + 1;
      if (st.assigneeId) assigneeCount[st.assigneeId] = (assigneeCount[st.assigneeId] || 0) + 1;
      const key = st.name.trim().toLowerCase();
      if (key) nameCount[key] = (nameCount[key] || 0) + 1;
    });
    Object.entries(nameCount).filter(([, c]) => c > 1).forEach(([name, c]) => {
      warnings.push(`任务名称"${name}"重复出现 ${c} 次`);
    });
    Object.entries(deptCount).filter(([, c]) => c > 1).forEach(([deptId, c]) => {
      const dept = departments.find(d => d.id === deptId);
      warnings.push(`执行部门"${dept?.departmentName || deptId}"被 ${c} 个子任务共用`);
    });
    Object.entries(assigneeCount).filter(([, c]) => c > 1).forEach(([userId, c]) => {
      let userName = userId;
      for (const users of Object.values(departmentUsers)) {
        const u = users.find(u => u.id === userId);
        if (u) { userName = u.username; break; }
      }
      warnings.push(`执行人"${userName}"被 ${c} 个子任务共用`);
    });
    return warnings;
  }, [subTasks, departments, departmentUsers]);

  const hasDuplicateNames = useMemo(() => {
    const names = subTasks.filter(st => st.name.trim()).map(st => st.name.trim().toLowerCase());
    return new Set(names).size < names.length;
  }, [subTasks]);

  const updateSubTask = (index: number, field: keyof SubTaskEntry, value: string | number) => {
    setSubTasks(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === 'groupId') {
        next[index].type = '';
      }
      if (field === 'departmentId') {
        next[index].assigneeId = '';
      }
      if (field === 'qaDepartmentId') {
        next[index].qaAssigneeId = '';
      }
      return next;
    });
  };

  const addSubTask = () => {
    const remaining = parentWorkload - totalWorkload;
    setSubTasks(prev => [...prev, {
      ...createEmptySubTask(task.workloadUnit || undefined, defaultDeptId, defaultQaDeptId),
      workload: remaining > 0 ? Math.round(remaining * 10) / 10 : 0,
    }]);
  };

  const removeSubTask = (index: number) => {
    setSubTasks(prev => prev.filter((_, i) => i !== index));
  };

  const getEffectiveQaDeptId = (st: SubTaskEntry): string => {
    if (st.qaDepartmentId === QA_INHERIT) return parentQaDeptId;
    return st.qaDepartmentId;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validTasks = subTasks.filter(st => st.name.trim() && st.workload > 0);
    if (validTasks.length === 0) { alert('请至少添加一个有效的子任务'); return; }
    if (showTypeColumns && validTasks.some(st => !st.type)) { alert('请为所有子任务选择任务类型'); return; }
    if (hasDuplicateNames) { alert('子任务名称不能重复'); return; }
    if (workloadExceeded) { alert('子任务工作量总和超过父任务工作量'); return; }
    if (hasTypeWorkloadError) { alert('同类子任务工作量之和应等于父任务总工作量'); return; }
    if (canSelectDept && validTasks.some(st => !st.departmentId)) { alert('请为所有子任务选择执行部门'); return; }

    setSubmitting(true);
    try {
      await taskService.decomposeTask(task.id, {
        category: decomposeCategory,
        subTasks: validTasks.map(st => {
          const effectiveQaDeptId = getEffectiveQaDeptId(st);
          return {
            name: st.name.trim(),
            type: st.type || task.type || '',
            workload: st.workload,
            workloadUnit: st.workloadUnit || undefined,
            departmentId: st.departmentId || currentUserDepartmentId || undefined,
            assigneeId: st.assigneeId || undefined,
            qaDepartmentId: effectiveQaDeptId || currentUserDepartmentId || undefined,
            qaAssigneeId: st.qaAssigneeId || undefined,
          };
        }),
      });
      onDecomposed();
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      alert(error?.response?.data?.message || '分解失败');
    } finally {
      setSubmitting(false);
    }
  };

  const showDeptColumns = canSelectDept;
  const showPersonColumns = canSelectAssignee;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-h-[90vh] overflow-y-auto" style={{ width: showPersonColumns ? (showTypeColumns ? '1120px' : '960px') : showDeptColumns ? (showTypeColumns ? '940px' : '780px') : (showTypeColumns ? '680px' : '520px') }}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">分解{isDecomposeProject ? '子项目' : '子任务'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">✕</button>
        </div>

        {hasBothCreatePermissions && (
          <div className="mb-4 flex gap-2">
            <label className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded border cursor-pointer text-sm ${isDecomposeProject ? 'bg-amber-50 border-amber-400 text-amber-800' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
              <input type="radio" name="decomposeCategory" value="PROJECT" checked={isDecomposeProject} onChange={() => setDecomposeCategory('PROJECT')} className="sr-only" />
              分解为子项目
            </label>
            <label className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded border cursor-pointer text-sm ${!isDecomposeProject ? 'bg-amber-50 border-amber-400 text-amber-800' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
              <input type="radio" name="decomposeCategory" value="OPERATION_TASK" checked={!isDecomposeProject} onChange={() => setDecomposeCategory('OPERATION_TASK')} className="sr-only" />
              分解为子任务
            </label>
          </div>
        )}

        <div className="mb-4 p-3 bg-gray-50 rounded text-sm">
          <span className="font-medium">{task.name}</span>
          {task.workload != null && (
            <span className="text-gray-500 ml-2">(总工作量: {task.workload} {unitDisplay})</span>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-xs">
                  <th className="border px-2 py-1.5 text-center font-medium w-10">#</th>
                  <th className="border px-2 py-1.5 text-left font-medium w-60">名称 <span className="text-red-500">*</span></th>
                  {showTypeColumns && <th className="border px-2 py-1.5 text-left font-medium w-28">任务分组 <span className="text-red-500">*</span></th>}
                  {showTypeColumns && <th className="border px-2 py-1.5 text-left font-medium w-32">任务类型 <span className="text-red-500">*</span></th>}
                  <th className="border px-2 py-1.5 text-left font-medium w-28">工作量 <span className="text-red-500">*</span></th>
                  <th className="border px-2 py-1.5 text-left font-medium w-20">计量单位</th>
                  {showDeptColumns && <th className="border px-2 py-1.5 text-left font-medium w-36">执行部门 <span className="text-red-500">*</span></th>}
                  {showDeptColumns && <th className="border px-2 py-1.5 text-left font-medium w-36">质检部门</th>}
                  {showPersonColumns && <th className="border px-2 py-1.5 text-left font-medium w-20">{isDecomposeProject ? '项目负责人' : '执行人'}</th>}
                  {showPersonColumns && <th className="border px-2 py-1.5 text-left font-medium w-20">质检员</th>}
                </tr>
              </thead>
              <tbody>
                {subTasks.map((st, idx) => {
                  const effectiveDeptId = canSelectDept ? st.departmentId : (currentUserDepartmentId || '');
                  const execUsers = effectiveDeptId ? (departmentUsers[effectiveDeptId] || []) : [];
                  const effectiveQaDept = getEffectiveQaDeptId(st);
                  const qaUserList = effectiveQaDept ? (inspectorUsers[effectiveQaDept] || []) : [];
                  return (
                    <tr key={idx} className="hover:bg-gray-50/50">
                      <td className="border px-2 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-gray-400">{idx + 1}</span>
                          {subTasks.length > 1 && (
                            <button type="button" onClick={() => removeSubTask(idx)} className="text-red-400 hover:text-red-600 ml-0.5">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="border px-1 py-1">
                        <input value={st.name} onChange={e => updateSubTask(idx, 'name', e.target.value)} className="w-full border-0 p-0 text-sm focus:outline-none focus:ring-0" required placeholder={isDecomposeProject ? '子项目名称' : '子任务名称'} />
                      </td>
                      {showTypeColumns && (
                        <td className="border px-1 py-1">
                          <select value={st.groupId} onChange={e => updateSubTask(idx, 'groupId', e.target.value)} className="w-full border-0 p-0 text-sm focus:outline-none focus:ring-0 bg-transparent" required>
                            <option value="">选择分组</option>
                            {typeGroups.map(g => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </select>
                        </td>
                      )}
                      {showTypeColumns && (
                        <td className="border px-1 py-1">
                          <select value={st.type} onChange={e => updateSubTask(idx, 'type', e.target.value)} className="w-full border-0 p-0 text-sm focus:outline-none focus:ring-0 bg-transparent" required disabled={!st.groupId}>
                            <option value="">选择类型</option>
                            {allTypes.filter(t => t.groupId === st.groupId && t.enabled).map(t => (
                              <option key={t.id} value={t.code}>{t.name}</option>
                            ))}
                          </select>
                        </td>
                      )}
                      <td className="border px-1 py-1">
                        <input type="number" min="0.1" step="0.1" value={st.workload || ''} onChange={e => updateSubTask(idx, 'workload', parseFloat(e.target.value) || 0)} className="w-full border-0 p-0 text-sm focus:outline-none focus:ring-0" required />
                      </td>
                      <td className="border px-2 py-1.5 text-gray-600 text-sm">
                        {unitDisplay || task.workloadUnit || '-'}
                      </td>
                      {showDeptColumns && (
                        <td className="border px-1 py-1">
                          <select value={st.departmentId} onChange={e => updateSubTask(idx, 'departmentId', e.target.value)} className="w-full border-0 p-0 text-sm focus:outline-none focus:ring-0 bg-transparent" required disabled={!canSelectDept}>
                            <option value="">选择部门</option>
                            {departments.map(d => (
                              <option key={d.id} value={d.id}>{d.departmentName}</option>
                            ))}
                          </select>
                          {!canSelectDept && <span className="text-xs text-gray-400">仅限本部门</span>}
                        </td>
                      )}
                      {showDeptColumns && (
                        <td className="border px-1 py-1">
                          {isDecomposeProject ? (
                            <select value={st.qaDepartmentId} onChange={e => updateSubTask(idx, 'qaDepartmentId', e.target.value)} className="w-full border-0 p-0 text-sm focus:outline-none focus:ring-0 bg-transparent" disabled={!canSelectDept}>
                              <option value="">不指定</option>
                              {parentQaDeptId && (
                                <option value={QA_INHERIT}>继承上级 ({departments.find(d => d.id === parentQaDeptId)?.departmentName || parentQaDeptId})</option>
                              )}
                              {departments.map(d => (
                                <option key={d.id} value={d.id}>{d.departmentName}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-sm text-gray-600">
                              {parentQaDeptId ? (departments.find(d => d.id === parentQaDeptId)?.departmentName || parentQaDeptId) : '未指定'}
                            </span>
                          )}
                        </td>
                      )}
                      {showPersonColumns && (
                        <td className="border px-1 py-1">
                          <select value={st.assigneeId} onChange={e => updateSubTask(idx, 'assigneeId', e.target.value)} className="w-full border-0 p-0 text-sm focus:outline-none focus:ring-0 bg-transparent" disabled={!effectiveDeptId}>
                            <option value="">不指定</option>
                            {execUsers.map(u => (
                              <option key={u.id} value={u.id}>{u.username}</option>
                            ))}
                          </select>
                        </td>
                      )}
                      {showPersonColumns && (
                        <td className="border px-1 py-1">
                          {!effectiveQaDept ? (
                            <span className="text-xs text-amber-600">未设质检部门</span>
                          ) : (
                            <select value={st.qaAssigneeId} onChange={e => updateSubTask(idx, 'qaAssigneeId', e.target.value)} className="w-full border-0 p-0 text-sm focus:outline-none focus:ring-0 bg-transparent">
                              <option value="">不指定</option>
                              {qaUserList.map(u => (
                                <option key={u.id} value={u.id}>{u.username}</option>
                              ))}
                            </select>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button type="button" onClick={addSubTask} className="w-full mt-2 py-1.5 border-2 border-dashed border-gray-300 rounded text-gray-500 hover:border-gray-400 hover:text-gray-600 flex items-center justify-center gap-1 text-sm">
            <Plus size={14} /> {isDecomposeProject ? '添加子项目' : '添加子任务'}
          </button>

          {parentWorkload > 0 && !hasMultipleTypes && (
            <div className={`text-sm mt-3 ${workloadExceeded ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
              已指派: {totalWorkload.toFixed(1)} / {parentWorkload} {unitDisplay}
              {workloadExceeded && ' (超出!)'}
            </div>
          )}

          {typeWorkloadWarnings.length > 0 && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {typeWorkloadWarnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          )}

          {duplicateWarnings.length > 0 && (
            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
              {duplicateWarnings.map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">取消</button>
            <button type="submit" disabled={submitting || workloadExceeded || hasDuplicateNames || hasTypeWorkloadError} className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50">
              {submitting ? '提交中...' : '确认分解'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
