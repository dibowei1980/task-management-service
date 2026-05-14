import { taskApi } from '../utils/api';
import { Task } from '../types';

export const taskTreeApi = {
  getTree: async (rootId: string): Promise<Task[]> => {
    const response = await taskApi.get(`/api/tasks/${rootId}/subtasks`);
    return response.data;
  },

  getNode: async (taskId: string): Promise<Task> => {
    const response = await taskApi.get(`/api/tasks/${taskId}`);
    return response.data;
  },

  moveNode: async (taskId: string, newParentId: string | null): Promise<Task> => {
    const response = await taskApi.put(`/api/tasks/${taskId}`, {
      parentTaskId: newParentId,
    });
    return response.data;
  },

  validateStructure: async (parentId: string, childType: string): Promise<{ valid: boolean; message?: string }> => {
    try {
      const siblings = await taskApi.get(`/api/tasks/${parentId}/subtasks`);
      const siblingTypes = (siblings.data as Task[]).map(t => t.type).filter(Boolean);
      const allSame = siblingTypes.length > 0 && siblingTypes.every(t => t === childType);
      const allDifferent = siblingTypes.length > 0 && new Set(siblingTypes).size === siblingTypes.length;
      if (siblingTypes.length > 0 && !allSame && !allDifferent) {
        return { valid: false, message: '当前兄弟节点已存在混合类型，不允许继续添加子任务' };
      }
      if (allDifferent && siblingTypes.includes(childType)) {
        return { valid: false, message: `同类型任务 ${childType} 已存在于兄弟节点中，不允许分散` };
      }
      return { valid: true };
    } catch {
      return { valid: true };
    }
  },
};
