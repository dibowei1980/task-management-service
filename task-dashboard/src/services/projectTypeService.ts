import { ProjectTypeDefinition } from '../types';
import { taskApi } from '../utils/api';

export interface ProjectTypeRequest {
  code: string;
  name: string;
  description?: string | null;
  source?: string | null;
  enabled?: boolean;
}

export const projectTypeService = {
  list: async (): Promise<ProjectTypeDefinition[]> => {
    const res = await taskApi.get<ProjectTypeDefinition[]>('/api/project-types');
    return res.data;
  },
  getByCode: async (code: string): Promise<ProjectTypeDefinition> => {
    const res = await taskApi.get<ProjectTypeDefinition>(`/api/project-types/by-code/${code}`);
    return res.data;
  },
  create: async (data: ProjectTypeRequest): Promise<ProjectTypeDefinition> => {
    const res = await taskApi.post<ProjectTypeDefinition>('/api/project-types', data);
    return res.data;
  },
  update: async (id: string, data: ProjectTypeRequest): Promise<ProjectTypeDefinition> => {
    const res = await taskApi.put<ProjectTypeDefinition>(`/api/project-types/${id}`, data);
    return res.data;
  },
  toggle: async (id: string, enabled: boolean): Promise<ProjectTypeDefinition> => {
    const res = await taskApi.patch<ProjectTypeDefinition>(`/api/project-types/${id}/enabled`, { enabled });
    return res.data;
  },
  delete: async (id: string): Promise<void> => {
    await taskApi.delete(`/api/project-types/${id}`);
  },
};
