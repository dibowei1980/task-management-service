import React, { useEffect, useState } from 'react';
import { taskService } from '../../services/taskService';
import { userService } from '../../services/userService';
import { TASK_STATUS_LABELS } from '../../utils/constants';

interface HandoffRecord {
  id: string;
  taskId: string;
  action: string;
  fromControllerId: string | null;
  toControllerId: string | null;
  fromDepartmentId: string | null;
  toDepartmentId: string | null;
  fromAssigneeId: string | null;
  toAssigneeId: string | null;
  fromAssignerId: string | null;
  toAssignerId: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  operatedBy: string | null;
  operatedAt: string;
}

interface Props {
  taskId: string;
  userNameById?: Record<string, string>;
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: '创建',
  ASSIGN: '指派',
  REASSIGN: '重新指派',
  RECEIVE: '接收',
  REVOKE_ASSIGNMENT: '撤销指派',
  UNDO_RECEIVE: '撤销接收',
  SUBMIT_QA: '提交质检',
  ACCEPT_QA: '接收质检',
  QA_APPROVE: '质检通过',
  QA_REJECT: '质检不通过',
  REVOKE_QA: '撤销质检',
};

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-800 border-green-300',
  ASSIGN: 'bg-blue-100 text-blue-800 border-blue-300',
  REASSIGN: 'bg-blue-100 text-blue-800 border-blue-300',
  RECEIVE: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  REVOKE_ASSIGNMENT: 'bg-red-100 text-red-800 border-red-300',
  UNDO_RECEIVE: 'bg-red-100 text-red-800 border-red-300',
  SUBMIT_QA: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  ACCEPT_QA: 'bg-purple-100 text-purple-800 border-purple-300',
  QA_APPROVE: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  QA_REJECT: 'bg-orange-100 text-orange-800 border-orange-300',
  REVOKE_QA: 'bg-red-100 text-red-800 border-red-300',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  RECEIVED: 'bg-indigo-100 text-indigo-700',
  IN_PROGRESS: 'bg-cyan-100 text-cyan-700',
  SUBMITTED_FOR_QA: 'bg-yellow-100 text-yellow-700',
  QA_COMPLETING: 'bg-purple-100 text-purple-700',
  QA_COMPLETED: 'bg-emerald-100 text-emerald-700',
  COMPLETED: 'bg-green-100 text-green-700',
};

const resolveStatusLabel = (status: string | null) => {
  if (!status) return '-';
  return (TASK_STATUS_LABELS as Record<string, string>)[status] || status;
};

export const HandoffChain: React.FC<Props> = ({ taskId, userNameById = {} }) => {
  const [records, setRecords] = useState<HandoffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [departmentNameMap, setDepartmentNameMap] = useState<Record<string, string>>({});

  useEffect(() => {
    taskService.getHandoffRecords(taskId)
      .then(data => setRecords(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [taskId]);

  useEffect(() => {
    userService.getDepartments()
      .then(departments => {
        const map: Record<string, string> = {};
        departments.forEach(d => {
          if (d.id) map[d.id] = d.departmentName;
        });
        setDepartmentNameMap(map);
      })
      .catch(console.error);
  }, []);

  const resolveUser = (id: string | null) => {
    if (!id) return '-';
    return userNameById[id] || id.substring(0, 8) + '...';
  };

  const resolveDept = (id: string | null) => {
    if (!id) return '-';
    return departmentNameMap[id] || id;
  };

  if (loading) {
    return <div className="text-sm text-gray-400 py-2">加载链路...</div>;
  }

  if (records.length === 0) {
    return <div className="text-sm text-gray-400 py-2">暂无链路记录</div>;
  }

  return (
    <div className="space-y-0">
      {records.map((record, index) => {
        const isLast = index === records.length - 1;
        const actionLabel = ACTION_LABELS[record.action] || record.action;
        const actionColor = ACTION_COLORS[record.action] || 'bg-gray-100 text-gray-800 border-gray-300';

        const hasStatusChange = record.fromStatus !== record.toStatus;
        const hasAssignmentChange =
          record.fromDepartmentId !== record.toDepartmentId ||
          record.fromAssigneeId !== record.toAssigneeId ||
          record.fromAssignerId !== record.toAssignerId ||
          record.fromControllerId !== record.toControllerId;

        return (
          <div key={record.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full border-2 mt-1.5 shrink-0 ${
                record.action.startsWith('REVOKE') || record.action.startsWith('UNDO')
                  ? 'border-red-400 bg-red-200'
                  : record.action === 'CREATE'
                    ? 'border-green-400 bg-green-200'
                    : 'border-blue-400 bg-blue-200'
              }`} />
              {!isLast && <div className="w-0.5 flex-1 bg-gray-200 my-1" />}
            </div>

            <div className={`pb-4 flex-1 ${isLast ? 'pb-0' : ''}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 rounded text-xs font-medium border ${actionColor}`}>
                  {actionLabel}
                </span>
                {hasStatusChange && (
                  <>
                    <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[record.fromStatus || ''] || 'bg-gray-50 text-gray-600'}`}>
                      {resolveStatusLabel(record.fromStatus)}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[record.toStatus || ''] || 'bg-gray-50 text-gray-600'}`}>
                      {resolveStatusLabel(record.toStatus)}
                    </span>
                  </>
                )}
                <span className="text-xs text-gray-400">
                  {new Date(record.operatedAt).toLocaleString()}
                </span>
                {record.operatedBy && (
                  <span className="text-xs text-gray-500">
                    by {resolveUser(record.operatedBy)}
                  </span>
                )}
              </div>

              {hasAssignmentChange && (
                <div className="ml-1 text-xs space-y-0.5">
                  {record.fromControllerId !== record.toControllerId && (
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500 w-16">接力棒</span>
                      <span className="text-gray-600">{resolveUser(record.fromControllerId)}</span>
                      <span className="text-gray-400 mx-1">→</span>
                      <span className="font-medium text-gray-800">{resolveUser(record.toControllerId)}</span>
                    </div>
                  )}
                  {record.fromDepartmentId !== record.toDepartmentId && (
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500 w-16">部门</span>
                      <span className="text-gray-600">{resolveDept(record.fromDepartmentId)}</span>
                      <span className="text-gray-400 mx-1">→</span>
                      <span className="font-medium text-gray-800">{resolveDept(record.toDepartmentId)}</span>
                    </div>
                  )}
                  {record.fromAssigneeId !== record.toAssigneeId && (
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500 w-16">负责人</span>
                      <span className="text-gray-600">{resolveUser(record.fromAssigneeId)}</span>
                      <span className="text-gray-400 mx-1">→</span>
                      <span className="font-medium text-gray-800">{resolveUser(record.toAssigneeId)}</span>
                    </div>
                  )}
                  {record.fromAssignerId !== record.toAssignerId && (
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500 w-16">指派人</span>
                      <span className="text-gray-600">{resolveUser(record.fromAssignerId)}</span>
                      <span className="text-gray-400 mx-1">→</span>
                      <span className="font-medium text-gray-800">{resolveUser(record.toAssignerId)}</span>
                    </div>
                  )}
                </div>
              )}

              {!hasAssignmentChange && !hasStatusChange && (
                <div className="ml-1 text-xs text-gray-400">
                  {record.action === 'CREATE' ? '项目/任务已创建' : '无变化'}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
