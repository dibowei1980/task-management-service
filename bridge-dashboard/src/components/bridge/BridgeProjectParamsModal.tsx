import React, { useEffect, useState } from 'react';
import { BridgeTask, BridgeUser } from '../../types';
import { bridgeTaskService, bridgeProjectService } from '../../services/bridgeService';
import { bridgeUserService } from '../../services/bridgeService';
import { useAuth } from '../../context/AuthContext';

interface Props {
  project: BridgeTask;
  onClose: () => void;
  onSaved: () => void;
}

const parseJson = (raw?: string): Record<string, unknown> => {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
};

export const BridgeProjectParamsModal: React.FC<Props> = ({ project, onClose, onSaved }) => {
  const { user } = useAuth();
  const roles = user?.permissions || [];
  const [projectLeaderId, setProjectLeaderId] = useState<string>(project.assignee_id || '');
  const [projectManagers, setProjectManagers] = useState<BridgeUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [shpFilePath, setShpFilePath] = useState('');
  const [domDir, setDomDir] = useState('');
  const [intermediateRoot, setIntermediateRoot] = useState('');
  const [paramLocked, setParamLocked] = useState(false);
  const [paramLockMessage, setParamLockMessage] = useState<string | null>(null);
  const canEditProjectLeader = roles.includes('project:update_department')
    || roles.includes('PROJECT:UPDATE_DEPARTMENT')
    || roles.includes('project:update_global')
    || roles.includes('PROJECT:UPDATE_GLOBAL');

  useEffect(() => {
    bridgeTaskService.getTask(project.id)
      .then(result => {
        if (!result.allowed) {
          alert(result.message || '仅创建部门可修改');
          onClose();
        }
      })
      .catch(() => {
        alert('权限校验失败');
        onClose();
      });
  }, [project.id, onClose]);

  useEffect(() => {
    if (!canEditProjectLeader) return;
    bridgeUserService.getProjectManagers().then(setProjectManagers).catch(() => {});
  }, [canEditProjectLeader]);

  useEffect(() => {
    const input = parseJson(project.input_params);
    setShpFilePath(typeof input['shp_file_path'] === 'string' ? String(input['shp_file_path']) : '');
    setDomDir(typeof input['dom_dir'] === 'string' ? String(input['dom_dir']) : '');
    setIntermediateRoot(typeof input['intermediate_root'] === 'string' ? String(input['intermediate_root']) : '');
  }, [project.input_params]);

  useEffect(() => {
    let disposed = false;
    const check = async () => {
      let locked = project.status != null && project.status !== 'PENDING';
      if (!locked) {
        try {
          const subtasks = await bridgeProjectService.getSubTasks(project.id);
          locked = Array.isArray(subtasks) && subtasks.length > 0;
        } catch {
          locked = project.status != null && project.status !== 'PENDING';
        }
      }
      if (disposed) return;
      setParamLocked(locked);
      setParamLockMessage(locked ? '项目已分解，参数不可修改' : null);
    };
    check().catch(() => {});
    return () => {
      disposed = true;
    };
  }, [project.id, project.status]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!paramLocked) {
        if (!shpFilePath.trim()) {
          alert('请输入桥梁矢量文件（SHP）路径');
          return;
        }
        if (!shpFilePath.trim().toLowerCase().endsWith('.shp')) {
          alert('桥梁矢量文件（SHP）路径必须以 .shp 结尾');
          return;
        }
        if (!domDir.trim()) {
          alert('请输入DOM目录路径');
          return;
        }
      }

      const payload: Partial<BridgeTask> = {};
      if (canEditProjectLeader) {
        payload.project_leader_id = projectLeaderId ? projectLeaderId : null;
      }

      if (!paramLocked) {
        const input = parseJson(project.input_params);
        input['shp_file_path'] = shpFilePath.trim();
        input['dom_dir'] = domDir.trim();
        if (intermediateRoot.trim()) {
          input['intermediate_root'] = intermediateRoot.trim();
        } else if ('intermediate_root' in input) {
          delete input['intermediate_root'];
        }
        payload.input_params = JSON.stringify(input);
      }

      if (Object.keys(payload).length === 0) {
        onSaved();
        return;
      }
      await bridgeTaskService.updateTask(project.id, payload);
      onSaved();
    } catch (err) {
      console.error(err);
      const error = err as { response?: { status?: number; data?: { message?: string } } };
      if (error?.response?.status === 403) {
        alert(error?.response?.data?.message || '仅创建部门可修改');
      } else {
        alert(error?.response?.data?.message || '保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold">项目参数</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">桥梁矢量文件（SHP）路径</label>
            <input
              className="w-full border rounded p-2"
              value={shpFilePath}
              onChange={e => setShpFilePath(e.target.value)}
              disabled={paramLocked}
              placeholder="例如：D:/data/bridges.shp"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">DOM目录</label>
            <input
              className="w-full border rounded p-2"
              value={domDir}
              onChange={e => setDomDir(e.target.value)}
              disabled={paramLocked}
              placeholder="例如：D:/data/dom_tiles"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">intermediate_root</label>
            <input
              className="w-full border rounded p-2"
              value={intermediateRoot}
              onChange={e => setIntermediateRoot(e.target.value)}
              disabled={paramLocked}
              placeholder="例如：D:/data/intermediate"
            />
          </div>
          {paramLockMessage && (
            <div className="text-sm text-gray-500">
              {paramLockMessage}
            </div>
          )}
          {canEditProjectLeader ? (
            <div>
              <label className="block text-sm font-medium mb-1">项目负责人</label>
              <select className="w-full border rounded p-2" value={projectLeaderId} onChange={e => setProjectLeaderId(e.target.value)}>
                <option value="">-- 未指定 --</option>
                {projectManagers.map(u => (
                  <option key={u.user_id} value={u.user_id}>{u.username}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              您没有权限修改项目负责人。
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2">
            <button className="px-4 py-2 text-gray-600" onClick={onClose} disabled={saving}>取消</button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50" onClick={() => handleSave().catch(console.error)} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
