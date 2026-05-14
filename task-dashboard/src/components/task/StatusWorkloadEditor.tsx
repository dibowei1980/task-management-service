import React, { useState, useEffect, useCallback } from 'react';
import { Task } from '../../types';
import { taskService } from '../../services/taskService';
import { statusWorkloadService } from '../../services/statusWorkloadService';
import { useProjectTypeStore } from '../../hooks/useProjectTypeStore';

const LEAF_STAGES = [
  { key: 'PENDING', label: '待处理', color: '#94a3b8' },
  { key: 'ASSIGNED', label: '待接收', color: '#60a5fa' },
  { key: 'RECEIVED', label: '已接收', color: '#818cf8' },
  { key: 'IN_PROGRESS', label: '进行中', color: '#fbbf24' },
  { key: 'SUBMITTED_FOR_QA', label: '待质检', color: '#f97316' },
  { key: 'QA_COMPLETING', label: '质检中', color: '#2dd4bf' },
  { key: 'QA_COMPLETED', label: '质检完成', color: '#34d399' },
];

interface StatusWorkloadEditorProps {
  task: Task;
  onUpdated?: (task: Task) => void;
  readOnly?: boolean;
}

export const StatusWorkloadEditor: React.FC<StatusWorkloadEditorProps> = ({ task, onUpdated, readOnly }) => {
  const { getUnitName } = useProjectTypeStore();
  const [workloads, setWorkloads] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (task.statusWorkloads) {
      try {
        const parsed = JSON.parse(task.statusWorkloads);
        const map: Record<string, number> = {};
        for (const s of LEAF_STAGES) {
          map[s.key] = parsed[s.key] ?? 0;
        }
        setWorkloads(map);
      } catch {
        const map: Record<string, number> = {};
        for (const s of LEAF_STAGES) {
          map[s.key] = 0;
        }
        map['PENDING'] = task.workload ?? 0;
        setWorkloads(map);
      }
    } else {
      const map: Record<string, number> = {};
      for (const s of LEAF_STAGES) {
        map[s.key] = 0;
      }
      map['PENDING'] = task.workload ?? 0;
      setWorkloads(map);
    }
  }, [task.statusWorkloads, task.workload]);

  const totalWorkload = task.workload ?? 0;
  const currentSum = Object.values(workloads).reduce((a, b) => a + b, 0);

  const handleStageChange = useCallback((stageKey: string, value: string) => {
    const numVal = parseFloat(value) || 0;
    setError(null);
    setWorkloads(prev => {
      try {
        return statusWorkloadService.applyWaterfall(prev, stageKey, numVal, totalWorkload);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '状态工作量调整失败';
        setError(msg);
        return prev;
      }
    });
  }, [totalWorkload]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await taskService.updateStatusWorkloads(task.id, workloads);
      onUpdated?.(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '保存失败';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [task.id, workloads, onUpdated]);

  const isLeaf = !task.hasChildren;

  if (!isLeaf) {
    return (
      <div className="text-sm text-gray-500 italic">
        非叶子节点不支持直接设置状态工作量
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700">状态工作量分布</h4>
        <span className="text-xs text-gray-400">
          总工作量: {totalWorkload} {task.workloadUnit ? getUnitName(task.workloadUnit) : ''}
        </span>
      </div>

      <div className="w-full h-6 rounded-full overflow-hidden flex bg-gray-100">
        {LEAF_STAGES.map(stage => {
          const val = workloads[stage.key] ?? 0;
          const pct = totalWorkload > 0 ? (val / totalWorkload) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <div
              key={stage.key}
              style={{ width: `${pct}%`, backgroundColor: stage.color }}
              className="h-full transition-all duration-300 relative group"
              title={`${stage.label}: ${val} (${pct.toFixed(1)}%)`}
            >
              {pct > 12 && (
                <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white font-medium truncate px-1">
                  {val}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {LEAF_STAGES.map(stage => {
          const val = workloads[stage.key] ?? 0;
          const pct = totalWorkload > 0 ? (val / totalWorkload) * 100 : 0;
          return (
            <div key={stage.key} className="flex items-center gap-2 text-sm">
              <span
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: stage.color }}
              />
              <span className="text-gray-600 w-16 truncate">{stage.label}</span>
              {readOnly ? (
                <span className="text-gray-800 font-mono text-xs">
                  {val} ({pct.toFixed(0)}%)
                </span>
              ) : (
                <input
                  type="number"
                  min={0}
                  max={totalWorkload}
                  step={0.1}
                  value={val || ''}
                  onChange={e => handleStageChange(stage.key, e.target.value)}
                  className="w-20 px-1.5 py-0.5 border rounded text-xs font-mono
                    focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0"
                />
              )}
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <>
          {Math.abs(currentSum - totalWorkload) > 0.01 && (
            <div className="text-xs text-amber-600">
              ⚠ 当前合计 {currentSum.toFixed(1)}，与总工作量 {totalWorkload} 不一致，请调整后再保存
            </div>
          )}

          {error && (
            <div className="text-xs text-red-600">{error}</div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded
                hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? '保存中...' : '保存工作量'}
            </button>
          </div>
        </>
      )}

      <div className="text-xs text-gray-400">
        IN_PROGRESS 权重: {task.inProgressWeight ?? 0.95}
      </div>
    </div>
  );
};
