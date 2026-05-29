import React, { useEffect, useState } from 'react';
import { taskTypeService, TaskTypeResponse, TaskTypeRequest } from '../../services/taskTypeService';
import { taskTypeGroupService, TaskTypeGroupResponse, TaskTypeGroupRequest } from '../../services/taskTypeGroupService';

const emptyGroupForm: TaskTypeGroupRequest = { code: '', name: '', sortOrder: 0, enabled: true };
const emptyTypeForm: TaskTypeRequest = { code: '', name: '', groupId: '', description: '', enabled: true };

const GroupFormModal: React.FC<{
  form: TaskTypeGroupRequest;
  editing: boolean;
  submitting: boolean;
  onChange: (form: TaskTypeGroupRequest) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}> = ({ form, editing, submitting, onChange, onSubmit, onCancel }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 w-[480px] max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-xl font-bold">{editing ? '编辑分组' : '新增分组'}</h2>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">✕</button>
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-gray-700">分组编码</span>
          <input value={form.code} onChange={e => onChange({ ...form, code: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2" required placeholder="如 DATA_COLLECTION" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-gray-700">分组名称</span>
          <input value={form.name} onChange={e => onChange({ ...form, name: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2" required placeholder="如 数据采集" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-gray-700">排序</span>
          <input type="number" value={form.sortOrder ?? 0} onChange={e => onChange({ ...form, sortOrder: parseInt(e.target.value, 10) || 0 })} className="w-full rounded-md border border-gray-300 px-3 py-2" />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.enabled} onChange={e => onChange({ ...form, enabled: e.target.checked })} /> 启用
        </label>
        <div className="flex justify-end space-x-2 pt-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md">取消</button>
          <button type="submit" disabled={submitting} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{submitting ? '保存中...' : editing ? '保存修改' : '创建分组'}</button>
        </div>
      </form>
    </div>
  </div>
);

const TypeFormModal: React.FC<{
  form: TaskTypeRequest;
  editing: boolean;
  submitting: boolean;
  groups: TaskTypeGroupResponse[];
  onChange: (form: TaskTypeRequest) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}> = ({ form, editing, submitting, groups, onChange, onSubmit, onCancel }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 w-[480px] max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-xl font-bold">{editing ? '编辑任务' : '新增任务'}</h2>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">✕</button>
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-gray-700">所属分组</span>
          <select value={form.groupId} onChange={e => onChange({ ...form, groupId: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2" required>
            <option value="">-- 选择分组 --</option>
            {groups.filter(g => g.enabled).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-gray-700">任务编码</span>
          <input value={form.code} onChange={e => onChange({ ...form, code: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2" required placeholder="如 LEVEL_SURVEY_KM" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-gray-700">任务名称</span>
          <input value={form.name} onChange={e => onChange({ ...form, name: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2" required placeholder="如 水准测量（公里）" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-gray-700">说明</span>
          <textarea value={form.description} onChange={e => onChange({ ...form, description: e.target.value })} className="min-h-16 w-full rounded-md border border-gray-300 px-3 py-2" placeholder="描述该任务适用场景" />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.enabled} onChange={e => onChange({ ...form, enabled: e.target.checked })} /> 启用
        </label>
        <div className="flex justify-end space-x-2 pt-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md">取消</button>
          <button type="submit" disabled={submitting} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{submitting ? '保存中...' : editing ? '保存修改' : '创建任务'}</button>
        </div>
      </form>
    </div>
  </div>
);

export const TaskTypeManagementPage: React.FC = () => {
  const [groups, setGroups] = useState<TaskTypeGroupResponse[]>([]);
  const [allTypes, setAllTypes] = useState<TaskTypeResponse[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupForm, setGroupForm] = useState<TaskTypeGroupRequest>(emptyGroupForm);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const [showTypeModal, setShowTypeModal] = useState(false);
  const [typeForm, setTypeForm] = useState<TaskTypeRequest>(emptyTypeForm);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [deletingTypeId, setDeletingTypeId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [g, t] = await Promise.all([taskTypeGroupService.list(), taskTypeService.list()]);
      setGroups(g);
      setAllTypes(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const filteredTypes = selectedGroupId
    ? allTypes.filter(t => t.groupId === selectedGroupId)
    : allTypes;

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  const openGroupModal = (g?: TaskTypeGroupResponse) => {
    if (g) {
      setEditingGroupId(g.id);
      setGroupForm({ code: g.code, name: g.name, sortOrder: g.sortOrder, enabled: g.enabled });
    } else {
      setEditingGroupId(null);
      setGroupForm({ ...emptyGroupForm });
    }
    setShowGroupModal(true);
  };

  const closeGroupModal = () => {
    setShowGroupModal(false);
    setEditingGroupId(null);
    setGroupForm({ ...emptyGroupForm });
  };

  const openTypeModal = (t?: TaskTypeResponse) => {
    if (t) {
      setEditingTypeId(t.id);
      setTypeForm({ code: t.code, name: t.name, groupId: t.groupId, description: t.description || '', enabled: t.enabled });
    } else {
      setEditingTypeId(null);
      setTypeForm({ ...emptyTypeForm, groupId: selectedGroupId || '' });
    }
    setShowTypeModal(true);
  };

  const closeTypeModal = () => {
    setShowTypeModal(false);
    setEditingTypeId(null);
    setTypeForm({ ...emptyTypeForm });
  };

  const handleGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (editingGroupId) {
        await taskTypeGroupService.update(editingGroupId, groupForm);
      } else {
        await taskTypeGroupService.create(groupForm);
      }
      closeGroupModal();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存分组失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTypeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeForm.groupId) { setError('请选择所属分组'); return; }
    setSubmitting(true);
    setError(null);
    try {
      if (editingTypeId) {
        await taskTypeService.update(editingTypeId, typeForm);
      } else {
        await taskTypeService.create(typeForm);
      }
      closeTypeModal();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存任务类型失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleGroup = async (g: TaskTypeGroupResponse) => {
    try {
      await taskTypeGroupService.toggle(g.id, !g.enabled);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleToggleType = async (t: TaskTypeResponse) => {
    try {
      await taskTypeService.toggle(t.id, !t.enabled);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleDeleteGroup = async (g: TaskTypeGroupResponse) => {
    const childCount = allTypes.filter(t => t.groupId === g.id).length;
    if (childCount > 0) {
      setError(`分组「${g.name}」下还有 ${childCount} 个任务类型，无法删除`);
      return;
    }
    if (!window.confirm(`确定删除分组「${g.name}」(${g.code})？此操作不可撤销。`)) return;
    setDeletingGroupId(g.id);
    setError(null);
    try {
      await taskTypeGroupService.delete(g.id);
      if (selectedGroupId === g.id) setSelectedGroupId('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除分组失败');
    } finally {
      setDeletingGroupId(null);
    }
  };

  const handleDeleteType = async (t: TaskTypeResponse) => {
    if (t.referenceCount > 0) {
      setError(`任务类型「${t.name}」已被 ${t.referenceCount} 个任务引用，无法删除`);
      return;
    }
    if (!window.confirm(`确定删除任务类型「${t.name}」(${t.code})？此操作不可撤销。`)) return;
    setDeletingTypeId(t.id);
    setError(null);
    try {
      await taskTypeService.delete(t.id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除任务类型失败');
    } finally {
      setDeletingTypeId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">任务类型管理</h1>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm flex flex-col">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900">分组列表</h2>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void loadData()} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">刷新</button>
              <button type="button" onClick={() => openGroupModal()} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">+ 新增分组</button>
            </div>
          </div>
          <div className="p-3 flex-1 overflow-y-auto">
            {loading ? <div className="py-4 text-sm text-gray-500">加载中...</div> : (
              <ul className="space-y-1">
                <li>
                  <button onClick={() => setSelectedGroupId('')} className={`w-full text-left px-3 py-2 rounded text-sm ${!selectedGroupId ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50'}`}>
                    全部分组
                  </button>
                </li>
                {groups.map(g => (
                  <li key={g.id} className="flex items-center gap-1">
                    <button onClick={() => setSelectedGroupId(g.id)} className={`flex-1 text-left px-3 py-2 rounded text-sm ${selectedGroupId === g.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50'} ${!g.enabled ? 'text-gray-400' : ''}`}>
                      {g.name}
                      <span className="text-xs text-gray-400 ml-1">({g.code})</span>
                    </button>
                    <button onClick={() => openGroupModal(g)} className="text-xs text-blue-600 hover:underline px-1">编辑</button>
                    <button onClick={() => handleToggleGroup(g)} className="text-xs text-amber-600 hover:underline px-1">{g.enabled ? '停用' : '启用'}</button>
                    <button onClick={() => void handleDeleteGroup(g)} disabled={deletingGroupId === g.id} className="text-xs text-red-600 hover:underline px-1 disabled:opacity-40">{deletingGroupId === g.id ? '删除中...' : '删除'}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm flex flex-col">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900">{selectedGroup ? `${selectedGroup.name} 任务列表` : '全部任务列表'}</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{filteredTypes.length} 项</span>
              <button type="button" onClick={() => openTypeModal()} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">+ 新增任务</button>
            </div>
          </div>
          <div className="p-5 flex-1 overflow-y-auto">
            {loading ? <div className="py-4 text-sm text-gray-500">加载中...</div> : filteredTypes.length === 0 ? (
              <div className="py-4 text-sm text-gray-500">暂无任务类型</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-3">编码</th>
                    <th className="py-2 pr-3">名称</th>
                    <th className="py-2 pr-3">分组</th>
                    <th className="py-2 pr-3">来源</th>
                    <th className="py-2 pr-3">引用</th>
                    <th className="py-2 pr-3">状态</th>
                    <th className="py-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTypes.map(t => (
                    <tr key={t.id} className={`border-b ${!t.enabled ? 'text-gray-400' : ''}`}>
                      <td className="py-2 pr-3 font-mono text-xs">{t.code}</td>
                      <td className="py-2 pr-3">{t.name}</td>
                      <td className="py-2 pr-3 text-xs">{t.groupName}</td>
                      <td className="py-2 pr-3 text-xs">{t.source}</td>
                      <td className="py-2 pr-3">{t.referenceCount}</td>
                      <td className="py-2 pr-3">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${t.enabled ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{t.enabled ? '启用' : '停用'}</span>
                      </td>
                      <td className="py-2 space-x-2">
                        <button onClick={() => openTypeModal(t)} className="text-xs text-blue-600 hover:underline">编辑</button>
                        <button onClick={() => handleToggleType(t)} className="text-xs text-amber-600 hover:underline">{t.enabled ? '停用' : '启用'}</button>
                        <button onClick={() => void handleDeleteType(t)} disabled={deletingTypeId === t.id} className="text-xs text-red-600 hover:underline disabled:opacity-40">{deletingTypeId === t.id ? '删除中...' : '删除'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showGroupModal && (
        <GroupFormModal
          form={groupForm}
          editing={!!editingGroupId}
          submitting={submitting}
          onChange={setGroupForm}
          onSubmit={handleGroupSubmit}
          onCancel={closeGroupModal}
        />
      )}

      {showTypeModal && (
        <TypeFormModal
          form={typeForm}
          editing={!!editingTypeId}
          submitting={submitting}
          groups={groups}
          onChange={setTypeForm}
          onSubmit={handleTypeSubmit}
          onCancel={closeTypeModal}
        />
      )}
    </div>
  );
};
