import React, { useEffect, useState } from 'react';
import { bridgeApi } from '../../utils/api';
import { DomCard, DomLocateItem } from './DomCard';

type DomLocateResponse = {
  taskId: string;
  domCount: number;
  dependencyCount: number;
  doms: DomLocateItem[];
};

export const BridgeTaskLocateModal: React.FC<{ taskId: string; onClose: () => void }> = ({ taskId, onClose }) => {
  const [data, setData] = useState<DomLocateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError(null);
    setData(null);
    bridgeApi.get(`/api/v1/tasks/${taskId}/dom-locate`).then(res => {
      if (disposed) return;
      setData(res.data as DomLocateResponse);
    }).catch(e => {
      if (disposed) return;
      const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as { message?: unknown }).message) : '加载失败';
      setError(msg || '加载失败');
    }).finally(() => {
      if (!disposed) setLoading(false);
    });
    return () => { disposed = true; };
  }, [taskId]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <div className="text-lg font-bold">子任务定位</div>
            <div className="text-xs text-gray-500">
              DOM {data?.domCount ?? 0}，依赖桥梁 {data?.dependencyCount ?? 0}
            </div>
          </div>
          <button className="px-3 py-2 text-sm border rounded" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="p-5 overflow-auto max-h-[calc(90vh-64px)]">
          {loading && <div className="text-sm text-gray-600">加载中...</div>}
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!loading && !error && data && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(data.doms || []).map((d, idx) => (
                <DomCard key={`${d.path}-${idx}`} item={d} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};