import React, { useEffect, useMemo, useState } from 'react';
import { Task } from '../../types';
import { userService } from '../../services/userService';
import { taskService } from '../../services/taskService';
import { attachmentService, AttachmentResponse } from '../../services/attachmentService';
import { PROJECT_TYPE_LABELS, TASK_STATUS_LABELS, TASK_CATEGORY_LABELS } from '../../utils/constants';
import CompositionModeBadge from './CompositionModeBadge';
import ProgressFormulaCard from './ProgressFormulaCard';
import { WorkloadConsistencyAlert } from '../task/WorkloadConsistencyAlert';
import { useProjectTypeStore } from '../../hooks/useProjectTypeStore';

export const ProjectInfoModal: React.FC<{ project: Task, onClose: () => void }> = ({ project, onClose }) => {
  const { getProjectTypeByCode, getUnitName } = useProjectTypeStore();
  const [departmentNameMap, setDepartmentNameMap] = useState<Record<string, string>>({});
  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({});
  const [children, setChildren] = useState<Task[]>([]);
  const [attachments, setAttachments] = useState<AttachmentResponse[]>([]);
  const categoryLabel = TASK_CATEGORY_LABELS[project.category ?? ''] || project.category || '-';

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
    userService.getUsers()
      .then(users => {
        const map: Record<string, string> = {};
        users.forEach(u => { map[u.id] = u.username; });
        setUserNameMap(map);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    taskService.getSubTasks(project.id)
      .then(data => {
        const items: Task[] = Array.isArray(data) ? data : [];
        setChildren(items.filter(c => c.category !== 'PROJECT'));
      })
      .catch(console.error);

    attachmentService.list(project.id)
      .then(setAttachments)
      .catch(() => setAttachments([]));
  }, [project.id]);

  const createdDepartmentName = useMemo(() => {
    if (project.createdDepartmentName) return project.createdDepartmentName;
    if (project.createdDepartmentId) {
      return departmentNameMap[project.createdDepartmentId] || project.createdDepartmentId;
    }
    return '-';
  }, [project.createdDepartmentId, project.createdDepartmentName, departmentNameMap]);

  const responsibilityDepartmentName = useMemo(() => {
    if (!project.departmentId) return '-';
    return departmentNameMap[project.departmentId] || project.departmentId;
  }, [project.departmentId, departmentNameMap]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[640px] max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold">项目详情</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500">项目名称</label>
              <div className="font-medium">{project.name}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">状态</label>
              <div className="font-medium">{TASK_STATUS_LABELS[project.status] || project.status}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">项目类型</label>
              <div className="font-medium">{getProjectTypeByCode(project.type)?.name || PROJECT_TYPE_LABELS[project.type] || project.type || '-'}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">任务类型</label>
              <div className="font-medium">{categoryLabel}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">项目负责人</label>
              <div className="text-sm break-all">{userNameMap[project.projectLeaderId || project.assigneeId || ''] || project.projectLeaderId || project.assigneeId || '-'}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">项目创建人</label>
              <div className="text-sm font-mono break-all">{project.createdByName || '-'}</div>
            </div>
            <div className="col-span-2">
              <label className="text-sm text-gray-500">项目 ID</label>
              <div className="font-mono text-sm break-all">{project.id}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">创建部门</label>
              <div className="text-sm font-mono break-all">{createdDepartmentName}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">责任部门</label>
              <div className="text-sm font-mono break-all">{responsibilityDepartmentName}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">外部来源</label>
              <div className="text-sm font-mono break-all">{project.externalSystem || '-'}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">外部项目 ID</label>
              <div className="text-sm font-mono break-all">{project.externalTaskId || '-'}</div>
            </div>
            <div className="col-span-2">
              <label className="text-sm text-gray-500">外部链接</label>
              {project.externalUrl ? (
                <a className="text-sm text-blue-600 break-all" href={project.externalUrl} target="_blank" rel="noreferrer">
                  {project.externalUrl}
                </a>
              ) : (
                <div className="text-sm font-mono break-all">-</div>
              )}
            </div>
            <div>
              <label className="text-sm text-gray-500">创建时间</label>
              <div className="text-sm">{project.createdAt ? new Date(project.createdAt).toLocaleString() : '-'}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">计划完成时间</label>
              <div className="text-sm">{project.plannedDueAt ? new Date(project.plannedDueAt).toLocaleString() : '-'}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">总工作量</label>
              <div className="text-sm">
                {project.workload != null ? `${project.workload} ${getUnitName(project.workloadUnit) || ''}` : '-'}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-500">结构类型</label>
              <div className="font-medium">
                <CompositionModeBadge mode={project.compositionMode} size="md" />
                {!project.compositionMode && '-'}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-500">层级深度</label>
              <div className="font-medium">{project.depthLevel != null ? `L${project.depthLevel}` : '-'}</div>
            </div>
          </div>

          {project.remarks && (
            <div className="border-t pt-4">
              <h3 className="font-bold mb-2">备注</h3>
              <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded">{project.remarks}</div>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-bold mb-2">附件（{attachments.length}）</h3>
              <ul className="space-y-1 text-sm">
                {attachments.map(a => (
                  <li key={a.id} className="flex justify-between items-center px-2 py-1 bg-gray-50 rounded">
                    <span className="text-gray-700">{a.fileName}</span>
                    <a href={attachmentService.downloadUrl(a.id)} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline text-xs">下载</a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {project.progress != null && (
            <div className="border-t pt-4">
              <h3 className="font-bold mb-2">进度</h3>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-500">当前进度</span>
                <span className="font-medium">{project.progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${project.progress >= 100 ? 'bg-green-500' : project.progress >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                  style={{ width: `${Math.min(100, Math.max(0, project.progress))}%` }}
                />
              </div>
            </div>
          )}

          {children.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-bold mb-2">工作量一致性</h3>
              <WorkloadConsistencyAlert parent={project} children={children} getUnitName={getUnitName} />
            </div>
          )}

          {children.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-bold mb-2">汇聚公式</h3>
              <ProgressFormulaCard node={project} children={children} />
            </div>
          )}

          {children.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-bold mb-2">子任务分发状态</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(
                  children.reduce<Record<string, number>>((acc, c) => {
                    const label = TASK_STATUS_LABELS[c.status] || c.status;
                    acc[label] = (acc[label] || 0) + 1;
                    return acc;
                  }, {})
                ).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between px-2 py-1 bg-gray-50 rounded">
                    <span className="text-gray-600">{status}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">关闭</button>
        </div>
      </div>
    </div>
  );
};
