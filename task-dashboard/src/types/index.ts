export interface User {
  id: string;
  username: string;
  email: string;
  phoneNumber?: string;
  roles: string[];
  permissions: string[];
  departmentId?: string | null;
  departmentName?: string | null;
}

export interface Task {
  id: string;
  name: string;
  type: string;
  category?: string;
  status: string;
  priority: number;
  assigneeId: string | null;
  previousAssigneeId?: string | null;
  assignerId?: string | null;
  projectLeaderId?: string | null;
  operatorIds?: string[];
  inspectorIds?: string[];
  projectId?: string | null;
  departmentId?: string;
  createdByName?: string | null;
  createdById?: string | null;
  createdDepartmentId?: string | null;
  createdDepartmentName?: string | null;
  externalSystem?: string | null;
  externalTaskId?: string | null;
  externalUrl?: string | null;
  progress: number;
  dueAt?: string | null;
  plannedDueAt?: string | null;
  createdAt: string;
  inputParams?: string; // JSON string
  outputResults?: string; // JSON string
  parentTaskId?: string;
  receivedAt?: string | null;
  undoRequestedAt?: string | null;
  workload?: number | null;
  workloadUnit?: string | null;
  weight?: number | null;
  compositionMode?: 'HOMOGENEOUS' | 'HETEROGENEOUS' | null;
  depthLevel?: number;
  workflowStatus?: string | null;
  remarks?: string | null;
  attachmentCount?: number;
  assignAttachmentCount?: number;
  submitQaAttachmentCount?: number;
  statusWorkloads?: string | null;
  inProgressWeight?: number | null;
  inProgressCompletedWorkload?: number | null;
  qaDepartmentId?: string | null;
  qaAssigneeId?: string | null;
  hasChildren?: boolean | null;
  directChildCount?: number | null;
  controllerId?: string | null;
  canUpdate?: boolean | null;
  canRevokeAssignment?: boolean | null;
  canUndoReceive?: boolean | null;
  _cardKey?: string;
  _swStatus?: string;
  _swWorkload?: number;
  _isMainStatus?: boolean;
  _isNonLeaf?: boolean;
  _aggregatedUnit?: string | null;
  _leafCount?: number;
  _inProgressCompletedWorkloadForBar?: number;
}

export interface MeasurementUnitDefinition {
  id: string;
  code: string;
  name: string;
  builtin: boolean;
  enabled: boolean;
  baseUnitCode?: string | null;
  baseUnitName?: string | null;
  conversionFactor?: number | null;
  basic: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectTypeDefinition {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  source: string;
  enabled: boolean;
  referenceCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskColumn {
  id: string;
  title: string;
  taskIds: string[];
}

export interface BoardData {
  tasks: { [key: string]: Task };
  columns: { [key: string]: TaskColumn };
  columnOrder: string[];
}
