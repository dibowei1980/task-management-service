import { bridgeApi } from '../utils/api';
import type { ProjectListParams, ProjectCreatePayload, ProjectUpdatePayload, TaskUpdatePayload, MaskGeneratePayload, MaskSavePayload, MergeResultsPayload, SsoAuthResponse } from '../types/api';

export const bridgeAuthService = {
  logout: async () => {
    try {
      await bridgeApi.post('/api/v1/auth/logout');
    } catch {
    }
  },

  getMe: async () => {
    const response = await bridgeApi.get('/api/v1/auth/me');
    return response.data;
  },
};

export const bridgeSsoService = {
  getAuthUrl: async (redirectUri?: string): Promise<SsoAuthResponse> => {
    const params = redirectUri ? { redirect_uri: redirectUri } : {};
    const response = await bridgeApi.get('/api/v1/auth/sso/auth-url', { params });
    const data = response.data as { auth_url: string; state: string };
    return { authUrl: data.auth_url, state: data.state };
  },

  redirectToSsoLogin: async () => {
    const redirectUri = `${window.location.origin}/api/v1/auth/sso/callback`;
    const data = await bridgeSsoService.getAuthUrl(redirectUri);
    sessionStorage.setItem('sso_state', data.state);
    window.location.href = data.authUrl;
  },
};

export const bridgeProjectService = {
  list: async (params?: ProjectListParams) => {
    const response = await bridgeApi.get('/api/v1/projects', { params });
    return response.data;
  },

  get: async (projectId: string) => {
    const response = await bridgeApi.get(`/api/v1/projects/${projectId}`);
    return response.data;
  },

  create: async (payload: ProjectCreatePayload) => {
    const response = await bridgeApi.post('/api/v1/projects', payload);
    return response.data;
  },

  update: async (projectId: string, payload: ProjectUpdatePayload) => {
    const response = await bridgeApi.put(`/api/v1/projects/${projectId}`, payload);
    return response.data;
  },

  delete: async (projectId: string) => {
    await bridgeApi.delete(`/api/v1/projects/${projectId}`);
    return null;
  },

  submitToTms: async (projectId: string) => {
    const response = await bridgeApi.post(`/api/v1/projects/${projectId}/submit-to-tms`);
    return response.data;
  },

  getSubTasks: async (projectId: string) => {
    const response = await bridgeApi.get(`/api/v1/projects/${projectId}/jobs`);
    return response.data;
  },
};

export const bridgeTaskService = {
  getTask: async (taskId: string) => {
    const response = await bridgeApi.get(`/api/v1/tasks/${taskId}`);
    return response.data;
  },

  updateTask: async (taskId: string, payload: TaskUpdatePayload) => {
    const response = await bridgeApi.put(`/api/v1/tasks/${taskId}`, payload);
    return response.data;
  },

  domLocate: async (taskId: string) => {
    const response = await bridgeApi.post(`/api/v1/tasks/${taskId}/dom-locate`);
    return response.data;
  },

  preprocessGenerate: async (taskId: string) => {
    const response = await bridgeApi.post(`/api/v1/tasks/${taskId}/preprocess-generate`);
    return response.data;
  },

  preprocessSegments: async (taskId: string) => {
    const response = await bridgeApi.get(`/api/v1/tasks/${taskId}/preprocess-segments`);
    return response.data;
  },

  preprocessFile: async (taskId: string, path: string, responseType: 'arraybuffer' | 'json' = 'arraybuffer') => {
    const response = await bridgeApi.get(`/api/v1/tasks/${taskId}/preprocess-file`, {
      params: { path },
      responseType,
    });
    return response;
  },

  maskGenerate: async (taskId: string, payload: MaskGeneratePayload) => {
    const response = await bridgeApi.post(`/api/v1/tasks/${taskId}/mask-generate`, payload);
    return response.data;
  },

  maskSave: async (taskId: string, payload: MaskSavePayload) => {
    const response = await bridgeApi.post(`/api/v1/tasks/${taskId}/mask-save`, payload);
    return response.data;
  },

  startInpaint: async (taskId: string, payload: Record<string, string>) => {
    const response = await bridgeApi.post(`/api/v1/tasks/${taskId}/inpaint-start`, payload);
    return response.data;
  },

  getInpaintStatus: async (taskId: string, jobId?: string) => {
    const response = await bridgeApi.get(`/api/v1/tasks/${taskId}/inpaint-status`, {
      params: jobId ? { jobId } : undefined,
    });
    return response.data;
  },

  cancelInpaint: async (taskId: string, jobId?: string) => {
    const response = await bridgeApi.post(`/api/v1/tasks/${taskId}/inpaint-cancel`, null, {
      params: jobId ? { jobId } : undefined,
    });
    return response.data;
  },

  retryInpaint: async (taskId: string, jobId?: string) => {
    const response = await bridgeApi.post(`/api/v1/tasks/${taskId}/inpaint-retry`, null, {
      params: jobId ? { jobId } : undefined,
    });
    return response.data;
  },

  confirmInpaintResult: async (taskId: string, jobId: string, index: number) => {
    const response = await bridgeApi.post(`/api/v1/tasks/${taskId}/inpaint-result`, null, {
      params: { jobId, index },
    });
    return response.data;
  },

  inpaintFile: async (taskId: string, jobId: string, path: string) => {
    const response = await bridgeApi.get(`/api/v1/tasks/${taskId}/inpaint-file`, {
      params: { jobId, path },
      responseType: 'arraybuffer',
    });
    return response;
  },

  mergeResults: async (taskId: string, payload: MergeResultsPayload) => {
    const response = await bridgeApi.post(`/api/v1/tasks/${taskId}/merge-results`, payload);
    return response.data;
  },

  updateWorkflowStatus: async (taskId: string, body: {
    workflowStatus: string;
    commentStage?: string;
    commentResult?: string;
    commentMessage?: string;
    intermediatePath?: string;
    progress?: number;
  }) => {
    const response = await bridgeApi.patch(`/api/v1/tasks/${taskId}/workflow-status`, body);
    return response.data;
  },

  uploadShapefile: async (files: { shp: File; shx: File; dbf: File }) => {
    const form = new FormData();
    form.append('shp', files.shp);
    form.append('shx', files.shx);
    form.append('dbf', files.dbf);
    const response = await bridgeApi.post('/api/v1/shapefiles/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { shpFilePath: string };
  },

  executeTask: async (taskId: string) => {
    const response = await bridgeApi.post(`/api/v1/tasks/${taskId}/execute`);
    return response.data;
  },
};

export const bridgeSystemService = {
  getSystemStatus: async () => {
    try {
      const response = await bridgeApi.get('/api/v1/system/status');
      return response.data as { taskManagementConnected: boolean; tmsRegistered: boolean; localMode: boolean; ssoConnected: boolean; upmConnected: boolean };
    } catch {
      return { taskManagementConnected: false, tmsRegistered: false, localMode: true, ssoConnected: false, upmConnected: false };
    }
  },
};

export const bridgeUserService = {
  getUsers: async (roleName?: string) => {
    const params = roleName ? { roleName } : {};
    try {
      const response = await bridgeApi.get('/api/v1/upm/users', { params });
      return response.data;
    } catch {
      return [];
    }
  },

  getDepartments: async () => {
    try {
      const response = await bridgeApi.get('/api/v1/upm/departments');
      return response.data;
    } catch {
      return [];
    }
  },

  getProjectManagers: async () => {
    try {
      const response = await bridgeApi.get('/api/v1/upm/users', { params: { roleName: 'PROJECT_MANAGER' } });
      return response.data;
    } catch {
      return [];
    }
  },
};
