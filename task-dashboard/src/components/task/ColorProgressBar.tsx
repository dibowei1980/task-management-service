import React, { useMemo, useState } from 'react';
import { Task } from '../../types';

const STATUS_GROUP_COLORS: Record<string, string> = {
  unassigned: '#94a3b8',
  pending: '#ef4444',
  inProgress: '#22c55e',
  inProgressCompleted: '#16a34a',
  qa: '#06b6d4',
  completed: '#3b82f6',
  paused: '#f87171',
  failed: '#ef4444',
};

const STATUS_GROUP_LABELS: Record<string, string> = {
  unassigned: '未指派',
  pending: '待处理',
  inProgress: '进行中',
  inProgressCompleted: '可提交质检',
  qa: '待质检',
  completed: '已完成',
  paused: '已暂停',
  failed: '失败',
};

function getStatusGroup(status: string): string {
  switch (status) {
    case 'PENDING': return 'unassigned';
    case 'ASSIGNED':
    case 'RECEIVED': return 'pending';
    case 'IN_PROGRESS': return 'inProgress';
    case 'SUBMITTED_FOR_QA':
    case 'QA_COMPLETING': return 'qa';
    case 'QA_COMPLETED':
    case 'COMPLETED':
    case 'ARCHIVED': return 'completed';
    case 'PAUSED': return 'paused';
    case 'FAILED': return 'failed';
    default: return 'unassigned';
  }
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: '待处理',
  ASSIGNED: '待接收',
  RECEIVED: '已接收',
  IN_PROGRESS: '进行中',
  SUBMITTED_FOR_QA: '待质检',
  QA_COMPLETING: '质检中',
  QA_COMPLETED: '质检完成',
  PENDING_ACCEPTANCE: '待验收',
  ACCEPTANCE_COMPLETED: '验收完成',
  ARCHIVED: '项目归档',
  COMPLETED: '已完成',
  PAUSED: '已暂停',
  FAILED: '失败',
};

interface Segment {
  group: string;
  color: string;
  label: string;
  value: number;
  workload: number;
  details: Array<{ status: string; label: string; workload: number; percent: number }>;
}

interface ColorProgressBarProps {
  task: Task;
  compact?: boolean;
  isLeaf?: boolean;
  unitName?: string;
}

export const ColorProgressBar: React.FC<ColorProgressBarProps> = ({ task, compact = false, isLeaf = true, unitName }) => {
  const [showDetail, setShowDetail] = useState(false);

  const segments = useMemo(() => {
    if (!task.statusWorkloads) {
      const statusKey = task.status || 'PENDING';
      const group = getStatusGroup(statusKey);
      return [{
        group,
        color: STATUS_GROUP_COLORS[group],
        label: STATUS_GROUP_LABELS[group],
        value: 100,
        workload: task.workload ?? 0,
        details: [{ status: statusKey, label: STATUS_LABELS[statusKey] || '状态未定', workload: task.workload ?? 0, percent: 100 }],
      }];
    }
    try {
      const parsed = JSON.parse(task.statusWorkloads);
      const total = task.workload ?? 0;
      if (total <= 0) return [];

      const groupMap = new Map<string, Segment>();

      const ipCompleted = task._inProgressCompletedWorkloadForBar ?? task.inProgressCompletedWorkload ?? 0;

      Object.entries(parsed)
        .filter(([, v]) => (v as number) > 0.001)
        .forEach(([k, v]) => {
          const wl = v as number;
          const percent = total > 0 ? (wl / total) * 100 : 0;

          if (k === 'IN_PROGRESS' && ipCompleted > 0.001) {
            const completedWorkload = Math.min(ipCompleted, wl);
            const remainingWorkload = Math.max(0, wl - completedWorkload);
            const completedPercent = total > 0 ? (completedWorkload / total) * 100 : 0;
            const remainingPercent = total > 0 ? (remainingWorkload / total) * 100 : 0;

            groupMap.set('inProgressCompleted', {
              group: 'inProgressCompleted',
              color: STATUS_GROUP_COLORS.inProgressCompleted,
              label: STATUS_GROUP_LABELS.inProgressCompleted,
              value: completedPercent,
              workload: completedWorkload,
              details: [{ status: 'IN_PROGRESS_COMPLETED', label: '可提交质检', workload: completedWorkload, percent: completedPercent }],
            });

            if (remainingPercent > 0.01) {
              groupMap.set('inProgress', {
                group: 'inProgress',
                color: STATUS_GROUP_COLORS.inProgress,
                label: STATUS_GROUP_LABELS.inProgress,
                value: remainingPercent,
                workload: remainingWorkload,
                details: [{ status: 'IN_PROGRESS', label: STATUS_LABELS.IN_PROGRESS || '进行中', workload: remainingWorkload, percent: remainingPercent }],
              });
            }
          } else {
            const group = getStatusGroup(k);
            if (!groupMap.has(group)) {
              groupMap.set(group, {
                group,
                color: STATUS_GROUP_COLORS[group],
                label: STATUS_GROUP_LABELS[group],
                value: 0,
                workload: 0,
                details: [],
              });
            }
            const seg = groupMap.get(group)!;
            seg.value += percent;
            seg.workload += wl;
            seg.details.push({ status: k, label: STATUS_LABELS[k] || k, workload: wl, percent });
          }
        });

      return Array.from(groupMap.values());
    } catch {
      const group = getStatusGroup(task.status);
      return [{
        group,
        color: STATUS_GROUP_COLORS[group],
        label: STATUS_GROUP_LABELS[group],
        value: 100,
        workload: task.workload ?? 0,
        details: [{ status: task.status, label: STATUS_LABELS[task.status] || task.status, workload: task.workload ?? 0, percent: 100 }],
      }];
    }
  }, [task.statusWorkloads, task.workload, task.status, task.inProgressCompletedWorkload, task._inProgressCompletedWorkloadForBar]);

  const formatWorkload = (wl: number) => {
    if (wl === Math.floor(wl)) return String(Math.floor(wl));
    return wl.toFixed(1);
  };

  return (
    <div className="space-y-1">
      <div
        className="w-full h-2.5 rounded-full overflow-hidden flex bg-gray-100 cursor-pointer"
        onClick={() => setShowDetail(!showDetail)}
      >
        {segments.map(seg => (
          <div
            key={seg.group}
            style={{ width: `${seg.value}%`, backgroundColor: seg.color }}
            className="h-full transition-all duration-300"
            title={`${seg.label}: ${seg.value.toFixed(1)}%`}
          />
        ))}
      </div>
      {!compact && (
        <div className="flex items-center gap-3 flex-wrap">
          {segments.map(seg => (
            <span key={seg.group} className="flex items-center gap-1 text-xs text-gray-500">
              <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: seg.color }} />
              {isLeaf ? (
                <>{seg.label} {seg.value.toFixed(0)}%</>
              ) : (
                <>{seg.label} {formatWorkload(seg.workload)}{unitName || task.workloadUnit ? ` ${unitName || task.workloadUnit}` : ''}</>
              )}
            </span>
          ))}
        </div>
      )}
      {showDetail && !compact && (
        <div className="bg-gray-50 rounded-lg p-2 text-xs text-gray-600 space-y-1 border border-gray-200">
          {segments.flatMap(seg =>
            seg.details.map(d => (
              <div key={d.status} className="flex justify-between">
                <span>{d.label}</span>
                <span>{formatWorkload(d.workload)} {unitName || task.workloadUnit || ''} ({d.percent.toFixed(1)}%)</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
