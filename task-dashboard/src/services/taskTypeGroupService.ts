import { taskApi } from '../utils/api';

export interface TaskTypeGroupResponse {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskTypeGroupRequest {
  code: string;
  name: string;
  sortOrder?: number;
  enabled?: boolean;
}

export const taskTypeGroupService = {
  list: async (): Promise<TaskTypeGroupResponse[]> => {
    const res = await taskApi.get<TaskTypeGroupResponse[]>('/api/task-type-groups');
    return res.data;
  },
  listEnabled: async (): Promise<TaskTypeGroupResponse[]> => {
    const res = await taskApi.get<TaskTypeGroupResponse[]>('/api/task-type-groups/enabled');
    return res.data;
  },
  get: async (id: string): Promise<TaskTypeGroupResponse> => {
    const res = await taskApi.get<TaskTypeGroupResponse>(`/api/task-type-groups/${id}`);
    return res.data;
  },
  create: async (data: TaskTypeGroupRequest): Promise<TaskTypeGroupResponse> => {
    const res = await taskApi.post<TaskTypeGroupResponse>('/api/task-type-groups', data);
    return res.data;
  },
  update: async (id: string, data: TaskTypeGroupRequest): Promise<TaskTypeGroupResponse> => {
    const res = await taskApi.put<TaskTypeGroupResponse>(`/api/task-type-groups/${id}`, data);
    return res.data;
  },
  toggle: async (id: string, enabled: boolean): Promise<void> => {
    await taskApi.patch(`/api/task-type-groups/${id}/toggle`, { enabled });
  },
  delete: async (id: string): Promise<void> => {
    await taskApi.delete(`/api/task-type-groups/${id}`);
  },
};
