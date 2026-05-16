export interface BridgeUser {
  userId: string;
  username: string;
  displayName: string;
  role: string;
  permissions: string[];
  departmentId?: string;
  departmentName?: string;
}

export interface BridgeProject {
  projectId: string;
  taskType: string;
  taskName: string;
  inputParams: Record<string, unknown>;
  callbackUrl: string;
  status: string;
  receivedAt: string;
  jobId: string | null;
}

export interface BridgeTask {
  id: string;
  name: string;
  type: string;
  category?: string;
  status: string;
  priority: number;
  assigneeId: string | null;
  projectLeaderId?: string | null;
  operatorIds?: string[];
  inspectorIds?: string[];
  projectId?: string | null;
  departmentId?: string;
  createdByName?: string | null;
  createdDepartmentId?: string | null;
  createdDepartmentName?: string | null;
  externalSystem?: string | null;
  externalTaskId?: string | null;
  externalUrl?: string | null;
  progress: number;
  dueAt?: string | null;
  plannedDueAt?: string | null;
  createdAt: string;
  inputParams?: string;
  outputResults?: string;
  parentTaskId?: string;
  source?: 'local' | 'tms';
  tmsSynced?: boolean;
}

export interface BridgeDepartment {
  id: string;
  departmentName: string;
}
