import { useCallback } from 'react';
import { Task } from '../types';
import { taskService } from '../services/taskService';
import { hasAnyPermission } from '../utils/constants';

interface UseDeleteTaskOptions {
  currentUserId?: string;
  authorities?: string[];
  onDeleted: () => void | Promise<void>;
}

const canDeleteTask = (task: Task, currentUserId?: string, authorities: string[] = []) => {
  const isCreator = !!currentUserId && task.createdById === currentUserId;
  const hasDeletePermission = hasAnyPermission(authorities, 'system:admin', 'project:delete_global', 'project:delete_department', 'task:delete_global', 'task:delete_department');
  return isCreator || hasDeletePermission;
};

const isSystemAdmin = (authorities: string[] = []) => {
  return hasAnyPermission(authorities, 'system:admin');
};

export const useDeleteTask = ({ currentUserId, authorities = [], onDeleted }: UseDeleteTaskOptions) => {
  const deleteTask = useCallback(async (task: Task) => {
    if (!canDeleteTask(task, currentUserId, authorities)) {
      alert('只有创建人或具备删除权限的用户可以删除该节点');
      return;
    }

    if (!isSystemAdmin(authorities) && task.progress != null && task.progress > 0) {
      alert('节点进度大于 0，不能删除');
      return;
    }

    const hasChildren = task.hasChildren === true || (task.directChildCount ?? 0) > 0;
    const message = hasChildren
      ? `确认删除「${task.name}」及其所有子节点？此操作不可恢复。`
      : `确认删除「${task.name}」？此操作不可恢复。`;

    if (!window.confirm(message)) return;

    try {
      await taskService.deleteTask(task.id);
      await onDeleted();
    } catch (err) {
      const error = err as { response?: { status?: number; data?: { message?: string } } };
      if (error?.response?.status === 403) {
        alert(error?.response?.data?.message || '无权限删除该节点');
      } else {
        alert(error?.response?.data?.message || '删除失败');
      }
    }
  }, [authorities, currentUserId, onDeleted]);

  return { deleteTask, canDeleteTask: (task: Task) => canDeleteTask(task, currentUserId, authorities) };
};
