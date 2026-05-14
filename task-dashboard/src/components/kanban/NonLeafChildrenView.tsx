import React from 'react';
import { Task } from '../../types';
import { TASK_CATEGORY_LABELS } from '../../utils/constants';
import { ColorProgressBar } from '../task/ColorProgressBar';

const STATUS_LABELS: Record<string, string> = {
  PENDING: '待处理',
  ASSIGNED: '待接收',
  RECEIVED: '已接收',
  IN_PROGRESS: '进行中',
  SUBMITTED_FOR_QA: '待质检',
  QA_COMPLETING: '质检中',
  QA_COMPLETED: '质检完成',
  COMPLETED: '已完成',
  PAUSED: '已暂停',
  FAILED: '失败',
};

const STATUS_BG: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  ASSIGNED: 'bg-amber-50 text-amber-700',
  RECEIVED: 'bg-blue-50 text-blue-700',
  IN_PROGRESS: 'bg-green-50 text-green-700',
  SUBMITTED_FOR_QA: 'bg-cyan-50 text-cyan-700',
  QA_COMPLETING: 'bg-cyan-50 text-cyan-700',
  QA_COMPLETED: 'bg-indigo-50 text-indigo-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  PAUSED: 'bg-red-50 text-red-700',
  FAILED: 'bg-red-50 text-red-700',
};

const CATEGORY_ICON: Record<string, string> = {
  PROJECT: '📁',
  PHASE: '📋',
  OPERATION_TASK: '⚙️',
  SYSTEM_TASK: '🖥️',
  SELF_CHECK_TASK: '✅',
};

interface NonLeafChildrenViewProps {
  children: Task[];
  userNameById?: Record<string, string>;
  onLeafClick: (task: Task) => void;
  getUnitName: (code: string) => string;
  getTypeDisplayName: (code: string | null | undefined, category?: string | null) => string;
  buildColorBarTask?: (task: Task) => Task;
}

export const NonLeafChildrenView: React.FC<NonLeafChildrenViewProps> = ({
  children,
  userNameById = {},
  onLeafClick,
  getUnitName,
  getTypeDisplayName,
  buildColorBarTask,
}) => {
  if (children.length === 0) {
    return (
      <div className="text-sm text-gray-400 py-6 text-center">暂无子任务</div>
    );
  }

  return (
    <div className="space-y-2">
      {children.map(child => {
        const isProject = child.category === 'PROJECT';
        const assigneeName = child.assigneeId
          ? (userNameById[child.assigneeId] || child.assigneeId)
          : '-';
        const unitName = child.workloadUnit ? getUnitName(child.workloadUnit) : undefined;
        const statusLabel = STATUS_LABELS[child.status] || child.status || '未知';
        const statusBg = STATUS_BG[child.status] || 'bg-gray-100 text-gray-700';
        const categoryLabel = TASK_CATEGORY_LABELS[child.category ?? ''] || child.category || '';
        const categoryIcon = CATEGORY_ICON[child.category ?? ''] || '';
        const typeDisplayName = getTypeDisplayName(child.type, child.category);
        const hasChildren = !!child.hasChildren;
        const colorBarTask = buildColorBarTask ? buildColorBarTask(child) : child;

        return (
          <div
            key={child.id}
            className={`rounded-lg border p-3 hover:shadow-md transition-all cursor-pointer group ${
              isProject
                ? 'bg-gradient-to-r from-blue-50/60 to-white border-blue-200 hover:border-blue-400'
                : 'bg-white border-gray-200 hover:border-blue-300'
            }`}
            onClick={() => onLeafClick(child)}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-sm" title={categoryLabel}>{categoryIcon}</span>
                <span className="text-sm font-medium text-gray-900 truncate" title={child.name}>
                  {child.name}
                </span>
                {hasChildren && (
                  <span className="text-xs text-gray-400 flex-shrink-0">▸</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBg}`}>
                  {statusLabel}
                </span>
                <span className="text-xs text-gray-500">
                  {child.progress != null ? `${child.progress}%` : '-'}
                </span>
              </div>
            </div>

            <ColorProgressBar
              task={colorBarTask}
              compact={true}
              isLeaf={!hasChildren}
              unitName={unitName}
            />

            <div className="flex items-center justify-between mt-1.5 text-xs text-gray-500">
              <div className="flex items-center gap-3">
                <span className="text-gray-400">{typeDisplayName}</span>
                {child.workload != null && (
                  <span>{child.workload} {unitName || child.workloadUnit || ''}</span>
                )}
                {child.weight != null && (
                  <span>权重 {child.weight}</span>
                )}
              </div>
              <span>{assigneeName}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
