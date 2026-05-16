import React from 'react';
import { X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  variant = 'primary',
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  const btnClass = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-blue-600 hover:bg-blue-700 text-white';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button className="text-gray-400 hover:text-gray-600" onClick={onCancel}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-gray-600">{message}</p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-lg">
          <button
            className="px-4 py-2 text-sm border rounded hover:bg-gray-100"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={`px-4 py-2 text-sm rounded ${btnClass}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};