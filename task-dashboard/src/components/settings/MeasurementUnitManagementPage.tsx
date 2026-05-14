import React, { useEffect, useMemo, useState } from 'react';
import { MeasurementUnitDefinition } from '../../types';
import { measurementUnitService, MeasurementUnitRequest } from '../../services/measurementUnitService';

const emptyForm: MeasurementUnitRequest = { code: '', name: '', enabled: true, baseUnitCode: '', conversionFactor: 1 };

export const MeasurementUnitManagementPage: React.FC = () => {
  const [items, setItems] = useState<MeasurementUnitDefinition[]>([]);
  const [form, setForm] = useState<MeasurementUnitRequest>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseUnits = useMemo(() => items.filter(item => item.basic || !item.baseUnitCode), [items]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await measurementUnitService.list();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载计量单位失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowFormModal(false);
  };

  const handleCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setError(null);
    setShowFormModal(true);
  };

  const handleEdit = (item: MeasurementUnitDefinition) => {
    setEditingId(item.id);
    setForm({ code: item.code, name: item.name, enabled: item.enabled, baseUnitCode: item.baseUnitCode ?? '', conversionFactor: item.conversionFactor ?? 1 });
    setError(null);
    setShowFormModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const payload = { ...form, baseUnitCode: form.baseUnitCode || null, conversionFactor: form.baseUnitCode ? form.conversionFactor : null };
    try {
      if (editingId) {
        await measurementUnitService.update(editingId, payload);
      } else {
        await measurementUnitService.create(payload);
      }
      resetForm();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存计量单位失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (item: MeasurementUnitDefinition) => {
    try {
      await measurementUnitService.toggle(item.id, !item.enabled);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">计量单位管理</h1>
        </div>
        <button type="button" onClick={handleCreate} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">+新增计量单位</button>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">{editingId ? '编辑计量单位' : '新增计量单位'}</h2>
              <button type="button" onClick={resetForm} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-gray-700">单位编码</span>
                  <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2" required placeholder="如 UNIT_KM" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-gray-700">单位名称</span>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2" required placeholder="如 公里" />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-gray-700">基础单位</span>
                  <select value={form.baseUnitCode ?? ''} onChange={e => setForm({ ...form, baseUnitCode: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2">
                    <option value="">自身为基础单位</option>
                    {baseUnits.map(item => <option key={item.code} value={item.code}>{item.name}（{item.code}）</option>)}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-gray-700">换算系数</span>
                  <input type="number" min={0} step={0.0001} value={form.conversionFactor ?? 1} onChange={e => setForm({ ...form, conversionFactor: parseFloat(e.target.value) || 1 })} className="w-full rounded-md border border-gray-300 px-3 py-2" disabled={!form.baseUnitCode} />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.enabled ?? true} onChange={e => setForm({ ...form, enabled: e.target.checked })} /> 启用
              </label>
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <button type="button" onClick={resetForm} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">取消</button>
                <button type="submit" disabled={submitting} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{submitting ? '保存中...' : editingId ? '保存修改' : '确认新增'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-medium text-gray-900">计量单位列表</h2>
          <button type="button" onClick={() => void loadData()} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">刷新</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-5 py-3">编码</th>
                <th className="px-5 py-3">名称</th>
                <th className="px-5 py-3">基础单位</th>
                <th className="px-5 py-3">系数</th>
                <th className="px-5 py-3">状态</th>
                <th className="px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-gray-500">加载中...</td></tr>
              ) : items.map(item => (
                <tr key={item.id}>
                  <td className="px-5 py-3 font-mono text-xs text-gray-700">{item.code}</td>
                  <td className="px-5 py-3 text-gray-900">{item.name}</td>
                  <td className="px-5 py-3 text-gray-500">{item.baseUnitName ?? item.baseUnitCode ?? '基础单位'}</td>
                  <td className="px-5 py-3 text-gray-500">{item.conversionFactor ?? '-'}</td>
                  <td className="px-5 py-3"><span className={item.enabled ? 'text-green-700' : 'text-gray-400'}>{item.enabled ? '启用' : '停用'}</span></td>
                  <td className="px-5 py-3 text-right space-x-3">
                    <button type="button" onClick={() => handleEdit(item)} className="text-blue-600 hover:underline">编辑</button>
                    <button type="button" onClick={() => void handleToggle(item)} className="text-amber-600 hover:underline">{item.enabled ? '停用' : '启用'}</button>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && <tr><td colSpan={6} className="px-5 py-6 text-center text-gray-500">暂无计量单位</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
