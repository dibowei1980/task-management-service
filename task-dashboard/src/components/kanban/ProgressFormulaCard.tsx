import React from 'react';
import { Task } from '../../types';

interface ProgressFormulaCardProps {
  node: Task;
  children: Task[];
}

const ProgressFormulaCard: React.FC<ProgressFormulaCardProps> = ({ node, children }) => {
  if (!node || children.length === 0) return null;

  const isHomogeneous = node.compositionMode === 'HOMOGENEOUS';
  const isHeterogeneous = node.compositionMode === 'HETEROGENEOUS';
  const inferredHomogeneous = !isHomogeneous && !isHeterogeneous
    && children.every(c => c.workloadUnit && c.workloadUnit === children[0].workloadUnit);
  const effectiveHomogeneous = isHomogeneous || inferredHomogeneous;

  const formulaLabel = effectiveHomogeneous
    ? '父进度 = Σ(子进度 × 子权重 × 子工作量) / Σ(子权重 × 子工作量)'
    : '父进度 = Σ(子进度 × 子权重) / Σ(子权重)';

  const rows = children.map(child => {
    const progress = child.progress ?? 0;
    const weight = child.weight ?? 1;
    const workload = child.workload;
    const contribution = effectiveHomogeneous && workload != null
      ? progress * weight * workload
      : progress * weight;
    const denominatorPart = effectiveHomogeneous && workload != null
      ? weight * workload
      : weight;
    return {
      id: child.id,
      name: child.name,
      progress,
      weight,
      hasExplicitWeight: child.weight != null,
      workload,
      contribution,
      denominatorPart,
    };
  });

  const totalContribution = rows.reduce((sum, r) => sum + r.contribution, 0);
  const totalDenominator = rows.reduce((sum, r) => sum + r.denominatorPart, 0);
  const calculatedProgress = totalDenominator > 0
    ? Math.round(totalContribution / totalDenominator)
    : 0;

  const missingWorkload = effectiveHomogeneous && rows.some(r => r.workload == null);
  const missingWeight = rows.some(r => !r.hasExplicitWeight);

  const childWorkloadSum = rows.reduce((sum, r) => sum + (r.workload ?? 0), 0);
  const parentWorkload = node.workload;
  const workloadMismatch = effectiveHomogeneous
    && parentWorkload != null
    && !missingWorkload
    && Math.abs(childWorkloadSum - parentWorkload) > 0.01;

  const alerts: Array<{ level: 'warn' | 'info'; message: string }> = [];
  if (missingWorkload) {
    alerts.push({ level: 'warn', message: '同质任务要求所有子任务填写工作量，当前存在缺失项，将按权重×进度近似计算' });
  }
  if (workloadMismatch) {
    alerts.push({ level: 'warn', message: `同质任务子任务工作量总和（${childWorkloadSum}）与父任务工作量（${parentWorkload}）不一致` });
  }
  if (missingWeight) {
    alerts.push({ level: 'info', message: '部分子任务未设置权重，将按默认值 1 参与计算' });
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-gray-700">进度汇聚</span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${effectiveHomogeneous ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
          {effectiveHomogeneous ? '同质公式' : '异质公式'}
        </span>
      </div>

      <div className="text-xs text-gray-500 mb-3 font-mono bg-gray-50 rounded px-2 py-1.5">
        {formulaLabel}
      </div>

      {alerts.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {alerts.map((alert, idx) => (
            <div
              key={idx}
              className={`text-xs rounded px-2 py-1.5 ${
                alert.level === 'warn'
                  ? 'text-amber-600 bg-amber-50'
                  : 'text-blue-600 bg-blue-50'
              }`}
            >
              {alert.level === 'warn' ? '⚠' : 'ℹ'} {alert.message}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <div className="grid text-xs text-gray-500 font-medium" style={{ gridTemplateColumns: '1fr 56px 48px 56px 72px' }}>
          <span>子任务</span>
          <span className="text-right">进度</span>
          <span className="text-right">权重</span>
          {effectiveHomogeneous && <span className="text-right">工作量</span>}
          <span className="text-right">贡献值</span>
        </div>
        {rows.map(row => (
          <div
            key={row.id}
            className="grid text-xs text-gray-700 items-center"
            style={{ gridTemplateColumns: `1fr 56px 48px ${effectiveHomogeneous ? '56px' : ''} 72px` }}
          >
            <span className="truncate pr-2" title={row.name}>{row.name}</span>
            <span className="text-right">{row.progress}%</span>
            <span className="text-right">
              {row.weight}
              {!row.hasExplicitWeight && <span className="text-gray-400 text-xs ml-0.5">*</span>}
            </span>
            {effectiveHomogeneous && (
              <span className={`text-right ${row.workload == null ? 'text-amber-500' : ''}`}>
                {row.workload != null ? row.workload : '缺失'}
              </span>
            )}
            <span className="text-right font-mono">{row.contribution.toFixed(1)}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-sm">
        <span className="text-gray-500">计算进度</span>
        <span className="font-semibold text-gray-900">{calculatedProgress}%</span>
      </div>
      {node.progress != null && node.progress !== calculatedProgress && (
        <div className="text-xs text-blue-600 mt-1">
          当前记录进度 {node.progress}%，与计算值不一致（可能因四舍五入或延迟更新）
        </div>
      )}
    </div>
  );
};

export default ProgressFormulaCard;
