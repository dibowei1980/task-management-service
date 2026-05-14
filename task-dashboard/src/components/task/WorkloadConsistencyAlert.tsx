import React from 'react';
import { Task } from '../../types';

interface WorkloadConsistencyAlertProps {
  parent: Task;
  children: Task[];
  getUnitName: (code: string) => string;
}

export const WorkloadConsistencyAlert: React.FC<WorkloadConsistencyAlertProps> = ({
  parent,
  children,
  getUnitName,
}) => {
  if (!parent || children.length === 0) return null;

  const isHomogeneous = parent.compositionMode === 'HOMOGENEOUS';
  const parentWorkload = parent.workload ?? 0;
  const unitName = getUnitName(parent.workloadUnit || '');

  const alerts: { level: 'warn' | 'error'; message: string }[] = [];

  if (isHomogeneous && parentWorkload > 0) {
    const childWorkloadSum = children.reduce((s, c) => s + (c.workload ?? 0), 0);
    const diff = Math.abs(childWorkloadSum - parentWorkload);
    if (diff > 0.01) {
      const isOver = childWorkloadSum > parentWorkload;
      alerts.push({
        level: isOver ? 'error' : 'warn',
        message: isOver
          ? `子任务工作量之和 (${childWorkloadSum.toFixed(2)} ${unitName}) 超出父任务工作量 (${parentWorkload.toFixed(2)} ${unitName})，超出 ${diff.toFixed(2)} ${unitName}`
          : `子任务工作量之和 (${childWorkloadSum.toFixed(2)} ${unitName}) 不足父任务工作量 (${parentWorkload.toFixed(2)} ${unitName})，差额 ${diff.toFixed(2)} ${unitName}`,
      });
    }
  }

  if (isHomogeneous) {
    const weights = children.map(c => c.weight ?? 1);
    const allSame = weights.every(w => Math.abs(w - weights[0]) < 0.001);
    if (!allSame && weights.length > 1) {
      alerts.push({
        level: 'warn',
        message: '同质子任务权重不一致，进度计算将按权重加权汇总',
      });
    }
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-1.5 mb-3">
      {alerts.map((alert, i) => (
        <div
          key={i}
          className={`flex items-start gap-2 px-3 py-2 rounded-md text-xs ${
            alert.level === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}
        >
          <span className="flex-shrink-0 mt-0.5">
            {alert.level === 'error' ? '⚠' : '💡'}
          </span>
          <span>{alert.message}</span>
        </div>
      ))}
    </div>
  );
};
