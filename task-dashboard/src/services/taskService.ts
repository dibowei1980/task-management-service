import { taskApi } from '../utils/api';
import { BoardData, Task, TaskColumn } from '../types';

export const taskService = {
  getAllTasks: async (params?: { page?: number; size?: number; sort?: string; category?: string; externalSystem?: string }) => {
    const response = await taskApi.get('/api/tasks', { params });
    return response.data;
  },

  getMyTree: async (params?: { page?: number; size?: number }) => {
    const response = await taskApi.get('/api/tasks/my-tree', { params });
    return response.data;
  },

  getTaskById: async (id: string) => {
    const response = await taskApi.get(`/api/tasks/${id}`);
    return response.data;
  },

  createTask: async (task: Partial<Task>) => {
    const response = await taskApi.post('/api/tasks', task);
    return response.data;
  },
  
  getSubTasks: async (parentId: string) => {
    const response = await taskApi.get(`/api/tasks/${parentId}/subtasks`);
    return response.data;
  },

  updateTask: async (id: string, task: Partial<Task>) => {
    const response = await taskApi.put(`/api/tasks/${id}`, task);
    return response.data;
  },

  deleteTask: async (id: string) => {
    const response = await taskApi.delete(`/api/tasks/${id}`);
    return response.data;
  },

  updateTaskStatus: async (id: string, status: string) => {
    const response = await taskApi.patch(`/api/tasks/${id}/status`, null, {
      params: { status }
    });
    return response.data;
  },

  executeTask: async (id: string) => {
    const response = await taskApi.post(`/api/tasks/${id}/execute`);
    return response.data;
  },

  checkEditPermission: async (id: string) => {
    try {
      const response = await taskApi.get(`/api/tasks/${id}/edit-permission`);
      return { allowed: response.data?.allowed === true, message: response.data?.message };
    } catch (err) {
      const error = err as { response?: { status?: number; data?: { message?: string } } };
      if (error?.response?.status === 403) {
        return { allowed: false, message: error?.response?.data?.message || '仅创建部门可修改' };
      }
      throw err;
    }
  },

  getTaskDependencies: async (id: string) => {
    const response = await taskApi.get(`/api/tasks/${id}/dependencies`);
    return response.data; // { predecessors: Task[], successors: Task[] }
  },

  addDependency: async (taskId: string, dependencyTaskId: string, unlockStatus?: string) => {
    const response = await taskApi.post(`/api/tasks/${taskId}/dependencies`, {
      dependencyTaskId,
      unlockStatus: unlockStatus || undefined,
    });
    return response.data;
  },

  updateWorkflowStatus: async (id: string, body: { workflowStatus: string; commentStage?: string; commentResult?: string; commentMessage?: string; intermediatePath?: string; progress?: number }) => {
    const response = await taskApi.patch(`/api/tasks/${id}/workflow-status`, body);
    return response.data;
  },

  updateStatusWorkloads: async (id: string, statusWorkloads: Record<string, number>) => {
    const response = await taskApi.patch(`/api/tasks/${id}/status-workloads`, statusWorkloads);
    return response.data;
  },

  receiveTask: async (id: string) => {
    const response = await taskApi.post(`/api/tasks/${id}/receive`);
    return response.data;
  },

  assignTask: async (id: string, data: { departmentId: string; assigneeId?: string | null; qaDepartmentId?: string | null; qaAssigneeId?: string | null }) => {
    const response = await taskApi.post(`/api/tasks/${id}/assign`, data);
    return response.data;
  },

  decomposeTask: async (id: string, data: { category?: string; subTasks: Array<{ name: string; type: string; workload: number; workloadUnit?: string; departmentId?: string; assigneeId?: string; qaDepartmentId?: string; qaAssigneeId?: string }> }) => {
    const response = await taskApi.post(`/api/tasks/${id}/decompose`, data);
    return response.data;
  },

  revokeAssignment: async (id: string) => {
    const response = await taskApi.post(`/api/tasks/${id}/revoke-assignment`);
    return response.data;
  },

  requestUndoReceive: async (id: string) => {
    const response = await taskApi.post(`/api/tasks/${id}/request-undo-receive`);
    return response.data;
  },

  approveUndoReceive: async (id: string) => {
    const response = await taskApi.post(`/api/tasks/${id}/approve-undo-receive`);
    return response.data;
  },

  cancelUndoReceive: async (id: string) => {
    const response = await taskApi.post(`/api/tasks/${id}/cancel-undo-receive`);
    return response.data;
  },

  startProgress: async (id: string) => {
    const response = await taskApi.post(`/api/tasks/${id}/start-progress`);
    return response.data;
  },

  submitCompletion: async (id: string, data: { completedWorkload: number }) => {
    const response = await taskApi.post(`/api/tasks/${id}/submit-completion`, data);
    return response.data;
  },

  submitQa: async (id: string) => {
    const response = await taskApi.post(`/api/tasks/${id}/submit-qa`);
    return response.data;
  },

  acceptQa: async (id: string) => {
    const response = await taskApi.post(`/api/tasks/${id}/accept-qa`);
    return response.data;
  },

  qaApprove: async (id: string) => {
    const response = await taskApi.post(`/api/tasks/${id}/qa-approve`);
    return response.data;
  },

  qaReject: async (id: string) => {
    const response = await taskApi.post(`/api/tasks/${id}/qa-reject`);
    return response.data;
  },

  revokeQa: async (id: string) => {
    const response = await taskApi.post(`/api/tasks/${id}/revoke-qa`);
    return response.data;
  },

  getHandoffRecords: async (id: string) => {
    const response = await taskApi.get(`/api/tasks/${id}/handoff-records`);
    return response.data;
  },

  getBoardData: async () => {
    // Fetch real data
    try {
      const response = await taskApi.get('/api/tasks?size=100');
      const tasks: Task[] = response.data.content;
      
      const taskMap: Record<string, Task> = {};
      const columns: Record<string, TaskColumn> = {
        'PENDING': { id: 'PENDING', title: '待处理', taskIds: [] },
        'ASSIGNED': { id: 'ASSIGNED', title: '待接收', taskIds: [] },
        'RECEIVED': { id: 'RECEIVED', title: '已接收', taskIds: [] },
        'IN_PROGRESS': { id: 'IN_PROGRESS', title: '进行中', taskIds: [] },
        'SUBMITTED_FOR_QA': { id: 'SUBMITTED_FOR_QA', title: '提交质检', taskIds: [] },
        'QA_COMPLETING': { id: 'QA_COMPLETING', title: '质检中', taskIds: [] },
        'QA_COMPLETED': { id: 'QA_COMPLETED', title: '质检完成', taskIds: [] },
        'COMPLETED': { id: 'COMPLETED', title: '已完成', taskIds: [] },
        'PAUSED': { id: 'PAUSED', title: '已暂停', taskIds: [] },
        'FAILED': { id: 'FAILED', title: '失败', taskIds: [] }
      };

      tasks.forEach(task => {
        taskMap[task.id] = task;
        const status = task.status;
        if (!columns[status]) {
             // Fallback for unknown status
             columns[status] = { id: status, title: status, taskIds: [] };
        }
        columns[status].taskIds.push(task.id);
      });

      const defaultOrder = ['PENDING', 'ASSIGNED', 'RECEIVED', 'IN_PROGRESS', 'SUBMITTED_FOR_QA', 'QA_COMPLETING', 'QA_COMPLETED', 'COMPLETED', 'PAUSED', 'FAILED'];
      const extraOrder = Object.keys(columns).filter(status => !defaultOrder.includes(status));
      return {
        tasks: taskMap,
        columns,
        columnOrder: [...defaultOrder, ...extraOrder],
      };
    } catch (e) {
      console.error("Failed to fetch board data", e);
      return taskService.getMockBoardData();
    }
  },
  
  // Helper to fetch mock data if backend is not ready
  getExternalTaskTypes: async (): Promise<Array<{ type: string; source: string }>> => {
    try {
      const response = await taskApi.get('/api/external-systems/task-types');
      return response.data;
    } catch {
      return [];
    }
  },

  getMockBoardData: (): BoardData => {
    return {
      tasks: {
        'task-1': { id: 'task-1', name: '生产任务 A1', type: 'DATA_PROCESSING', status: 'PENDING', priority: 1, assigneeId: null, progress: 0, dueAt: '2023-12-31', createdAt: '2023-10-01' },
        'task-2': { id: 'task-2', name: '生产任务 A2', type: 'DATA_PROCESSING', status: 'IN_PROGRESS', priority: 2, assigneeId: '101', progress: 50, dueAt: '2023-12-31', createdAt: '2023-10-01' },
        'task-3': { id: 'task-3', name: '质量检查任务 B1', type: 'QA', status: 'SUBMITTED_FOR_QA', priority: 3, assigneeId: '102', progress: 100, dueAt: '2023-12-31', createdAt: '2023-10-01' },
      },
      columns: {
        'PENDING': { id: 'PENDING', title: '待处理', taskIds: ['task-1'] },
        'IN_PROGRESS': { id: 'IN_PROGRESS', title: '进行中', taskIds: ['task-2'] },
        'SUBMITTED_FOR_QA': { id: 'SUBMITTED_FOR_QA', title: '提交质检', taskIds: ['task-3'] },
        'COMPLETED': { id: 'COMPLETED', title: '已完成', taskIds: [] },
      },
      columnOrder: ['PENDING', 'IN_PROGRESS', 'SUBMITTED_FOR_QA', 'COMPLETED'],
    };
  }
};
