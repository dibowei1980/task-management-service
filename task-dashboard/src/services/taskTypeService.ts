import { taskApi } from '../utils/api';

export interface TaskTypeResponse {
  id: string;
  code: string;
  name: string;
  groupId: string;
  groupName: string;
  description?: string;
  source: string;
  enabled: boolean;
  referenceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskTypeRequest {
  code: string;
  name: string;
  groupId: string;
  description?: string;
  enabled?: boolean;
}

export const taskTypeService = {
  list: async (groupId?: string): Promise<TaskTypeResponse[]> => {
    const res = await taskApi.get<TaskTypeResponse[]>('/api/task-types', { params: groupId ? { groupId } : {} });
    return res.data;
  },
  get: async (id: string): Promise<TaskTypeResponse> => {
    const res = await taskApi.get<TaskTypeResponse>(`/api/task-types/${id}`);
    return res.data;
  },
  create: async (data: TaskTypeRequest): Promise<TaskTypeResponse> => {
    const res = await taskApi.post<TaskTypeResponse>('/api/task-types', data);
    return res.data;
  },
  update: async (id: string, data: TaskTypeRequest): Promise<TaskTypeResponse> => {
    const res = await taskApi.put<TaskTypeResponse>(`/api/task-types/${id}`, data);
    return res.data;
  },
  toggle: async (id: string, enabled: boolean): Promise<void> => {
    await taskApi.patch(`/api/task-types/${id}/toggle`, { enabled });
  },
};
