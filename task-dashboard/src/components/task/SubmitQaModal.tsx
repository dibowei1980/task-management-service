import React, { useState } from 'react';
import { Task } from '../../types';
import { taskService } from '../../services/taskService';
import { useProjectTypeStore } from '../../hooks/useProjectTypeStore';
import { ActionAttachmentsPanel } from './ActionAttachmentsPanel';

interface Props {
  task: Task;
  currentUserId?: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export const SubmitQaModal: React.FC<Props> = ({ task, currentUserId, onClose, onSubmitted }) => {
  const { getUnitName } = useProjectTypeStore();
  const unitDisplay = task.workloadUnit ? getUnitName(task.workloadUnit) : '';
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await taskService.submitQa(task.id);
      onSubmitted();
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      alert(error?.response?.data?.message || '提交质检失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[520px] max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">提交质检</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">✕</button>
        </div>

        <div className="mb-4 p-3 bg-gray-50 rounded text-sm">
          <span className="font-medium">{task.name}</span>
          {task.workload != null && (
            <span className="text-gray-500 ml-2">({task.workload} {unitDisplay})</span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <ActionAttachmentsPanel
            taskId={task.id}
            action="SUBMIT_QA"
            mode="edit"
            currentUserId={currentUserId}
          />

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">取消</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50">
              {submitting ? '提交中...' : '确认提交质检'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
