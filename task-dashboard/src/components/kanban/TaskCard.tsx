import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Task } from '../../types';
import { Clock, Info, User } from 'lucide-react';
import { hasAnyPermission, TASK_STATUS_LABELS, TASK_CATEGORY_LABELS } from '../../utils/constants';

interface TaskCardProps {
  task: Task;
  index: number;
  onClick: (task: Task) => void;
  canClick?: boolean;
  tooltip?: string;
  isInfoOpen?: boolean;
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
  typeDisplayName?: string;
  departmentName?: string;
  unitName?: string;
  createdDepartmentName?: string;
  showActions?: boolean;
}

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

function getCurrentWorkload(task: Task): { workload: number; unit: string } | null {
  if (!task.statusWorkloads || !task.workload || task.workload <= 0) return null;
  try {
    const parsed = JSON.parse(task.statusWorkloads);
    const stageOrder = ['PENDING', 'ASSIGNED', 'RECEIVED', 'IN_PROGRESS', 'SUBMITTED_FOR_QA', 'QA_COMPLETING', 'QA_COMPLETED'];
    let lastNonZeroStage: string | null = null;
    let lastNonZeroWorkload = 0;
    for (const stage of stageOrder) {
      const val = parsed[stage] ?? 0;
      if (val > 0.001) {
        lastNonZeroStage = stage;
        lastNonZeroWorkload = val;
      }
    }
    if (!lastNonZeroStage || lastNonZeroWorkload <= 0) return null;
    if (lastNonZeroStage === 'IN_PROGRESS') {
      const ipCompleted = task.inProgressCompletedWorkload ?? 0;
      if (ipCompleted > 0.001) {
        return { workload: ipCompleted, unit: task.workloadUnit || '' };
      }
    }
    return { workload: lastNonZeroWorkload, unit: task.workloadUnit || '' };
  } catch {
    return null;
  }
}

const buildTooltip = (task: Task, typeDisplayName?: string, departmentName?: string, createdDepartmentName?: string, userNameById?: Record<string, string>) => {
  const assigneeName = task.assigneeId ? (userNameById?.[task.assigneeId] || task.assigneeId) : '-';
  const lines = [
    `名称: ${task.name}`,
    `类型: ${typeDisplayName || task.type || '-'}`,
    `分类: ${TASK_CATEGORY_LABELS[task.category ?? ''] || task.category || '-'}`,
    `状态: ${TASK_STATUS_LABELS[task.status ?? ''] || task.status || '-'}`,
    `优先级: ${task.priority}`,
    `负责人: ${assigneeName}`,
    `父任务ID: ${task.parentTaskId ?? '-'}`,
    `责任部门: ${departmentName || (task.departmentId ?? '-')}`,
    `创建部门: ${createdDepartmentName || (task.createdDepartmentId ?? '-')}`,
    `创建人: ${task.createdByName ?? '-'}`,
    `创建时间: ${task.createdAt ?? '-'}`,
    `计划完成: ${task.plannedDueAt ?? '-'}`,
    `进度: ${task.progress ?? '-'}`,
  ];
  return lines.join('\n');
};

export const TaskCard: React.FC<TaskCardProps> = ({
  task, onClick, canClick = true, tooltip, isInfoOpen = false,
  onToggleInfo, onCloseInfo, userNameById = {},
  onReceive, onAssign, onDecompose, onRevokeAssignment, onRequestUndoReceive, onCancelUndoReceive, onApproveUndoReceive,
  onStartProgress, onSubmitCompletion, onSubmitQa, onAcceptQa, onQaApprove, onQaReject, onRevokeQa,
  onViewAssignAttachments, onViewSubmitQaAttachments,
  currentUserId, currentUserDepartmentId, userAuthorities = [], actionLoading = false,
  typeDisplayName, departmentName, unitName,
  createdDepartmentName,
  showActions = true,
}) => {
  const [infoAnchor, setInfoAnchor] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [popupStyle, setPopupStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const infoButtonRef = useRef<HTMLButtonElement | null>(null);
  const infoPopupRef = useRef<HTMLDivElement | null>(null);
  const infoText = tooltip ?? buildTooltip(task, typeDisplayName, departmentName, createdDepartmentName, userNameById);
  const infoLines = useMemo(() => infoText.split('\n'), [infoText]);

  const isLeaf = !task.hasChildren;
  const isExternal = !!task.externalSystem;
  const isMultiSwimlane = !!task._cardKey;
  const isMainStatus = task._isMainStatus !== false;
  const isNonLeaf = !!task._isNonLeaf;

  const canExecute = hasAnyPermission(userAuthorities, 'task:execute');
  const canCreateProject = hasAnyPermission(userAuthorities, 'project:create');
  const canCreateTask = hasAnyPermission(userAuthorities, 'task:create');
  const isAssigner = task.assignerId === currentUserId;
  const isController = !!(currentUserId && task.controllerId && task.controllerId === currentUserId);

  const canManage = hasAnyPermission(userAuthorities, 'department:manager');

  const isProject = task.category === 'PROJECT';
  const hasAssignee = !!task.assigneeId;
  const hasOperators = Array.isArray(task.operatorIds) && task.operatorIds.length > 0;
  const isAssignedUser = currentUserId && (
    (hasAssignee && task.assigneeId === currentUserId) ||
    (hasOperators && task.operatorIds!.includes(currentUserId))
  );
  const isSameDepartment = currentUserDepartmentId && task.departmentId && currentUserDepartmentId === task.departmentId;

  const canReceiveTask = isProject
    ? (hasAssignee ? isAssignedUser : (isSameDepartment && (canManage || canCreateProject)))
    : (hasAssignee ? isAssignedUser : (hasOperators ? isAssignedUser : isSameDepartment));
  const canReceiveByPermission = isProject ? canCreateProject : (canCreateProject || canCreateTask);

  const swStatus = task._swStatus || task.status;
  const showReceive = isLeaf && !isExternal && isMainStatus && swStatus === 'ASSIGNED' && canReceiveByPermission && canReceiveTask;
  const isReceiver = currentUserId && task.assigneeId === currentUserId;
  const isUndoRequested = !!task.undoRequestedAt && task.status === 'RECEIVED';
  const canCancelUndoReceive = isLeaf && !isExternal && isMainStatus && isUndoRequested && isReceiver;
  const canApproveUndoReceive = isLeaf && !isExternal && isMainStatus && isUndoRequested && isAssigner && task.canUndoReceive !== false;
  const showAssign = isLeaf && !isExternal && isMainStatus && !isUndoRequested && (
    (swStatus === 'PENDING' || task.status === 'RECEIVED') &&
    isController
  );
  const showDecompose = isLeaf && !isExternal && isMainStatus && !isUndoRequested && (
    (swStatus === 'PENDING' || task.status === 'RECEIVED') && isController
  );
  const showRevoke = isLeaf && !isExternal && isMainStatus && swStatus === 'ASSIGNED' && isAssigner && task.canRevokeAssignment !== false;
  const canDirectUndoReceive = isLeaf && !isExternal && isMainStatus && task.status === 'RECEIVED' && isAssigner && !task.undoRequestedAt && task.canUndoReceive !== false;
  const canRequestUndoReceive = isLeaf && !isExternal && isMainStatus && task.status === 'RECEIVED' && isReceiver && !isAssigner && canReceiveByPermission && !task.undoRequestedAt && task.canUndoReceive !== false;
  const showStartProgress = isLeaf && !isExternal && isMainStatus && task.status === 'RECEIVED' && isReceiver && canExecute && !isUndoRequested;
  const inProgressWorkload = (() => {
    try {
      if (!task.statusWorkloads) return 0;
      const sw = JSON.parse(task.statusWorkloads);
      return sw.IN_PROGRESS ?? 0;
    } catch { return 0; }
  })();
  const inProgressCompletedWorkload = task.inProgressCompletedWorkload ?? 0;
  const isFullyCompleted = inProgressWorkload > 0 && Math.abs(inProgressCompletedWorkload - inProgressWorkload) < 0.01;

  const showSubmitCompletion = isLeaf && !isExternal && isReceiver && swStatus === 'IN_PROGRESS' && !isFullyCompleted;
  const showSubmitQa = isLeaf && !isExternal && isReceiver && swStatus === 'IN_PROGRESS' && isFullyCompleted;
  const canQualityCheck = hasAnyPermission(userAuthorities, 'quality:check');
  const showAcceptQa = isLeaf && !isExternal && canQualityCheck && swStatus === 'SUBMITTED_FOR_QA';
  const showRevokeQa = isLeaf && !isExternal && isReceiver && swStatus === 'SUBMITTED_FOR_QA';
  const showQaApprove = isLeaf && !isExternal && canQualityCheck && swStatus === 'QA_COMPLETING';
  const showQaReject = isLeaf && !isExternal && canQualityCheck && swStatus === 'QA_COMPLETING';
  const showQIcon = task.status === 'SUBMITTED_FOR_QA' || task.status === 'QA_COMPLETING';

  const showViewAssignAtts = isLeaf && !isExternal && isReceiver && (task.assignAttachmentCount ?? 0) > 0 && ['RECEIVED', 'IN_PROGRESS', 'SUBMITTED_FOR_QA'].includes(task.status || '');
  const showViewSubmitQaAtts = isLeaf && !isExternal && canQualityCheck && (task.submitQaAttachmentCount ?? 0) > 0 && (swStatus === 'QA_COMPLETING');

  const showActionButtons = showActions && !isNonLeaf && (showReceive || showAssign || showDecompose || showRevoke || canDirectUndoReceive || canRequestUndoReceive || canCancelUndoReceive || canApproveUndoReceive || showStartProgress || showSubmitCompletion || showSubmitQa || showAcceptQa || showQaApprove || showQaReject || showRevokeQa || showViewAssignAtts || showViewSubmitQaAtts);

  const assigneeDisplay = useMemo(() => {
    const ids = Array.isArray(task.operatorIds) && task.operatorIds.length > 0
      ? task.operatorIds
      : (Array.isArray(task.inspectorIds) && task.inspectorIds.length > 0 ? task.inspectorIds : (task.assigneeId ? [task.assigneeId] : []));
    if (!ids.length) return '项目所有参与人员';
    const firstName = userNameById[ids[0]] || ids[0];
    return ids.length === 1 ? firstName : `${firstName}等${ids.length}人`;
  }, [task.assigneeId, task.inspectorIds, task.operatorIds, userNameById]);

  useEffect(() => {
    if (!isInfoOpen) return;
    const updatePosition = () => {
      const rect = infoButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setInfoAnchor({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isInfoOpen]);

  useEffect(() => {
    if (!isInfoOpen || !infoAnchor) return;
    const width = 280;
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const left = Math.min(infoAnchor.left, maxLeft);
    const top = infoAnchor.top + infoAnchor.height + 8;
    setPopupStyle({ top, left, width });
  }, [infoAnchor, isInfoOpen]);

  useEffect(() => {
    if (!isInfoOpen || !popupStyle || !infoAnchor) return;
    const popup = infoPopupRef.current;
    if (!popup) return;
    const rect = popup.getBoundingClientRect();
    const padding = 8;
    let nextTop = popupStyle.top;
    let nextLeft = popupStyle.left;
    const maxRight = window.innerWidth - padding;
    const maxBottom = window.innerHeight - padding;
    if (rect.right > maxRight) nextLeft = Math.max(padding, nextLeft - (rect.right - maxRight));
    if (rect.left < padding) nextLeft = padding;
    if (rect.bottom > maxBottom) {
      const aboveTop = infoAnchor.top - rect.height - 8;
      nextTop = aboveTop >= padding ? aboveTop : Math.max(padding, nextTop - (rect.bottom - maxBottom));
    }
    if (rect.top < padding) nextTop = padding;
    if (nextTop !== popupStyle.top || nextLeft !== popupStyle.left) {
      setPopupStyle({ ...popupStyle, top: nextTop, left: nextLeft });
    }
  }, [infoAnchor, isInfoOpen, popupStyle]);

  useEffect(() => {
    if (!isInfoOpen) return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const inButton = infoButtonRef.current?.contains(target);
      const inPopup = infoPopupRef.current?.contains(target);
      if (!inButton && !inPopup) onCloseInfo?.();
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isInfoOpen, onCloseInfo]);

  const renderWorkloadDisplay = () => {
    if (isNonLeaf) {
      const aggUnit = task._aggregatedUnit;
      const leafCount = task._leafCount || 0;
      if (aggUnit) {
        const aggUnitName = unitName || aggUnit;
        return (
          <div className="text-xs text-gray-600 font-medium">
            {task._swWorkload?.toFixed(1) || '0'} {aggUnitName}
          </div>
        );
      }
      return (
        <div className="text-xs text-gray-600 font-medium">
          {leafCount} 个叶子任务
        </div>
      );
    }

    if (isMultiSwimlane && task._swWorkload != null) {
      const swUnitName = unitName || task.workloadUnit || '';
      return (
        <div className="text-xs text-gray-600 font-medium">
          {task._swWorkload.toFixed(1)} {swUnitName}
        </div>
      );
    }

    const currentWorkload = getCurrentWorkload(task);
    if (isLeaf && currentWorkload) {
      return (
        <div className="text-xs text-gray-600 font-medium">
          {currentWorkload.workload.toFixed(1)} {unitName || currentWorkload.unit}
          <span className="text-gray-400 ml-1">({STATUS_LABELS[task.status] || (task.status || '状态未定')})</span>
        </div>
      );
    }
    return null;
  };

  const showName = !isLeaf || !isMultiSwimlane || isMainStatus;

  return (
    <div
      onClick={() => { if (canClick) onClick(task); }}
      className={`relative bg-white p-4 rounded-lg shadow-sm mb-3 border border-gray-200 hover:shadow-md transition-shadow ${
        canClick ? 'cursor-pointer' : 'cursor-default'
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
          {showName ? task.name : null}
          {showQIcon && showName && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-cyan-100 text-cyan-700 text-xs font-bold" title="质检中">
              Q
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <button
            ref={infoButtonRef}
            className="text-gray-400 hover:text-gray-700"
            onClick={(event) => {
              event.stopPropagation();
              const rect = infoButtonRef.current?.getBoundingClientRect();
              if (rect) setInfoAnchor({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
              onToggleInfo?.(task._cardKey || task.id);
            }}
            aria-label="查看详情"
          >
            <Info size={14} />
          </button>
        </div>
      </div>

      {renderWorkloadDisplay()}

      <div className="flex items-center text-xs text-gray-500 space-x-4 mt-3">
        <div className="flex items-center">
          <User size={14} className="mr-1" />
          <span>{assigneeDisplay}</span>
        </div>
        {task.plannedDueAt && (
          <div className="flex items-center">
            <Clock size={14} className="mr-1" />
            <span>{new Date(task.plannedDueAt).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      {showActionButtons && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
          {showReceive && (
            <button
              className="px-3 py-1 text-xs font-medium rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              disabled={actionLoading}
              onClick={(e) => { e.stopPropagation(); onReceive?.(task); }}
            >
              接收
            </button>
          )}
          {showAssign && (
            <button
              className="px-3 py-1 text-xs font-medium rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50"
              disabled={actionLoading}
              onClick={(e) => { e.stopPropagation(); onAssign?.(task); }}
            >
              指派
            </button>
          )}
          {showDecompose && (
            <button
              className="px-3 py-1 text-xs font-medium rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              disabled={actionLoading}
              onClick={(e) => { e.stopPropagation(); onDecompose?.(task); }}
            >
              分解
            </button>
          )}
          {showRevoke && (
            <button
              className="px-3 py-1 text-xs font-medium rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
              disabled={actionLoading}
              onClick={(e) => { e.stopPropagation(); onRevokeAssignment?.(task); }}
            >
              撤销
            </button>
          )}
          {canDirectUndoReceive && (
            <button
              className="px-3 py-1 text-xs font-medium rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
              disabled={actionLoading}
              onClick={(e) => { e.stopPropagation(); onRequestUndoReceive?.(task); }}
            >
              撤销
            </button>
          )}
          {canRequestUndoReceive && (
            <button
              className="px-3 py-1 text-xs font-medium rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              disabled={actionLoading}
              onClick={(e) => { e.stopPropagation(); onRequestUndoReceive?.(task); }}
            >
              申请撤销
            </button>
          )}
          {canCancelUndoReceive && (
            <button
              className="px-3 py-1 text-xs font-medium rounded-md bg-gray-50 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              disabled={actionLoading}
              onClick={(e) => { e.stopPropagation(); onCancelUndoReceive?.(task); }}
            >
              取消撤销
            </button>
          )}
          {canApproveUndoReceive && (
            <button
              className="px-3 py-1 text-xs font-medium rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
              disabled={actionLoading}
              onClick={(e) => { e.stopPropagation(); onApproveUndoReceive?.(task); }}
            >
              同意撤销
            </button>
          )}
          {showStartProgress && (
            <button
              className="px-3 py-1 text-xs font-medium rounded-md bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
              disabled={actionLoading}
              onClick={(e) => { e.stopPropagation(); onStartProgress?.(task); }}
            >
              开始处理
            </button>
          )}
          {showSubmitCompletion && (
            <button
              className="px-3 py-1 text-xs font-medium rounded-md bg-cyan-50 text-cyan-700 hover:bg-cyan-100 disabled:opacity-50"
              disabled={actionLoading}
              onClick={(e) => { e.stopPropagation(); onSubmitCompletion?.(task); }}
            >
              输入完成量
            </button>
          )}
          {showSubmitQa && (
            <button
              className="px-3 py-1 text-xs font-medium rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              disabled={actionLoading}
              onClick={(e) => { e.stopPropagation(); onSubmitQa?.(task); }}
            >
              提交质检
            </button>
          )}
          {showAcceptQa && (
            <button
              className="px-3 py-1 text-xs font-medium rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              disabled={actionLoading}
              onClick={(e) => { e.stopPropagation(); onAcceptQa?.(task); }}
            >
              接收
            </button>
          )}
          {showRevokeQa && (
            <button
              className="px-3 py-1 text-xs font-medium rounded-md bg-yellow-50 text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"
              disabled={actionLoading}
              onClick={(e) => { e.stopPropagation(); onRevokeQa?.(task); }}
            >
              撤销
            </button>
          )}
          {showQaApprove && (
            <button
              className="px-3 py-1 text-xs font-medium rounded-md bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
              disabled={actionLoading}
              onClick={(e) => { e.stopPropagation(); onQaApprove?.(task); }}
            >
              通过
            </button>
          )}
          {showQaReject && (
            <button
              className="px-3 py-1 text-xs font-medium rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
              disabled={actionLoading}
              onClick={(e) => { e.stopPropagation(); onQaReject?.(task); }}
            >
              不通过
            </button>
          )}
          {showViewAssignAtts && (
            <button
              className="px-3 py-1 text-xs font-medium rounded-md bg-gray-50 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              onClick={(e) => { e.stopPropagation(); onViewAssignAttachments?.(task); }}
            >
              📎 交付资料 ({task.assignAttachmentCount})
            </button>
          )}
          {showViewSubmitQaAtts && (
            <button
              className="px-3 py-1 text-xs font-medium rounded-md bg-gray-50 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              onClick={(e) => { e.stopPropagation(); onViewSubmitQaAttachments?.(task); }}
            >
              📎 质检资料 ({task.submitQaAttachmentCount})
            </button>
          )}
        </div>
      )}

      {isInfoOpen && popupStyle && (
        <div
          ref={infoPopupRef}
          className="fixed z-50 max-w-[70vw] max-h-[70vh] overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs text-gray-700 space-y-1 select-text whitespace-pre-wrap break-words cursor-text"
          style={popupStyle}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {infoLines.map((line, idx) => (
            <div key={`${task.id}-info-${idx}`} className="leading-5">{line}</div>
          ))}
        </div>
      )}
    </div>
  );
};
