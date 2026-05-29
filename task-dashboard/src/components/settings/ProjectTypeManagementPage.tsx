import React, { useEffect, useState } from 'react';
import { ProjectTypeDefinition } from '../../types';
import { projectTypeService, ProjectTypeRequest } from '../../services/projectTypeService';

const emptyForm: ProjectTypeRequest = { code: '', name: '', description: '', enabled: true };

export const ProjectTypeManagementPage: React.FC = () => {
  const [items, setItems] = useState<ProjectTypeDefinition[]>([]);
  const [form, setForm] = useState<ProjectTypeRequest>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await projectTypeService.list();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载项目类型失败');
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

  const handleEdit = (item: ProjectTypeDefinition) => {
    setEditingId(item.id);
    setForm({ code: item.code, name: item.name, description: item.description ?? '', source: item.source, enabled: item.enabled });
    setError(null);
    setShowFormModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (editingId) {
        await projectTypeService.update(editingId, form);
      } else {
        await projectTypeService.create(form);
      }
      resetForm();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存项目类型失败');
    } finally {
      setSubmitting(false);
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (item: ProjectTypeDefinition) => {
    if (item.referenceCount > 0) {
      setError(`项目类型「${item.name}」已被 ${item.referenceCount} 个项目引用，无法删除`);
      return;
    }
    if (!window.confirm(`确定删除项目类型「${item.name}」(${item.code})？此操作不可撤销。`)) return;
    setDeletingId(item.id);
    setError(null);
    try {
      await projectTypeService.delete(item.id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除项目类型失败');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggle = async (item: ProjectTypeDefinition) => {
    try {
      await projectTypeService.toggle(item.id, !item.enabled);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">项目类型管理</h1>
        </div>
        <button type="button" onClick={handleCreate} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">+新增项目类型</button>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">{editingId ? '编辑项目类型' : '新增项目类型'}</h2>
              <button type="button" onClick={resetForm} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-gray-700">类型编码</span>
                  <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2" required placeholder="如 MAP_PRODUCTION" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-gray-700">类型名称</span>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2" required placeholder="如 地图生产" />
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-gray-700">说明</span>
                <textarea value={form.description ?? ''} onChange={e => setForm({ ...form, description: e.target.value })} className="min-h-16 w-full rounded-md border border-gray-300 px-3 py-2" />
              </label>
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
          <h2 className="text-lg font-medium text-gray-900">项目类型列表</h2>
          <button type="button" onClick={() => void loadData()} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">刷新</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-5 py-3">编码</th>
                <th className="px-5 py-3">名称</th>
                <th className="px-5 py-3">来源</th>
                <th className="px-5 py-3">引用</th>
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
                  <td className="px-5 py-3 text-gray-500">{item.source}</td>
                  <td className="px-5 py-3 text-gray-500">{item.referenceCount}</td>
                  <td className="px-5 py-3"><span className={item.enabled ? 'text-green-700' : 'text-gray-400'}>{item.enabled ? '启用' : '停用'}</span></td>
                  <td className="px-5 py-3 text-right space-x-3">
                    <button type="button" onClick={() => handleEdit(item)} className="text-blue-600 hover:underline">编辑</button>
                    <button type="button" onClick={() => void handleToggle(item)} className="text-amber-600 hover:underline">{item.enabled ? '停用' : '启用'}</button>
                    <button type="button" onClick={() => void handleDelete(item)} disabled={deletingId === item.id} className="text-red-600 hover:underline disabled:opacity-40">{deletingId === item.id ? '删除中...' : '删除'}</button>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && <tr><td colSpan={6} className="px-5 py-6 text-center text-gray-500">暂无项目类型</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
