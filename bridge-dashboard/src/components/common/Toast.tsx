import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

let nextId = 0;
const listeners: Array<(toasts: ToastItem[]) => void> = [];
let currentToasts: ToastItem[] = [];

function emitChange() {
  for (const listener of listeners) listener(currentToasts);
}

export const toast = {
  success: (message: string) => addToast(message, 'success'),
  error: (message: string) => addToast(message, 'error'),
  info: (message: string) => addToast(message, 'info'),
  warning: (message: string) => addToast(message, 'warning'),
};

function addToast(message: string, type: ToastItem['type']) {
  const item: ToastItem = { id: nextId++, message, type };
  currentToasts = [...currentToasts, item];
  emitChange();
  setTimeout(() => {
    currentToasts = currentToasts.filter((t) => t.id !== item.id);
    emitChange();
  }, 3000);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    listeners.push(setToasts);
    return () => {
      const idx = listeners.indexOf(setToasts);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    currentToasts = currentToasts.filter((t) => t.id !== id);
    emitChange();
  }, []);

  if (toasts.length === 0) return null;

  const colorMap: Record<ToastItem['type'], string> = {
    success: 'bg-green-50 border-green-400 text-green-800',
    error: 'bg-red-50 border-red-400 text-red-800',
    info: 'bg-blue-50 border-blue-400 text-blue-800',
    warning: 'bg-yellow-50 border-yellow-400 text-yellow-800',
  };

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-2 px-4 py-3 rounded border shadow-sm ${colorMap[t.type]}`}
        >
          <p className="flex-1 text-sm">{t.message}</p>
          <button className="shrink-0 opacity-60 hover:opacity-100" onClick={() => dismiss(t.id)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}