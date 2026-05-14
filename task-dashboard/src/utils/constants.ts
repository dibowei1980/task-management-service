export const TASK_SERVICE_URL = import.meta.env.VITE_TASK_SERVICE_URL || 'http://localhost:8082';

// 统一约束：task-dashboard 仅通过 taskApi 访问平台接口，不直连 user-service。

// Permission-based helpers
// user.authorities contains both ROLE_* strings and permission strings like "task:read_global"

/** Check if user has any of the given permissions (case-insensitive) */
export const hasAnyPermission = (authorities: string[] | undefined, ...permissions: string[]): boolean => {
  if (!authorities || authorities.length === 0) return false;
  const lowerAuths = authorities.map(a => a.toLowerCase());
  return permissions.some(p => lowerAuths.includes(p.toLowerCase()));
};

/** Check if user has all of the given permissions (case-insensitive) */
export const hasAllPermissions = (authorities: string[] | undefined, ...permissions: string[]): boolean => {
  if (!authorities || authorities.length === 0) return false;
  const lowerAuths = authorities.map(a => a.toLowerCase());
  return permissions.every(p => lowerAuths.includes(p.toLowerCase()));
};

// --- Deprecated: role-based constants (kept for backward compatibility, do not use in new code) ---
/** @deprecated Use hasAnyPermission() with permission strings instead */
export const BACKEND_ROLES = {
  PRODUCTION_MANAGER: 'ROLE_PRODUCTION_MANAGER',
  DEPARTMENT_ADMIN: 'ROLE_DEPARTMENT_ADMIN',
  PROJECT_MANAGER: 'ROLE_PROJECT_MANAGER',
  OPERATOR: 'ROLE_OPERATOR',
  INSPECTOR: 'ROLE_INSPECTOR',
  GLOBAL_OBSERVER: 'ROLE_GLOBAL_OBSERVER',
  PROJECT_OBSERVER: 'ROLE_PROJECT_OBSERVER',
  TASK_OBSERVER: 'ROLE_TASK_OBSERVER',
};

/** @deprecated Use hasAnyPermission() with permission strings instead */
export const ROLES = {
  MANAGER: [BACKEND_ROLES.PRODUCTION_MANAGER, BACKEND_ROLES.DEPARTMENT_ADMIN, BACKEND_ROLES.PROJECT_MANAGER],
  OPERATOR: [BACKEND_ROLES.OPERATOR],
  QA: [BACKEND_ROLES.INSPECTOR],
  OBSERVER: [BACKEND_ROLES.GLOBAL_OBSERVER, BACKEND_ROLES.PROJECT_OBSERVER, BACKEND_ROLES.TASK_OBSERVER],
};

/** @deprecated Use hasAnyPermission() instead */
export const hasRole = (userRoles: string[], allowedGroup: string[]) => {
  if (!userRoles) return false;
  return userRoles.some(role => allowedGroup.includes(role));
};

export const TASK_STATUS = {
  PENDING: 'PENDING',
  ASSIGNED: 'ASSIGNED',
  RECEIVED: 'RECEIVED',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED_FOR_QA: 'SUBMITTED_FOR_QA',
  QA_COMPLETING: 'QA_COMPLETING',
  QA_COMPLETED: 'QA_COMPLETED',
  COMPLETED: 'COMPLETED',
  PAUSED: 'PAUSED',
  FAILED: 'FAILED',
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  PENDING: '待处理',
  ASSIGNED: '待接收',
  RECEIVED: '已接收',
  IN_PROGRESS: '进行中',
  SUBMITTED_FOR_QA: '待质检',
  QA_COMPLETING: '质检中',
  QA_COMPLETED: '质检完成',
  COMPLETED: '已完成',
  PAUSED: '已暂停',
  FAILED: '失败',
};

export const WORKFLOW_STATUS_LABELS: Record<string, string> = {
  PENDING_ACCEPTANCE: '待验收',
  ACCEPTANCE_COMPLETED: '验收完成',
  ARCHIVED: '项目归档',
};

export const PROJECT_TYPE_LABELS: Record<string, string> = {
  DATA_COLLECTION: '数据采集',
  DATA_PROCESSING: '数据处理',
  QUALITY_ASSURANCE: '质量检查',
  DATA_PUBLISHING: '数据发布',
};

export const MAX_TREE_DEPTH = 5;

export const TASK_CATEGORY_LABELS: Record<string, string> = {
  PROJECT: '项目',
  PHASE: '阶段',
  SYSTEM_TASK: '系统任务',
  OPERATION_TASK: '作业任务',
  SELF_CHECK_TASK: '自检任务',
};
