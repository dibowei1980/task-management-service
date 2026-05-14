import React from 'react';
import { Task, TaskColumn as ITaskColumn } from '../../types';
import { TaskCard } from './TaskCard';

interface TaskColumnProps {
  column: ITaskColumn;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  canClick?: (task: Task) => boolean;
  getTooltip?: (task: Task) => string;
  openInfoTaskId?: string | null;
  onToggleInfo?: (taskId: string) => void;
  onCloseInfo?: () => void;
  userNameById?: Record<string, string>;
  onReceive?: (task: Task) => void;
  onAssign?: (task: Task) => void;
  onDecompose?: (task: Task) => void;
  onRevokeAssignment?: (task: Task) => void;
  onRequestUndoReceive?: (task: Task) => void;
  onCancelUndoReceive?: (task: Task) => void;
  onApproveUndoReceive?: (task: Task) => void;
  onStartProgress?: (task: Task) => void;
  onSubmitCompletion?: (task: Task) => void;
  onSubmitQa?: (task: Task) => void;
  onAcceptQa?: (task: Task) => void;
  onQaApprove?: (task: Task) => void;
  onQaReject?: (task: Task) => void;
  onRevokeQa?: (task: Task) => void;
  onViewAssignAttachments?: (task: Task) => void;
  onViewSubmitQaAttachments?: (task: Task) => void;
  currentUserId?: string;
  currentUserDepartmentId?: string;
  userAuthorities?: string[];
  actionLoading?: boolean;
  getTypeDisplayName?: (code: string | null | undefined, category?: string | null) => string;
  getUnitName?: (code: string) => string;
  departmentNameMap?: Record<string, string>;
  hideCount?: boolean;
  showActions?: boolean;
}

export const TaskColumn: React.FC<TaskColumnProps> = ({
  column, tasks, onTaskClick, canClick, getTooltip,
  openInfoTaskId, onToggleInfo, onCloseInfo, userNameById,
  onReceive, onAssign, onDecompose, onRevokeAssignment, onRequestUndoReceive, onCancelUndoReceive, onApproveUndoReceive,
  onStartProgress, onSubmitCompletion, onSubmitQa, onAcceptQa, onQaApprove, onQaReject, onRevokeQa,
  onViewAssignAttachments, onViewSubmitQaAttachments,
  currentUserId, currentUserDepartmentId, userAuthorities, actionLoading,
  getTypeDisplayName, getUnitName, departmentNameMap,
  hideCount = false,
  showActions = true,
}) => {
  return (
    <div className="flex flex-col w-full min-w-0 bg-slate-50 rounded-xl border border-slate-200 h-full max-h-full">
      <div className="px-3 py-2 font-semibold text-slate-700 flex justify-between items-center border-b border-slate-200 bg-white/70 backdrop-blur rounded-t-xl">
        <h2 className="text-sm">{column.title}</h2>
        {!hideCount && (
          <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full">
            {tasks.length}
          </span>
        )}
      </div>

      <div className="flex-1 p-2 overflow-y-auto min-h-[140px]">
        {tasks.map((task, index) => (
          <TaskCard
            key={task._cardKey || task.id}
            task={task}
            index={index}
            onClick={onTaskClick}
            canClick={canClick ? canClick(task) : true}
            tooltip={getTooltip ? getTooltip(task) : undefined}
            isInfoOpen={openInfoTaskId === (task._cardKey || task.id)}
            onToggleInfo={onToggleInfo}
            onCloseInfo={onCloseInfo}
            userNameById={userNameById}
            onReceive={onReceive}
            onAssign={onAssign}
            onDecompose={onDecompose}
            onRevokeAssignment={onRevokeAssignment}
            onRequestUndoReceive={onRequestUndoReceive}
            onCancelUndoReceive={onCancelUndoReceive}
            onApproveUndoReceive={onApproveUndoReceive}
            onStartProgress={onStartProgress}
            onSubmitCompletion={onSubmitCompletion}
            onSubmitQa={onSubmitQa}
            onAcceptQa={onAcceptQa}
            onQaApprove={onQaApprove}
            onQaReject={onQaReject}
            onRevokeQa={onRevokeQa}
            onViewAssignAttachments={onViewAssignAttachments}
            onViewSubmitQaAttachments={onViewSubmitQaAttachments}
            currentUserId={currentUserId}
            currentUserDepartmentId={currentUserDepartmentId}
            userAuthorities={userAuthorities}
            actionLoading={actionLoading}
            typeDisplayName={getTypeDisplayName?.(task.type, task.category)}
            departmentName={task.departmentId ? departmentNameMap?.[task.departmentId] : undefined}
            unitName={task.workloadUnit ? getUnitName?.(task.workloadUnit) : undefined}
            createdDepartmentName={task.createdDepartmentId ? departmentNameMap?.[task.createdDepartmentId] : undefined}
            showActions={showActions}
          />
        ))}
      </div>
    </div>
  );
};
