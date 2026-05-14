import React, { useEffect, useMemo, useState } from 'react';
import { Task } from '../../types';
import { taskService } from '../../services/taskService';
import { userService } from '../../services/userService';
import { TASK_STATUS_LABELS } from '../../utils/constants';
import { StatusWorkloadEditor } from '../task/StatusWorkloadEditor';
import { HandoffChain } from '../task/HandoffChain';
import { WorkloadConsistencyAlert } from '../task/WorkloadConsistencyAlert';
import { useProjectTypeStore } from '../../hooks/useProjectTypeStore';

interface Props {
  task: Task;
  onClose: () => void;
  userNameById?: Record<string, string>;
}

export const TaskDetailModal: React.FC<Props> = ({ task, onClose, userNameById = {} }) => {
  const [currentTask] = useState<Task>(task);
  const [dependencies, setDependencies] = useState<{ predecessors: Task[], successors: Task[] } | null>(null);
  const [departmentNameMap, setDepartmentNameMap] = useState<Record<string, string>>({});
  const [children, setChildren] = useState<Task[]>([]);
  const { getTypeDisplayName, getUnitName } = useProjectTypeStore();

  useEffect(() => {
    taskService.getTaskDependencies(task.id).then(setDependencies).catch(console.error);
  }, [task.id]);

  useEffect(() => {
    if (task.hasChildren) {
      taskService.getSubTasks(task.id).then(data => {
        const items: Task[] = Array.isArray(data) ? data : [];
        setChildren(items);
      }).catch(console.error);
    }
  }, [task.id, task.hasChildren]);

  useEffect(() => {
    userService.getDepartments()
      .then(departments => {
        const map: Record<string, string> = {};
        departments.forEach(d => {
          if (d.id) {
            map[d.id] = d.departmentName;
          }
        });
        setDepartmentNameMap(map);
      })
      .catch(console.error);
  }, []);

  const createdDepartmentName = useMemo(() => {
    if (task.createdDepartmentName) return task.createdDepartmentName;
    if (task.createdDepartmentId) {
      return departmentNameMap[task.createdDepartmentId] || task.createdDepartmentId;
    }
    return '-';
  }, [departmentNameMap, task.createdDepartmentId, task.createdDepartmentName]);

  const responsibilityDepartmentName = useMemo(() => {
    if (!task.departmentId) return '-';
    return departmentNameMap[task.departmentId] || task.departmentId;
  }, [departmentNameMap, task.departmentId]);

  const compositionModeLabel = useMemo(() => {
    if (task.compositionMode === 'HOMOGENEOUS') return '同质任务';
    if (task.compositionMode === 'HETEROGENEOUS') return '异质任务';
    return '-';
  }, [task.compositionMode]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold">{task.name}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500">状态</label>
              <div className="font-medium">{TASK_STATUS_LABELS[task.status] || task.status}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">优先级</label>
              <div className="font-medium">{task.priority}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">任务类型</label>
              <div className="font-medium">{getTypeDisplayName(task.type, task.category)}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">结构类型</label>
              <div className="font-medium">{compositionModeLabel}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">计划完成时间</label>
              <div className="font-medium">{task.plannedDueAt ? new Date(task.plannedDueAt).toLocaleString() : '-'}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">进度权重</label>
              <div className="font-medium">{task.weight != null ? task.weight : '-'}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">工作量</label>
              <div className="font-medium">
                {task.workload != null ? `${task.workload} ${task.workloadUnit ? getUnitName(task.workloadUnit) : ''}`.trim() : '-'}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-500">ID</label>
              <div className="text-sm font-mono">{task.id}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">责任部门</label>
              <div className="text-sm">{responsibilityDepartmentName}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">创建部门</label>
              <div className="text-sm">{createdDepartmentName}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">外部来源</label>
              <div className="text-sm font-mono break-all">{task.externalSystem || '-'}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">外部任务 ID</label>
              <div className="text-sm font-mono break-all">{task.externalTaskId || '-'}</div>
            </div>
            <div className="col-span-2">
              <label className="text-sm text-gray-500">外部链接</label>
              {task.externalUrl ? (
                <a className="text-sm text-blue-600 break-all" href={task.externalUrl} target="_blank" rel="noreferrer">
                  {task.externalUrl}
                </a>
              ) : (
                <div className="text-sm font-mono break-all">-</div>
              )}
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-bold mb-2">指派</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-500">执行人</label>
                <div className="text-sm break-all">{currentTask.operatorIds?.length ? currentTask.operatorIds.map(id => userNameById[id] || id).join('、') : '-'}</div>
              </div>
              <div>
                <label className="text-sm text-gray-500">质检员</label>
                <div className="text-sm break-all">{currentTask.inspectorIds?.length ? currentTask.inspectorIds.map(id => userNameById[id] || id).join('、') : '-'}</div>
              </div>
            </div>
          </div>

          {(currentTask.qaDepartmentId || currentTask.qaAssigneeId) && (
            <div className="border-t pt-4">
              <h3 className="font-bold mb-2">质检指派</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-500">质检部门</label>
                  <div className="text-sm">{currentTask.qaDepartmentId ? (departmentNameMap[currentTask.qaDepartmentId] || currentTask.qaDepartmentId) : '-'}</div>
                </div>
                <div>
                  <label className="text-sm text-gray-500">质检员</label>
                  <div className="text-sm">{currentTask.qaAssigneeId ? (userNameById[currentTask.qaAssigneeId] || currentTask.qaAssigneeId) : '-'}</div>
                </div>
              </div>
            </div>
          )}

          {children.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-bold mb-2">工作量一致性</h3>
              <WorkloadConsistencyAlert parent={currentTask} children={children} getUnitName={getUnitName} />
            </div>
          )}

          <div className="border-t pt-4">
            <h3 className="font-bold mb-2">状态工作量</h3>
            <StatusWorkloadEditor
              task={currentTask}
              readOnly
            />
          </div>

          {dependencies && (
            <div className="border-t pt-4">
              <h3 className="font-bold mb-2">依赖关系</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-gray-600">前置任务 (等待中)</h4>
                  {dependencies.predecessors.length === 0 ? <span className="text-gray-400 text-sm">无</span> : (
                    <ul className="list-disc pl-5 text-sm">
                      {dependencies.predecessors.map(p => (
                        <li key={p.id}>
                            <span className={p.status === 'COMPLETED' ? 'text-green-600 line-through' : 'text-red-600'}>
                                {p.name} ({TASK_STATUS_LABELS[p.status] || p.status})
                            </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-600">后置任务 (阻塞中)</h4>
                  {dependencies.successors.length === 0 ? <span className="text-gray-400 text-sm">无</span> : (
                    <ul className="list-disc pl-5 text-sm">
                      {dependencies.successors.map(s => (
                        <li key={s.id}>{s.name} ({TASK_STATUS_LABELS[s.status] || s.status})</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="border-t pt-4">
            <h3 className="font-bold mb-2">接力棒链路</h3>
            <HandoffChain taskId={task.id} userNameById={userNameById} />
          </div>

          <div className="border-t pt-4">
            <h3 className="font-bold mb-2">元数据</h3>
            <div className="bg-gray-50 p-2 rounded text-xs font-mono overflow-x-auto">
                <p>Input: {task.inputParams || '{}'}</p>
                <p>Output: {task.outputResults || '{}'}</p>
            </div>
          </div>
        </div>
        
        <div className="mt-6 flex justify-end">
            <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">关闭</button>
        </div>
      </div>
    </div>
  );
};
