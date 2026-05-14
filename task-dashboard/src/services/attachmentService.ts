import { taskApi } from '../utils/api';

export interface AttachmentResponse {
  id: string;
  taskId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  uploadedBy?: string;
  uploadedByName?: string;
  uploadedAt: string;
}

export const attachmentService = {
  list: async (taskId: string): Promise<AttachmentResponse[]> => {
    const res = await taskApi.get<AttachmentResponse[]>(`/api/attachments/task/${taskId}`);
    return res.data;
  },
  upload: async (taskId: string, file: File): Promise<AttachmentResponse> => {
    const form = new FormData();
    form.append('file', file);
    const res = await taskApi.post<AttachmentResponse>(`/api/attachments/task/${taskId}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  downloadUrl: (attachmentId: string) => `/api/attachments/${attachmentId}/download`,
  delete: async (taskId: string, attachmentId: string): Promise<void> => {
    await taskApi.delete(`/api/attachments/task/${taskId}/${attachmentId}`);
  },
};
