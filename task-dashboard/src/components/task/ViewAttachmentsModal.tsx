import React, { useEffect, useState } from 'react';
import { Task } from '../../types';
import { actionAttachmentService, ActionAttachmentResponse } from '../../services/actionAttachmentService';
import { ActionAttachmentsPanel } from './ActionAttachmentsPanel';

interface Props {
  task: Task;
  action: 'ASSIGN' | 'SUBMIT_QA';
  title?: string;
  onClose: () => void;
}

export const ViewAttachmentsModal: React.FC<Props> = ({ task, action, title, onClose }) => {
  const [attachments, setAttachments] = useState<ActionAttachmentResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    actionAttachmentService.list(task.id, action)
      .then(setAttachments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [task.id, action]);

  const defaultTitle = action === 'ASSIGN' ? '交付资料' : '质检资料';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[480px] max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">{title || defaultTitle}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">✕</button>
        </div>

        <div className="mb-4 p-3 bg-gray-50 rounded text-sm">
          <span className="font-medium">{task.name}</span>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-400">加载中...</div>
        ) : (
          <ActionAttachmentsPanel
            taskId={task.id}
            action={action}
            mode="view"
            existingAttachments={attachments}
          />
        )}

        <div className="flex justify-end pt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">关闭</button>
        </div>
      </div>
    </div>
  );
};
