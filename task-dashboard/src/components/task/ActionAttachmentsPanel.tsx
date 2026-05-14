import React, { useCallback, useRef, useState } from 'react';
import { actionAttachmentService, ActionAttachmentResponse } from '../../services/actionAttachmentService';

interface ActionAttachmentsPanelProps {
  taskId: string;
  action: 'ASSIGN' | 'SUBMIT_QA';
  mode: 'edit' | 'view';
  currentUserId?: string;
  currentUserName?: string;
  existingAttachments?: ActionAttachmentResponse[];
  taskAttachmentIds?: string[];
  onAttachmentsChange?: (attachments: ActionAttachmentResponse[]) => void;
}

export const ActionAttachmentsPanel: React.FC<ActionAttachmentsPanelProps> = ({
  taskId,
  action,
  mode,
  currentUserId,
  currentUserName,
  existingAttachments = [],
  taskAttachmentIds = [],
  onAttachmentsChange,
}) => {
  const [attachments, setAttachments] = useState<ActionAttachmentResponse[]>(existingAttachments);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [inheritIds, setInheritIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateAttachments = useCallback((updated: ActionAttachmentResponse[]) => {
    setAttachments(updated);
    onAttachmentsChange?.(updated);
  }, [onAttachmentsChange]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        alert(`文件「${file.name}」超过 10MB 限制`);
        continue;
      }
      try {
        setUploading(true);
        const res = await actionAttachmentService.upload(taskId, action, file, currentUserId, currentUserName);
        updateAttachments([...attachments, res]);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        alert(e?.response?.data?.message || '上传失败');
      } finally {
        setUploading(false);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [taskId, action, currentUserId, currentUserName, attachments, updateAttachments]);

  const handleAddLink = useCallback(async () => {
    if (!newLinkUrl.trim()) return;
    try {
      const res = await actionAttachmentService.addLink(taskId, action, newLinkUrl.trim(), newLinkLabel.trim() || undefined, currentUserId, currentUserName);
      updateAttachments([...attachments, res]);
      setNewLinkUrl('');
      setNewLinkLabel('');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message || '添加地址失败');
    }
  }, [taskId, action, newLinkUrl, newLinkLabel, currentUserId, currentUserName, attachments, updateAttachments]);

  const handleInherit = useCallback(async () => {
    if (inheritIds.size === 0) return;
    try {
      const res = await actionAttachmentService.inherit(taskId, action, Array.from(inheritIds), currentUserId, currentUserName);
      updateAttachments([...attachments, ...res]);
      setInheritIds(new Set());
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message || '继承失败');
    }
  }, [taskId, action, inheritIds, currentUserId, currentUserName, attachments, updateAttachments]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await actionAttachmentService.delete(id, currentUserId);
      updateAttachments(attachments.filter(a => a.id !== id));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message || '删除失败');
    }
  }, [currentUserId, attachments, updateAttachments]);

  const toggleInherit = useCallback((id: string) => {
    setInheritIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const fileAttachments = attachments.filter(a => a.type === 'FILE');
  const linkAttachments = attachments.filter(a => a.type === 'LINK');

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-gray-700">交付资料</div>

      {mode === 'edit' && (
        <>
          <div className="border border-dashed border-gray-300 rounded-lg p-3 text-center hover:border-blue-400 transition-colors cursor-pointer"
               onClick={() => fileInputRef.current?.click()}>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} />
            <span className="text-gray-500 text-sm">{uploading ? '上传中...' : '📎 点击上传附件（单个 ≤ 10MB）'}</span>
          </div>

          {action === 'ASSIGN' && taskAttachmentIds.length > 0 && (
            <div className="bg-gray-50 rounded p-2">
              <div className="text-xs text-gray-500 mb-1">继承项目/任务附件</div>
              {taskAttachmentIds.map(id => (
                <label key={id} className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={inheritIds.has(id)} onChange={() => toggleInherit(id)} className="rounded" />
                  <span>{id}</span>
                </label>
              ))}
              {inheritIds.size > 0 && (
                <button onClick={handleInherit} className="mt-1 text-xs text-blue-600 hover:underline">
                  确认继承 ({inheritIds.size})
                </button>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <input value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)}
                   placeholder="输入地址（URL 或路径）" className="flex-1 border rounded px-2 py-1 text-sm" />
            <input value={newLinkLabel} onChange={e => setNewLinkLabel(e.target.value)}
                   placeholder="描述（可选）" className="w-28 border rounded px-2 py-1 text-sm" />
            <button onClick={handleAddLink} disabled={!newLinkUrl.trim()}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
              添加
            </button>
          </div>
        </>
      )}

      {fileAttachments.length > 0 && (
        <div className="space-y-1">
          {fileAttachments.map(a => (
            <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded px-2 py-1.5 text-sm">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span>📄</span>
                {mode === 'view' ? (
                  <a href={actionAttachmentService.downloadUrl(a.id)} target="_blank" rel="noopener noreferrer"
                     className="text-blue-600 hover:underline truncate">{a.fileName}</a>
                ) : (
                  <span className="truncate">{a.fileName}</span>
                )}
                {a.inheritedFrom && <span className="text-xs text-gray-400 flex-shrink-0">(继承)</span>}
                <span className="text-xs text-gray-400 flex-shrink-0">{formatSize(a.fileSize)}</span>
              </div>
              {mode === 'edit' && (
                <button onClick={() => handleDelete(a.id)} className="text-red-400 hover:text-red-600 ml-2 flex-shrink-0">✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {linkAttachments.length > 0 && (
        <div className="space-y-1">
          {linkAttachments.map(a => (
            <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded px-2 py-1.5 text-sm">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span>🔗</span>
                <span className="truncate" title={a.linkUrl}>{a.linkLabel || a.linkUrl}</span>
              </div>
              {mode === 'view' && (
                <a href={a.linkUrl} target="_blank" rel="noopener noreferrer"
                   className="text-blue-600 hover:underline text-xs ml-2 flex-shrink-0">打开</a>
              )}
              {mode === 'edit' && (
                <button onClick={() => handleDelete(a.id)} className="text-red-400 hover:text-red-600 ml-2 flex-shrink-0">✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {attachments.length === 0 && mode === 'view' && (
        <div className="text-sm text-gray-400 text-center py-2">暂无交付资料</div>
      )}
    </div>
  );
};
