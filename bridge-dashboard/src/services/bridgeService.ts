import { bridgeApi } from '../utils/api';
import type { ProjectListParams, ProjectCreatePayload, ProjectUpdatePayload, TaskUpdatePayload, MaskGeneratePayload, MaskSavePayload, MergeResultsPayload } from '../types/api';

export const bridgeAuthService = {
  upmLogin: async (credentials: { username: string; password: string }) => {
    const response = await bridgeApi.post('/api/v1/auth/upm/login', credentials);
    return response.data;
  },

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
  redirectToSsoLogin: async () => {
    const redirectUri = `${window.location.origin}/sso/callback`;
    try {
      const response = await bridgeApi.get('/api/v1/auth/sso/auth-url', {
        params: { redirect_uri: redirectUri },
        timeout: 10000,
      });
      const data = response.data as { authUrl: string; state: string };
      sessionStorage.setItem('sso_state', data.state);
      window.location.href = data.authUrl;
    } catch (error: unknown) {
      console.error('Failed to get SSO auth URL:', error);
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Network request failed') || msg.includes('timeout')) {
        window.location.href = `/?error=backend_unavailable`;
      } else {
        window.location.href = `/?error=sso`;
      }
    }
  },

  exchangeCode: async (code: string) => {
    const response = await bridgeApi.post('/api/v1/auth/sso/token', { code }, { timeout: 20000 });
    return response.data;
  },

  validateState: (state: string, clear: boolean = true): boolean => {
    const savedState = sessionStorage.getItem('sso_state');
    if (savedState && savedState === state) {
      if (clear) {
        sessionStorage.removeItem('sso_state');
      }
      return true;
    }
    return false;
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

  localEditStart: async (taskId: string, payload: {
    image_path: string;
    mask_data: string;
    prompt: string;
    num_candidates: number;
    crop_bounds: string;
  }) => {
    const response = await bridgeApi.post(`/api/v1/tasks/${taskId}/local-edit-start`, payload);
    return response.data;
  },

  localEditStatus: async (taskId: string) => {
    const response = await bridgeApi.get(`/api/v1/tasks/${taskId}/local-edit-status`);
    return response.data;
  },

  localEditApply: async (taskId: string, payload: {
    job_id: string;
    result_index: number;
    crop_bounds: string;
    original_image_path: string;
  }) => {
    const response = await bridgeApi.post(`/api/v1/tasks/${taskId}/local-edit-apply`, payload);
    return response.data;
  },

  localEditFile: async (taskId: string, path: string) => {
    const response = await bridgeApi.get(`/api/v1/tasks/${taskId}/local-edit-file`, {
      params: { path },
      responseType: 'arraybuffer',
    });
    return response;
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

export type UserSettings = {
  enableShadow: boolean;
  polygonDilateIterations: number;
  sam2DilateIterations: number;
  sam2LightExpandPixels: number;
  inpaintCount: number;
  blurRadius: number;
  expandPixels: number;
  localEditTool: 'brush' | 'erase' | 'polygon';
  localEditBrushSize: number;
  localEditPrompt: string;
  localEditNumCandidates: number;
};

export const bridgeSettingsService = {
  getSettings: async (): Promise<UserSettings> => {
    const response = await bridgeApi.get('/api/v1/user-settings');
    return response.data as UserSettings;
  },

  updateSettings: async (settings: Partial<UserSettings>): Promise<UserSettings> => {
    const response = await bridgeApi.put('/api/v1/user-settings', settings);
    return response.data as UserSettings;
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

  browse: async (path?: string, filter?: string) => {
    const params: Record<string, string> = {};
    if (path) params.path = path;
    if (filter) params.filter = filter;
    const response = await bridgeApi.get('/api/v1/system/browse', { params });
    return response.data as {
      currentPath: string;
      parentPath: string | null;
      items: Array<{ name: string; path: string; type: 'directory' | 'file' }>;
    };
  },
};

export const bridgeUserService = {
  getUsers: async (roleName?: string, departmentId?: string) => {
    const params: Record<string, string> = {};
    if (roleName) params.roleName = roleName;
    if (departmentId) params.departmentId = departmentId;
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
