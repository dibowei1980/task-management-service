import { taskService } from './taskService';
import { Task } from '../types';

export interface AssignParams {
  departmentId: string;
  assigneeId?: string | null;
  qaDepartmentId?: string | null;
  qaAssigneeId?: string | null;
}

export interface DecomposeParams {
  subTasks: Array<{
    name: string;
    type: string;
    workload: number;
    workloadUnit?: string;
    departmentId?: string;
    assigneeId?: string;
    qaDepartmentId?: string;
    qaAssigneeId?: string;
  }>;
}

export interface SubmitCompletionParams {
  completedWorkload: number;
}

export const taskActionService = {
  receive: async (taskId: string): Promise<Task> => {
    return taskService.receiveTask(taskId);
  },

  assign: async (taskId: string, params: AssignParams): Promise<Task> => {
    return taskService.assignTask(taskId, params);
  },

  decompose: async (taskId: string, params: DecomposeParams): Promise<Task> => {
    return taskService.decomposeTask(taskId, params);
  },

  revokeAssignment: async (taskId: string): Promise<Task> => {
    return taskService.revokeAssignment(taskId);
  },

  startProgress: async (taskId: string): Promise<Task> => {
    return taskService.startProgress(taskId);
  },

  submitCompletion: async (taskId: string, params: SubmitCompletionParams): Promise<Task> => {
    return taskService.submitCompletion(taskId, params);
  },

  revokeQa: async (taskId: string): Promise<Task> => {
    return taskService.revokeQa(taskId);
  },
};
