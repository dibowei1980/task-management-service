import React, { useCallback, useEffect, useState } from 'react';
import { bridgeSystemService } from '../../services/bridgeService';

type BrowseItem = { name: string; path: string; type: 'directory' | 'file' };

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  mode: 'file' | 'directory';
  fileFilter?: string;
  title?: string;
}

export const ServerFileBrowser: React.FC<Props> = ({ open, onClose, onSelect, mode, fileFilter, title }) => {
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [items, setItems] = useState<BrowseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState('');

  const loadDir = useCallback(async (path?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await bridgeSystemService.browse(path || undefined, fileFilter);
      setCurrentPath(data.currentPath);
      setParentPath(data.parentPath);
      setItems(data.items);
      setManualPath(data.currentPath);
    } catch (err: unknown) {
      const e = err as { userMessage?: string; response?: { data?: { error?: { message?: string } } } };
      setError(e?.userMessage || e?.response?.data?.error?.message || '加载目录失败');
    } finally {
      setLoading(false);
    }
  }, [fileFilter]);

  useEffect(() => {
    if (open) {
      loadDir();
    }
  }, [open, loadDir]);

  if (!open) return null;

  const handleItemClick = (item: BrowseItem) => {
    if (item.type === 'directory') {
      loadDir(item.path);
    } else if (mode === 'file') {
      onSelect(item.path);
      onClose();
    }
  };

  const handleSelectDir = () => {
    if (currentPath) {
      onSelect(currentPath);
      onClose();
    }
  };

  const handleGoToPath = () => {
    if (manualPath.trim()) {
      loadDir(manualPath.trim());
    }
  };

  const displayTitle = title || (mode === 'file' ? '选择文件' : '选择目录');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center px-4 py-3 border-b">
          <h2 className="text-lg font-bold">{displayTitle}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl leading-none">&times;</button>
        </div>

        <div className="px-4 py-2 border-b flex gap-2">
          <input
            className="flex-1 border rounded px-2 py-1 text-sm"
            value={manualPath}
            onChange={e => setManualPath(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleGoToPath(); }}
            placeholder="输入路径后回车跳转"
          />
          <button
            className="px-3 py-1 text-sm bg-gray-100 border rounded hover:bg-gray-200"
            onClick={handleGoToPath}
          >
            跳转
          </button>
          {parentPath && (
            <button
              className="px-3 py-1 text-sm bg-gray-100 border rounded hover:bg-gray-200"
              onClick={() => loadDir(parentPath)}
            >
              上级
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 min-h-[300px]">
          {loading && <div className="text-center text-gray-500 py-8">加载中...</div>}
          {error && <div className="text-center text-red-500 py-4">{error}</div>}
          {!loading && !error && items.length === 0 && (
            <div className="text-center text-gray-400 py-8">空目录</div>
          )}
          {!loading && !error && items.map(item => (
            <div
              key={item.path}
              className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer rounded border-b border-gray-50"
              onClick={() => handleItemClick(item)}
            >
              <span className="text-lg">{item.type === 'directory' ? '📁' : '📄'}</span>
              <span className="text-sm truncate">{item.name}</span>
              {item.type === 'directory' && <span className="text-xs text-gray-400 ml-auto">&gt;</span>}
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t flex justify-between items-center">
          <span className="text-xs text-gray-500 truncate max-w-[60%]">{currentPath || '根'}</span>
          <div className="flex gap-2">
            <button className="px-4 py-2 text-sm text-gray-600 border rounded" onClick={onClose}>取消</button>
            {mode === 'directory' && (
              <button
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded disabled:opacity-50"
                onClick={handleSelectDir}
                disabled={!currentPath}
              >
                选择此目录
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
