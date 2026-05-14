export interface BridgeUser {
  user_id: string;
  username: string;
  display_name: string;
  role: string;
  permissions: string[];
  department_id?: string;
  department_name?: string;
  login_type?: 'sso' | 'local';
}

export interface BridgeProject {
  project_id: string;
  task_type: string;
  task_name: string;
  input_params: Record<string, unknown>;
  callback_url: string;
  status: string;
  received_at: string;
  job_id: string | null;
}

export interface BridgeTask {
  id: string;
  name: string;
  type: string;
  category?: string;
  status: string;
  priority: number;
  assignee_id: string | null;
  project_leader_id?: string | null;
  operator_ids?: string[];
  inspector_ids?: string[];
  project_id?: string | null;
  department_id?: string;
  created_by_name?: string | null;
  created_department_id?: string | null;
  created_department_name?: string | null;
  external_system?: string | null;
  external_task_id?: string | null;
  external_url?: string | null;
  progress: number;
  due_at?: string | null;
  planned_due_at?: string | null;
  created_at: string;
  input_params?: string;
  output_results?: string;
  parent_task_id?: string;
  source?: 'local' | 'tms';
  tms_synced?: boolean;
}

export interface BridgeDepartment {
  id: string;
  department_name: string;
}
