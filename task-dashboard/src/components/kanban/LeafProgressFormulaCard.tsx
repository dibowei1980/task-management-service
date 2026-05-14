import React, { useMemo } from 'react';
import { Task } from '../../types';
import { statusWorkloadService } from '../../services/statusWorkloadService';

const STAGE_WEIGHTS: Record<string, { weight: number; label: string }> = {
  IN_PROGRESS: { weight: 0, label: '进行中(剩余)' },
  IN_PROGRESS_COMPLETED: { weight: -1, label: '可提交质检' },
  SUBMITTED_FOR_QA: { weight: 0.95, label: '待质检' },
  QA_COMPLETING: { weight: 0.95, label: '质检中' },
  QA_COMPLETED: { weight: 1.0, label: '质检完成' },
};

interface LeafProgressFormulaCardProps {
  task: Task;
  unitName?: string;
}

const LeafProgressFormulaCard: React.FC<LeafProgressFormulaCardProps> = ({ task, unitName }) => {
  const sw = useMemo(() => statusWorkloadService.parseStatusWorkloads(task), [task]);
  const totalWorkload = task.workload ?? 0;
  const wIp = task.inProgressWeight ?? 0.95;

  const rows = useMemo(() => {
    const ipCompleted = task.inProgressCompletedWorkload ?? 0;

    const result: Array<{
      stage: string;
      label: string;
      workload: number;
      weight: number;
      weightLabel: string;
      contribution: number;
      isImplicit?: boolean;
    }> = [];

    for (const [stage, info] of Object.entries(STAGE_WEIGHTS)) {
      let wl: number;
      let weightToUse: number;

      if (stage === 'IN_PROGRESS_COMPLETED') {
        wl = ipCompleted;
        weightToUse = wIp;
      } else if (stage === 'IN_PROGRESS') {
        const inProgressWl = sw.IN_PROGRESS ?? 0;
        wl = inProgressWl - ipCompleted;
        weightToUse = 0;
      } else {
        wl = sw[stage] ?? 0;
        weightToUse = info.weight;
      }

      if (wl < 0.001) continue;

      const weightLabel = stage === 'IN_PROGRESS_COMPLETED'
        ? `w_ip=${wIp}`
        : String(weightToUse);

      result.push({
        stage,
        label: info.label,
        workload: wl,
        weight: weightToUse,
        weightLabel,
        contribution: wl * weightToUse,
        isImplicit: stage === 'IN_PROGRESS_COMPLETED',
      });
    }

    return result;
  }, [sw, task.inProgressCompletedWorkload, wIp]);

  const totalContribution = rows.reduce((sum, r) => sum + r.contribution, 0);
  const calculatedProgress = totalWorkload > 0
    ? Math.round((totalContribution / totalWorkload) * 100)
    : 0;

  const formatWl = (v: number) => {
    if (v === Math.floor(v)) return String(Math.floor(v));
    return v.toFixed(1);
  };

  const unit = unitName || task.workloadUnit || '';

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-gray-700">叶子节点进度</span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">加权公式</span>
      </div>

      <div className="text-xs text-gray-500 mb-3 font-mono bg-gray-50 rounded px-2 py-1.5">
        进度 = (IN_PROGRESS_COMPLETED×w_ip + SUBMITTED_FOR_QA×0.95 + QA_COMPLETING×0.95 + QA_COMPLETED×1.0) / 总工作量
      </div>

      <div className="text-xs text-gray-400 mb-3">
        w_ip = {wIp}（可提交质检权重：已完成但未提交质检的工作量，视为应提交但暂未提交，权重接近 0.95）
        {totalWorkload > 0 && ` | 总工作量 = ${formatWl(totalWorkload)} ${unit}`}
      </div>

      <div className="space-y-1.5">
        <div className="grid text-xs text-gray-500 font-medium" style={{ gridTemplateColumns: '1fr 72px 56px 72px' }}>
          <span>状态</span>
          <span className="text-right">工作量</span>
          <span className="text-right">权重</span>
          <span className="text-right">贡献值</span>
        </div>
        {rows.map(row => (
          <div
            key={row.stage}
            className={`grid text-xs items-center ${row.isImplicit ? 'text-blue-600 italic' : 'text-gray-700'}`}
            style={{ gridTemplateColumns: '1fr 72px 56px 72px' }}
          >
            <span>{row.label}</span>
            <span className="text-right">{formatWl(row.workload)} {unit}</span>
            <span className="text-right font-mono">{row.weightLabel}</span>
            <span className="text-right font-mono">{row.contribution.toFixed(1)}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-sm">
        <span className="text-gray-500">
          贡献值合计 / 总工作量 = {totalContribution.toFixed(1)} / {formatWl(totalWorkload)}
        </span>
        <span className="font-semibold text-gray-900">{calculatedProgress}%</span>
      </div>
      {task.progress != null && task.progress !== calculatedProgress && (
        <div className="text-xs text-blue-600 mt-1">
          当前记录进度 {task.progress}%，与计算值不一致（可能因四舍五入或延迟更新）
        </div>
      )}
    </div>
  );
};

export default LeafProgressFormulaCard;
