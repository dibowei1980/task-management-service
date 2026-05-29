import { taskApi } from '../utils/api';

export interface TaskTypeRegistrationResponse {
  id: string;
  code: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  description: string | null;
  sourceSystem: string;
  systemId: string;
  displayName: string | null;
  serviceUrl: string | null;
  dashboardUrl: string | null;
  callbackPath: string | null;
  ssoClientId: string | null;
  interfaceManifest: string | null;
  resultViewUrl: string | null;
  callbackFields: string[] | null;
  resultQueryPath: string | null;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  approvedGroupId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const CALLBACK_FIELD_OPTIONS: { key: string; label: string; required: boolean }[] = [
  { key: 'TASK_ID', label: '任务ID', required: true },
  { key: 'STATUS', label: '任务状态', required: true },
  { key: 'NAME', label: '任务名称', required: true },
  { key: 'OPERATOR', label: '操作员', required: true },
  { key: 'WORKLOAD', label: '任务量', required: true },
  { key: 'UNIT', label: '任务计量单位', required: true },
  { key: 'START_TIME', label: '开始时间', required: false },
  { key: 'END_TIME', label: '完成时间', required: false },
  { key: 'LOCATION', label: '位置信息', required: false },
  { key: 'REMARKS', label: '备注信息', required: false },
];

export const taskTypeRegistrationService = {
  list: async (status?: string): Promise<TaskTypeRegistrationResponse[]> => {
    const params = status ? { status } : {};
    const res = await taskApi.get<TaskTypeRegistrationResponse[]>('/api/task-type-registrations', { params });
    return res.data;
  },
  getById: async (id: string): Promise<TaskTypeRegistrationResponse> => {
    const res = await taskApi.get<TaskTypeRegistrationResponse>(`/api/task-type-registrations/${id}`);
    return res.data;
  },
  approve: async (id: string, targetGroupId: string): Promise<TaskTypeRegistrationResponse> => {
    const res = await taskApi.post<TaskTypeRegistrationResponse>(`/api/task-type-registrations/${id}/approve`, { targetGroupId });
    return res.data;
  },
  reject: async (id: string, rejectReason: string): Promise<TaskTypeRegistrationResponse> => {
    const res = await taskApi.post<TaskTypeRegistrationResponse>(`/api/task-type-registrations/${id}/reject`, { rejectReason });
    return res.data;
  },
  updateCallbackFields: async (id: string, callbackFields: string[]): Promise<TaskTypeRegistrationResponse> => {
    const res = await taskApi.put<TaskTypeRegistrationResponse>(`/api/task-type-registrations/${id}/callback-fields`, { callbackFields });
    return res.data;
  },
  delete: async (id: string): Promise<void> => {
    await taskApi.delete(`/api/task-type-registrations/${id}`);
  },
};
