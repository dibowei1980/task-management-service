import React, { useEffect, useState } from 'react';
import { BridgeTask, BridgeUser } from '../../types';
import { bridgeTaskService, bridgeProjectService } from '../../services/bridgeService';
import { bridgeUserService } from '../../services/bridgeService';
import { useAuth } from '../../context/AuthContext';
import { logger } from '../../utils/logger';
import { toast } from '../common/Toast';
import { ServerFileBrowser } from '../common/ServerFileBrowser';

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
  const [projectLeaderId, setProjectLeaderId] = useState<string>(project.assigneeId || '');
  const [projectManagers, setProjectManagers] = useState<BridgeUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [shpFilePath, setShpFilePath] = useState('');
  const [domDir, setDomDir] = useState('');
  const [intermediateRoot, setIntermediateRoot] = useState('');
  const [paramLocked, setParamLocked] = useState(false);
  const [paramLockMessage, setParamLockMessage] = useState<string | null>(null);
  const [shpFileBrowserOpen, setShpFileBrowserOpen] = useState(false);
  const [domDirBrowserOpen, setDomDirBrowserOpen] = useState(false);
  const [intermediateRootBrowserOpen, setIntermediateRootBrowserOpen] = useState(false);
  const canEditProjectLeader = roles.includes('project:update_department')
    || roles.includes('PROJECT:UPDATE_DEPARTMENT')
    || roles.includes('project:update_global')
    || roles.includes('PROJECT:UPDATE_GLOBAL');

  useEffect(() => {
    bridgeTaskService.getTask(project.id)
      .then(result => {
        if (!result.allowed) {
          toast.warning(result.message || '仅创建部门可修改');
          onClose();
        }
      })
      .catch(() => {
        toast.error('权限校验失败');
        onClose();
      });
  }, [project.id, onClose]);

  useEffect(() => {
    if (!canEditProjectLeader) return;
    bridgeUserService.getProjectManagers().then(setProjectManagers).catch(() => {});
  }, [canEditProjectLeader]);

  useEffect(() => {
    const input = parseJson(project.inputParams);
    setShpFilePath(typeof input['shp_file_path'] === 'string' ? String(input['shp_file_path']) : '');
    setDomDir(typeof input['dom_dir'] === 'string' ? String(input['dom_dir']) : '');
    setIntermediateRoot(typeof input['intermediate_root'] === 'string' ? String(input['intermediate_root']) : '');
  }, [project.inputParams]);

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
          toast.warning('请输入桥梁矢量文件（SHP）路径');
          return;
        }
        if (!shpFilePath.trim().toLowerCase().endsWith('.shp')) {
          toast.warning('桥梁矢量文件（SHP）路径必须以 .shp 结尾');
          return;
        }
        if (!domDir.trim()) {
          toast.warning('请输入DOM目录路径');
          return;
        }
      }

      const payload: Partial<BridgeTask> = {};
      if (canEditProjectLeader) {
        payload.projectLeaderId = projectLeaderId ? projectLeaderId : null;
        const selectedManager = projectManagers.find(u => u.userId === projectLeaderId);
        payload.assigneeName = selectedManager ? selectedManager.username : (projectLeaderId ? projectLeaderId : null);
      }

      if (!paramLocked) {
        const input = parseJson(project.inputParams);
        input['shp_file_path'] = shpFilePath.trim();
        input['dom_dir'] = domDir.trim();
        if (intermediateRoot.trim()) {
          input['intermediate_root'] = intermediateRoot.trim();
        } else if ('intermediate_root' in input) {
          delete input['intermediate_root'];
        }
        payload.inputParams = JSON.stringify(input);
      }

      if (Object.keys(payload).length === 0) {
        onSaved();
        return;
      }
      await bridgeTaskService.updateTask(project.id, payload);
      onSaved();
    } catch (err) {
      logger.error('handleSave', err);
      const error = err as { userMessage?: string; response?: { status?: number; data?: { message?: string } } };
      const userMsg = error?.userMessage;
      if (error?.response?.status === 403) {
        toast.error(userMsg || error?.response?.data?.message || '仅创建部门可修改');
      } else {
        toast.error(userMsg || error?.response?.data?.message || '保存失败');
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
            <div className="flex gap-2">
              <input
                className="w-full border rounded p-2"
                value={shpFilePath}
                onChange={e => setShpFilePath(e.target.value)}
                disabled={paramLocked}
                placeholder="例如：D:/data/bridges.shp"
              />
              {!paramLocked && (
                <button
                  className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
                  onClick={() => setShpFileBrowserOpen(true)}
                >
                  浏览
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">DOM目录</label>
            <div className="flex gap-2">
              <input
                className="w-full border rounded p-2"
                value={domDir}
                onChange={e => setDomDir(e.target.value)}
                disabled={paramLocked}
                placeholder="例如：D:/data/dom_tiles"
              />
              {!paramLocked && (
                <button
                  className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
                  onClick={() => setDomDirBrowserOpen(true)}
                >
                  浏览
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">intermediate_root</label>
            <div className="flex gap-2">
              <input
                className="w-full border rounded p-2"
                value={intermediateRoot}
                onChange={e => setIntermediateRoot(e.target.value)}
                disabled={paramLocked}
                placeholder="例如：D:/data/intermediate"
              />
              {!paramLocked && (
                <button
                  className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
                  onClick={() => setIntermediateRootBrowserOpen(true)}
                >
                  浏览
                </button>
              )}
            </div>
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
                  <option key={u.userId} value={u.userId}>{u.username}</option>
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
            <button className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50" onClick={() => handleSave().catch((e) => logger.error('handleSave', e))} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>

      <ServerFileBrowser
        open={shpFileBrowserOpen}
        onClose={() => setShpFileBrowserOpen(false)}
        onSelect={path => setShpFilePath(path)}
        mode="file"
        fileFilter="shp"
        title="选择 SHP 文件"
      />
      <ServerFileBrowser
        open={domDirBrowserOpen}
        onClose={() => setDomDirBrowserOpen(false)}
        onSelect={path => setDomDir(path)}
        mode="directory"
        title="选择 DOM 目录"
      />
      <ServerFileBrowser
        open={intermediateRootBrowserOpen}
        onClose={() => setIntermediateRootBrowserOpen(false)}
        onSelect={path => setIntermediateRoot(path)}
        mode="directory"
        title="选择中间数据目录"
      />
    </div>
  );
};
