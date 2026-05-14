import { bridgeApi } from '../utils/api';

export const bridgeAuthService = {
  login: async (credentials: { username: string; password: string }) => {
    const response = await bridgeApi.post('/api/auth/login', credentials);
    return response.data;
  },

  logout: async () => {
    try {
      await bridgeApi.post('/api/auth/logout');
    } catch {
    }
  },

  getMe: async () => {
    const response = await bridgeApi.get('/api/auth/me');
    return response.data;
  },
};

export const bridgeSsoService = {
  getAuthUrl: async (redirectUri?: string) => {
    const params = redirectUri ? { redirect_uri: redirectUri } : {};
    const response = await bridgeApi.get('/api/sso/auth-url', { params });
    return response.data as { auth_url: string; state: string };
  },

  redirectToSsoLogin: async () => {
    const redirectUri = `${window.location.origin}/api/auth/sso/callback`;
    const data = await bridgeSsoService.getAuthUrl(redirectUri);
    sessionStorage.setItem('sso_state', data.state);
    window.location.href = data.auth_url;
  },
};

export const bridgeProjectService = {
  list: async (params?: Record<string, unknown>) => {
    const response = await bridgeApi.get('/api/projects', { params });
    return response.data;
  },

  get: async (projectId: string) => {
    const response = await bridgeApi.get(`/api/projects/${projectId}`);
    return response.data;
  },

  create: async (payload: Record<string, unknown>) => {
    const response = await bridgeApi.post('/api/projects', payload);
    return response.data;
  },

  update: async (projectId: string, payload: Record<string, unknown>) => {
    const response = await bridgeApi.put(`/api/projects/${projectId}`, payload);
    return response.data;
  },

  delete: async (projectId: string) => {
    const response = await bridgeApi.delete(`/api/projects/${projectId}`);
    return response.data;
  },

  submitToTms: async (projectId: string) => {
    const response = await bridgeApi.post(`/api/projects/${projectId}/submit-to-tms`);
    return response.data;
  },

  getSubTasks: async (projectId: string) => {
    const response = await bridgeApi.get(`/api/projects/${projectId}/jobs`);
    return response.data;
  },
};

export const bridgeTaskService = {
  getTask: async (taskId: string) => {
    const response = await bridgeApi.get(`/api/tasks/${taskId}`);
    return response.data;
  },

  updateTask: async (taskId: string, payload: Record<string, unknown>) => {
    const response = await bridgeApi.put(`/api/tasks/${taskId}`, payload);
    return response.data;
  },

  domLocate: async (taskId: string) => {
    const response = await bridgeApi.post(`/api/tasks/${taskId}/dom-locate`);
    return response.data;
  },

  preprocessGenerate: async (taskId: string) => {
    const response = await bridgeApi.post(`/api/tasks/${taskId}/preprocess-generate`);
    return response.data;
  },

  preprocessSegments: async (taskId: string) => {
    const response = await bridgeApi.get(`/api/tasks/${taskId}/preprocess-segments`);
    return response.data;
  },

  preprocessFile: async (taskId: string, path: string, responseType: 'arraybuffer' | 'json' = 'arraybuffer') => {
    const response = await bridgeApi.get(`/api/tasks/${taskId}/preprocess-file`, {
      params: { path },
      responseType,
    });
    return response;
  },

  maskGenerate: async (taskId: string, payload: Record<string, unknown>) => {
    const response = await bridgeApi.post(`/api/tasks/${taskId}/mask-generate`, payload);
    return response.data;
  },

  maskSave: async (taskId: string, payload: Record<string, unknown>) => {
    const response = await bridgeApi.post(`/api/tasks/${taskId}/mask-save`, payload);
    return response.data;
  },

  startInpaint: async (taskId: string, payload: Record<string, string>) => {
    const response = await bridgeApi.post(`/api/tasks/${taskId}/inpaint-start`, payload);
    return response.data;
  },

  getInpaintStatus: async (taskId: string, jobId?: string) => {
    const response = await bridgeApi.get(`/api/tasks/${taskId}/inpaint-status`, {
      params: jobId ? { jobId } : undefined,
    });
    return response.data;
  },

  cancelInpaint: async (taskId: string, jobId?: string) => {
    const response = await bridgeApi.post(`/api/tasks/${taskId}/inpaint-cancel`, null, {
      params: jobId ? { jobId } : undefined,
    });
    return response.data;
  },

  retryInpaint: async (taskId: string, jobId?: string) => {
    const response = await bridgeApi.post(`/api/tasks/${taskId}/inpaint-retry`, null, {
      params: jobId ? { jobId } : undefined,
    });
    return response.data;
  },

  confirmInpaintResult: async (taskId: string, jobId: string, index: number) => {
    const response = await bridgeApi.post(`/api/tasks/${taskId}/inpaint-result`, null, {
      params: { jobId, index },
    });
    return response.data;
  },

  inpaintFile: async (taskId: string, jobId: string, path: string) => {
    const response = await bridgeApi.get(`/api/tasks/${taskId}/inpaint-file`, {
      params: { jobId, path },
      responseType: 'arraybuffer',
    });
    return response;
  },

  mergeResults: async (taskId: string, payload: Record<string, unknown>) => {
    const response = await bridgeApi.post(`/api/tasks/${taskId}/merge-results`, payload);
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
    const response = await bridgeApi.patch(`/api/tasks/${taskId}/workflow-status`, body);
    return response.data;
  },

  uploadShapefile: async (files: { shp: File; shx: File; dbf: File }) => {
    const form = new FormData();
    form.append('shp', files.shp);
    form.append('shx', files.shx);
    form.append('dbf', files.dbf);
    const response = await bridgeApi.post('/api/shapefiles/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { shpFilePath: string };
  },

  executeTask: async (taskId: string) => {
    const response = await bridgeApi.post(`/api/tasks/${taskId}/execute`);
    return response.data;
  },
};

export const bridgeSystemService = {
  getSystemStatus: async () => {
    try {
      const response = await bridgeApi.get('/api/system/status');
      return response.data as { task_management_connected: boolean; sso_connected: boolean; upm_connected: boolean };
    } catch {
      return { task_management_connected: false, sso_connected: false, upm_connected: false };
    }
  },
};

export const bridgeUserService = {
  getUsers: async (roleName?: string) => {
    const params = roleName ? { roleName } : {};
    try {
      const response = await bridgeApi.get('/api/upm/users', { params });
      return response.data;
    } catch {
      return [];
    }
  },

  getDepartments: async () => {
    try {
      const response = await bridgeApi.get('/api/upm/departments');
      return response.data;
    } catch {
      return [];
    }
  },

  getProjectManagers: async () => {
    try {
      const response = await bridgeApi.get('/api/upm/users', { params: { roleName: 'PROJECT_MANAGER' } });
      return response.data;
    } catch {
      return [];
    }
  },
};
