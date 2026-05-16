export interface ProjectListParams {
  size?: number;
  sort?: string;
  category?: string;
  type?: string;
  source?: string;
  tmsSynced?: boolean;
  departmentId?: string;
  assigneeId?: string;
  status?: string;
  externalSystem?: string;
}

export interface ProjectCreatePayload {
  name?: string;
  category?: string;
  type?: string;
  taskType?: string;
  taskName?: string;
  priority?: number;
  status?: string;
  callbackUrl?: string;
  departmentId?: string | null;
  externalSystem?: string;
  externalTaskId?: string;
  createdByName?: string | null;
  createdDepartmentId?: string | null;
  createdDepartmentName?: string | null;
  projectId?: string;
  parentTaskId?: string;
  inputParams?: string;
  input_params?: string;
  projectLeaderId?: string | null;
  project_leader_id?: string | null;
}

export interface ProjectUpdatePayload {
  name?: string;
  status?: string;
  priority?: number;
  inputParams?: string;
  projectLeaderId?: string | null;
  departmentId?: string;
  assigneeId?: string | null;
  operatorIds?: string[];
}

export interface TaskUpdatePayload {
  assigneeId?: string | null;
  assignee_id?: string | null;
  operatorIds?: string[];
  operator_ids?: string[];
  priority?: number;
  inputParams?: string;
  projectLeaderId?: string | null;
  departmentId?: string;
  status?: string;
}

export interface MaskGeneratePayload {
  batch?: Array<{ segment_json_path?: string; segmentName?: string }>;
  segmentJsonPath?: string;
  segmentName?: string;
  inputParams?: Record<string, unknown>;
}

export interface MaskSavePayload {
  segment_json_path: string;
  mask_png_base64: string;
  mask_cut_png_base64?: string;
}

export interface MergeResultsPayload {
  overwrite?: boolean;
}

export interface SsoAuthResponse {
  authUrl: string;
  state: string;
}
