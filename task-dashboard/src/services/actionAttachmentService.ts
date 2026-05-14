import { taskApi } from '../utils/api';

export interface ActionAttachmentResponse {
  id: string;
  taskId: string;
  action: string;
  type: 'FILE' | 'LINK';
  fileName?: string;
  fileSize?: number;
  contentType?: string;
  linkUrl?: string;
  linkLabel?: string;
  inheritedFrom?: string;
  uploadedBy?: string;
  uploadedByName?: string;
  createdAt: string;
}

export const actionAttachmentService = {
  upload: async (taskId: string, action: string, file: File, uploadedBy?: string, uploadedByName?: string): Promise<ActionAttachmentResponse> => {
    const form = new FormData();
    form.append('file', file);
    form.append('action', action);
    if (uploadedBy) form.append('uploadedBy', uploadedBy);
    if (uploadedByName) form.append('uploadedByName', uploadedByName);
    const res = await taskApi.post<ActionAttachmentResponse>(`/api/action-attachments/task/${taskId}/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  addLink: async (taskId: string, action: string, url: string, label?: string, uploadedBy?: string, uploadedByName?: string): Promise<ActionAttachmentResponse> => {
    const res = await taskApi.post<ActionAttachmentResponse>(`/api/action-attachments/task/${taskId}/link`, {
      action, url, label, uploadedBy, uploadedByName,
    });
    return res.data;
  },

  inherit: async (taskId: string, action: string, sourceAttachmentIds: string[], uploadedBy?: string, uploadedByName?: string): Promise<ActionAttachmentResponse[]> => {
    const res = await taskApi.post<ActionAttachmentResponse[]>(`/api/action-attachments/task/${taskId}/inherit`, {
      action, sourceAttachmentIds, uploadedBy, uploadedByName,
    });
    return res.data;
  },

  list: async (taskId: string, action?: string): Promise<ActionAttachmentResponse[]> => {
    const params = action ? { action } : {};
    const res = await taskApi.get<ActionAttachmentResponse[]>(`/api/action-attachments/task/${taskId}`, { params });
    return res.data;
  },

  downloadUrl: (attachmentId: string) => `/api/action-attachments/${attachmentId}/download`,

  delete: async (attachmentId: string, deletedBy?: string): Promise<void> => {
    const params = deletedBy ? { deletedBy } : {};
    await taskApi.delete(`/api/action-attachments/${attachmentId}`, { params });
  },
};
