import React, { useEffect, useState } from 'react';
import { TaskTypeRegistrationResponse, CALLBACK_FIELD_OPTIONS, taskTypeRegistrationService } from '../../services/taskTypeRegistrationService';
import { taskTypeGroupService, TaskTypeGroupResponse } from '../../services/taskTypeGroupService';

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  PENDING: { text: '待审批', color: 'bg-yellow-50 text-yellow-700' },
  APPROVED: { text: '已通过', color: 'bg-green-50 text-green-700' },
  REJECTED: { text: '已拒绝', color: 'bg-red-50 text-red-700' },
};

interface ApproveModalProps {
  item: TaskTypeRegistrationResponse;
  groups: TaskTypeGroupResponse[];
  onConfirm: (targetGroupId: string) => void;
  onCancel: () => void;
  submitting: boolean;
}

const ApproveModal: React.FC<ApproveModalProps> = ({ item, groups, onConfirm, onCancel, submitting }) => {
  const [groupId, setGroupId] = useState(item.groupId ?? item.approvedGroupId ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-gray-900">审批通过</h3>
        </div>
        <div className="space-y-4 p-5">
          <div className="text-sm text-gray-600">
            将任务类型 <span className="font-mono font-medium text-gray-900">{item.code}</span>（{item.name}）添加到指定分组
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-700">目标任务类型分组 *</span>
            <select value={groupId} onChange={e => setGroupId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" required>
              <option value="">-- 选择分组 --</option>
              {groups.filter(g => g.enabled).map(g => <option key={g.id} value={g.id}>{g.name}（{g.code}）</option>)}
            </select>
          </label>
          {item.callbackFields && item.callbackFields.length > 0 && (
            <div className="text-xs text-gray-500">
              该系统声明可提供以下回传字段: {item.callbackFields.map(f => CALLBACK_FIELD_OPTIONS.find(o => o.key === f)?.label ?? f).join('、')}
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button type="button" onClick={onCancel} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">取消</button>
            <button type="button" onClick={() => onConfirm(groupId)} disabled={!groupId || submitting} className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{submitting ? '处理中...' : '确认通过'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface RejectModalProps {
  item: TaskTypeRegistrationResponse;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  submitting: boolean;
}

const RejectModal: React.FC<RejectModalProps> = ({ item, onConfirm, onCancel, submitting }) => {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-gray-900">审批拒绝</h3>
        </div>
        <div className="space-y-4 p-5">
          <div className="text-sm text-gray-600">
            拒绝任务类型 <span className="font-mono font-medium text-gray-900">{item.code}</span>（{item.name}）的注册申请
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-700">拒绝原因 *</span>
            <textarea value={reason} onChange={e => setReason(e.target.value)} className="min-h-20 w-full rounded-md border border-gray-300 px-3 py-2" required placeholder="请填写详细的拒绝原因" />
          </label>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button type="button" onClick={onCancel} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">取消</button>
            <button type="button" onClick={() => onConfirm(reason)} disabled={!reason.trim() || submitting} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{submitting ? '处理中...' : '确认拒绝'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ResultFieldsModalProps {
  item: TaskTypeRegistrationResponse;
  onConfirm: (fields: string[]) => void;
  onCancel: () => void;
  submitting: boolean;
}

const ResultFieldsModal: React.FC<ResultFieldsModalProps> = ({ item, onConfirm, onCancel, submitting }) => {
  const declaredFields = item.callbackFields ?? [];
  const [selected, setSelected] = useState<string[]>(declaredFields);

  const toggle = (key: string) => {
    setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-gray-900">配置回传字段</h3>
        </div>
        <div className="space-y-4 p-5">
          <div className="text-sm text-gray-600">
            任务类型 <span className="font-mono font-medium text-gray-900">{item.code}</span>（{item.name}）声明可提供以下回传字段，勾选需要从外部系统拉取的字段
          </div>
          {item.resultQueryPath && (
            <div className="text-xs text-gray-500">
              结果查询端点: <span className="font-mono">{item.resultQueryPath}</span>
            </div>
          )}
          <div className="space-y-2">
            {CALLBACK_FIELD_OPTIONS.map(opt => {
              const isDeclared = declaredFields.includes(opt.key);
              const isChecked = selected.includes(opt.key);
              return (
                <label key={opt.key} className={`flex items-center gap-3 rounded-md border px-3 py-2 ${isDeclared ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-50'}`}>
                  <input type="checkbox" checked={isChecked} disabled={!isDeclared} onChange={() => toggle(opt.key)} className="rounded border-gray-300" />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                  <span className="text-xs font-mono text-gray-400">{opt.key}</span>
                  {opt.required && <span className="text-xs text-yellow-600">必选</span>}
                </label>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button type="button" onClick={onCancel} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">取消</button>
            <button type="button" onClick={() => onConfirm(selected)} disabled={submitting} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{submitting ? '保存中...' : '保存配置'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const TaskTypeRegistrationPage: React.FC = () => {
  const [items, setItems] = useState<TaskTypeRegistrationResponse[]>([]);
  const [groups, setGroups] = useState<TaskTypeGroupResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const [actionItem, setActionItem] = useState<TaskTypeRegistrationResponse | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'callbackFields' | 'delete' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [registrations, groupList] = await Promise.all([
        taskTypeRegistrationService.list(statusFilter || undefined),
        taskTypeGroupService.list(),
      ]);
      setItems(registrations);
      setGroups(groupList);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, [statusFilter]);

  const handleApprove = async (targetGroupId: string) => {
    if (!actionItem) return;
    setSubmitting(true);
    setError(null);
    try {
      await taskTypeRegistrationService.approve(actionItem.id, targetGroupId);
      setActionItem(null);
      setActionType(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '审批操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!actionItem) return;
    setSubmitting(true);
    setError(null);
    try {
      await taskTypeRegistrationService.reject(actionItem.id, reason);
      setActionItem(null);
      setActionType(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '审批操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateResultFields = async (fields: string[]) => {
    if (!actionItem) return;
    setSubmitting(true);
    setError(null);
    try {
      await taskTypeRegistrationService.updateCallbackFields(actionItem.id, fields);
      setActionItem(null);
      setActionType(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!actionItem) return;
    setSubmitting(true);
    setError(null);
    try {
      await taskTypeRegistrationService.delete(actionItem.id);
      setActionItem(null);
      setActionType(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setSubmitting(false);
    }
  };

  const parseInterfaceManifest = (raw: string | null) => {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  };

  const pendingCount = items.filter(i => i.status === 'PENDING').length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">任务类型注册审批</h1>
          <p className="mt-1 text-sm text-gray-500">管理外部系统提交的任务类型注册申请</p>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium text-gray-900">注册申请列表</h2>
            {pendingCount > 0 && <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">{pendingCount} 待审批</span>}
          </div>
          <div className="flex items-center gap-2">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
              <option value="">全部状态</option>
              <option value="PENDING">待审批</option>
              <option value="APPROVED">已通过</option>
              <option value="REJECTED">已拒绝</option>
            </select>
            <button type="button" onClick={() => void loadData()} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">刷新</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-5 py-3">类型编码</th>
                <th className="px-5 py-3">类型名称</th>
                <th className="px-5 py-3">来源系统</th>
                <th className="px-5 py-3">状态</th>
                <th className="px-5 py-3">回传字段</th>
                <th className="px-5 py-3">审批人</th>
                <th className="px-5 py-3">审批时间</th>
                <th className="px-5 py-3">拒绝原因</th>
                <th className="px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="px-5 py-6 text-center text-gray-500">加载中...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-6 text-center text-gray-500">暂无注册申请</td></tr>
              ) : items.map(item => {
                const st = STATUS_LABELS[item.status] ?? { text: item.status, color: 'bg-gray-100 text-gray-500' };
                const interfaces = parseInterfaceManifest(item.interfaceManifest);
                const fieldLabels = (item.callbackFields ?? []).map(f => CALLBACK_FIELD_OPTIONS.find(o => o.key === f)?.label ?? f);
                return (
                  <React.Fragment key={item.id}>
                    <tr className={item.status === 'PENDING' ? 'bg-yellow-50/30' : ''}>
                      <td className="px-5 py-3 font-mono text-xs text-gray-700">{item.code}</td>
                      <td className="px-5 py-3 text-gray-900">{item.name}</td>
                      <td className="px-5 py-3 text-gray-500">{item.sourceSystem}</td>
                      <td className="px-5 py-3"><span className={`rounded px-1.5 py-0.5 text-xs font-medium ${st.color}`}>{st.text}</span></td>
                      <td className="px-5 py-3 text-xs text-gray-500 max-w-32" title={fieldLabels.join('、')}>
                        {fieldLabels.length > 0 ? (
                          <button type="button" onClick={() => { setActionItem(item); setActionType('callbackFields'); }} className="text-blue-600 hover:underline block truncate max-w-28 text-left">
                            {fieldLabels.join('、')}
                          </button>
                        ) : '-'}
                      </td>
                      <td className="px-5 py-3 text-gray-500">{item.reviewedBy ?? '-'}</td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{item.reviewedAt ? new Date(item.reviewedAt).toLocaleString('zh-CN') : '-'}</td>
                      <td className="px-5 py-3 text-gray-500 text-xs max-w-48 truncate">{item.rejectReason ?? '-'}</td>
                      <td className="px-5 py-3 text-right space-x-2">
                        {item.status === 'PENDING' && (
                          <>
                            <button type="button" onClick={() => { setActionItem(item); setActionType('approve'); }} className="text-green-600 hover:underline">通过</button>
                            <button type="button" onClick={() => { setActionItem(item); setActionType('reject'); }} className="text-red-600 hover:underline">拒绝</button>
                          </>
                        )}
                        {item.status === 'REJECTED' && (
                          <button type="button" onClick={() => { setActionItem(item); setActionType('delete'); }} className="text-red-600 hover:underline">删除</button>
                        )}
                        {item.dashboardUrl && item.status === 'APPROVED' && (
                          <a href={item.dashboardUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">控制台</a>
                        )}
                        {item.callbackFields && item.callbackFields.length > 0 && item.status !== 'PENDING' && (
                          <button type="button" onClick={() => { setActionItem(item); setActionType('callbackFields'); }} className="text-gray-500 hover:underline text-xs">字段配置</button>
                        )}
                      </td>
                    </tr>
                    {(interfaces.length > 0 || item.description || item.serviceUrl || item.dashboardUrl || item.resultQueryPath) && (
                      <tr className="bg-gray-50/50">
                        <td colSpan={9} className="px-5 py-2">
                          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
                            {item.description && <span>说明: {item.description}</span>}
                            {item.serviceUrl && <span>服务地址: {item.serviceUrl}</span>}
                            {item.callbackPath && <span>回调路径: {item.callbackPath}</span>}
                            {item.dashboardUrl && <span>控制台: {item.dashboardUrl}</span>}
                            {item.resultViewUrl && <span>结果查看: {item.resultViewUrl}</span>}
                            {item.resultQueryPath && <span>任务查询API: <span className="font-mono">{item.resultQueryPath}</span></span>}
                          </div>
                          {interfaces.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-2">
                              {interfaces.map((iface: { name: string; version: string; method: string; description: string }, idx: number) => (
                                <span key={idx} className="inline-flex items-center rounded border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600">
                                  <span className="font-medium">{iface.name}</span>
                                  <span className="mx-1 text-gray-300">|</span>
                                  <span className="text-gray-400">{iface.version}</span>
                                  <span className="mx-1 text-gray-300">|</span>
                                  <span className="font-mono text-blue-500">{iface.method}</span>
                                  {iface.description && <><span className="mx-1 text-gray-300">-</span><span>{iface.description}</span></>}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {actionType === 'approve' && actionItem && (
        <ApproveModal item={actionItem} groups={groups} onConfirm={handleApprove} onCancel={() => { setActionItem(null); setActionType(null); }} submitting={submitting} />
      )}

      {actionType === 'reject' && actionItem && (
        <RejectModal item={actionItem} onConfirm={handleReject} onCancel={() => { setActionItem(null); setActionType(null); }} submitting={submitting} />
      )}

      {actionType === 'callbackFields' && actionItem && (
        <ResultFieldsModal item={actionItem} onConfirm={handleUpdateResultFields} onCancel={() => { setActionItem(null); setActionType(null); }} submitting={submitting} />
      )}

      {actionType === 'delete' && actionItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900">删除注册申请</h3>
            </div>
            <div className="space-y-4 p-5">
              <div className="text-sm text-gray-600">
                确定删除任务类型 <span className="font-mono font-medium text-gray-900">{actionItem.code}</span>（{actionItem.name}）的已拒绝申请？删除后该外部系统可重新提交注册申请。
              </div>
              {actionItem.rejectReason && (
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  拒绝原因: {actionItem.rejectReason}
                </div>
              )}
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <button type="button" onClick={() => { setActionItem(null); setActionType(null); }} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">取消</button>
                <button type="button" onClick={handleDelete} disabled={submitting} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{submitting ? '删除中...' : '确认删除'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};