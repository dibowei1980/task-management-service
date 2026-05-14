import React, { useMemo, useState } from 'react';
import { Task } from '../../types';
import { taskService } from '../../services/taskService';
import { useProjectTypeStore } from '../../hooks/useProjectTypeStore';

interface Props {
  task: Task;
  onClose: () => void;
  onSubmitted: (updatedTask: Task) => void;
}

export const SubmitCompletionModal: React.FC<Props> = ({ task, onClose, onSubmitted }) => {
  const { getUnitName } = useProjectTypeStore();
  const unitDisplay = task.workloadUnit ? getUnitName(task.workloadUnit) : '';
  const [completedWorkload, setCompletedWorkload] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);

  const statusWorkloads = useMemo(() => {
    if (!task.statusWorkloads) return {} as Record<string, number>;
    try {
      return JSON.parse(task.statusWorkloads) as Record<string, number>;
    } catch {
      return {} as Record<string, number>;
    }
  }, [task.statusWorkloads]);

  const inProgressWorkload = statusWorkloads.IN_PROGRESS ?? task.workload ?? 0;
  const totalWorkload = task.workload ?? 0;
  const alreadyCompleted = task.inProgressCompletedWorkload ?? 0;

  const maxWorkload = inProgressWorkload - alreadyCompleted;
  const exceeded = completedWorkload !== '' && (alreadyCompleted + completedWorkload > inProgressWorkload + 0.01);

  const preview = useMemo(() => {
    if (completedWorkload === '' || completedWorkload <= 0) return null;
    const val = Math.min(completedWorkload, maxWorkload);
    return {
      inProgressRemaining: Math.max(0, inProgressWorkload - alreadyCompleted - val),
      totalCompleted: alreadyCompleted + val,
    };
  }, [completedWorkload, inProgressWorkload, alreadyCompleted, maxWorkload]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (completedWorkload === '' || completedWorkload <= 0) { alert('完成工作量必须大于 0'); return; }
    if (exceeded) { alert('累计完成量不能超过总工作量'); return; }

    setSubmitting(true);
    try {
      const updatedTask = await taskService.submitCompletion(task.id, { completedWorkload });
      onSubmitted(updatedTask);
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      alert(error?.response?.data?.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (n: number) => n === Math.floor(n) ? String(Math.floor(n)) : n.toFixed(1);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[440px]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">输入完成量</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">✕</button>
        </div>

        <div className="mb-4 p-3 bg-gray-50 rounded text-sm">
          <span className="font-medium">{task.name}</span>
          <div className="text-gray-500 mt-1">
            进行中工作量: {fmt(inProgressWorkload)} {unitDisplay} | 已完成: {fmt(alreadyCompleted)} {unitDisplay} | 剩余: {fmt(maxWorkload)} {unitDisplay}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              本次完成量<span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0.1"
                step="0.1"
                max={maxWorkload}
                value={completedWorkload}
                onChange={e => setCompletedWorkload(parseFloat(e.target.value) || '')}
                className="flex-1 border rounded p-2"
                required
                placeholder={`最多 ${fmt(maxWorkload)}`}
              />
              <span className="text-sm text-gray-500">{unitDisplay}</span>
            </div>
            {exceeded && (
              <p className="text-red-500 text-xs mt-1">累计完成量不能超过总工作量 ({fmt(totalWorkload)})</p>
            )}
          </div>

          {preview && !exceeded && (
            <div className="p-3 bg-blue-50 rounded border border-blue-200 text-sm space-y-1.5">
              <div className="font-medium text-blue-800 mb-1">完成量预览</div>
              <div className="flex justify-between items-center">
                <span className="text-blue-700">进行中（剩余）</span>
                <span className="font-mono">
                  <span className="text-gray-400 line-through">{fmt(inProgressWorkload - alreadyCompleted)}</span>
                  <span className="mx-1 text-blue-500">→</span>
                  <span className="text-blue-800 font-medium">{fmt(preview.inProgressRemaining)}</span> {unitDisplay}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-blue-700">累计完成</span>
                <span className="font-mono">
                  <span className="text-gray-400 line-through">{fmt(alreadyCompleted)}</span>
                  <span className="mx-1 text-blue-500">→</span>
                  <span className="text-blue-800 font-medium">{fmt(preview.totalCompleted)}</span> {unitDisplay}
                </span>
              </div>
              {Math.abs(preview.inProgressRemaining) < 0.01 && (
                <div className="text-amber-700 font-medium mt-1">
                  完成量等于进行中工作量，提交后可点击"提交质检"按钮
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">取消</button>
            <button type="submit" disabled={submitting || exceeded} className="px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 disabled:opacity-50">
              {submitting ? '提交中...' : '确认'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
