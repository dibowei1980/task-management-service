import { taskApi } from '../utils/api';
import { User } from '../types';

function mapUser(raw: Record<string, unknown>): User {
  return {
    id: String(raw.id || raw.user_id || ''),
    username: String(raw.username || ''),
    email: String(raw.email || ''),
    phoneNumber: raw.phoneNumber ? String(raw.phoneNumber) : undefined,
    roles: Array.isArray(raw.roles) ? raw.roles as string[] : [],
    permissions: Array.isArray(raw.permissions) ? raw.permissions as string[] : [],
    departmentId: raw.departmentId ? String(raw.departmentId) : (raw.department_id ? String(raw.department_id) : null),
    departmentName: raw.departmentName ? String(raw.departmentName) : (raw.department_name ? String(raw.department_name) : null),
  };
}

export const userService = {
  getCurrentUser: async (): Promise<User> => {
    try {
      const response = await taskApi.get('/api/upm/me');
      return mapUser(response.data);
    } catch {
      return { id: '', username: '', email: '', roles: [], permissions: [] };
    }
  },

  getUsers: async (params?: { roleName?: string; permissionCode?: string; departmentId?: string }) => {
    try {
      const queryParams: Record<string, string> = {};
      if (params?.roleName) queryParams.roleName = params.roleName;
      if (params?.permissionCode) queryParams.permissionCode = params.permissionCode;
      if (params?.departmentId) queryParams.departmentId = params.departmentId;
      const response = await taskApi.get('/api/upm/users', { params: queryParams });
      const data = response.data;
      if (Array.isArray(data)) {
        return data.map(mapUser);
      }
      if (data?.error) {
        console.warn('[UPM] getUsers error:', data.message || data.error);
      }
      return [];
    } catch (err) {
      const error = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
      if (error?.response?.data?.error) {
        console.warn('[UPM] getUsers error:', error.response.data.message || error.response.data.error);
      }
      return [];
    }
  },

  getOperators: async () => {
    return userService.getUsers({ roleName: 'OPERATOR' });
  },

  getProjectManagers: async (departmentId?: string) => {
    return userService.getUsers({ permissionCode: 'department:manager', departmentId });
  },

  getEligibleProjectLeaders: async (departmentId?: string, category?: string): Promise<User[]> => {
    try {
      const queryParams: Record<string, string> = {};
      if (departmentId) queryParams.departmentId = departmentId;
      if (category) queryParams.category = category;
      const response = await taskApi.get('/api/upm/users/eligible-project-leaders', { params: queryParams });
      const data = response.data;
      if (Array.isArray(data)) {
        return data.map(mapUser);
      }
      return [];
    } catch {
      return [];
    }
  },

  getInspectors: async () => {
    return userService.getUsers({ roleName: 'INSPECTOR' });
  },

  getDepartments: async () => {
    try {
      const response = await taskApi.get('/api/upm/departments');
      const data = response.data;
      if (Array.isArray(data)) {
        return data.map((d: Record<string, unknown>) => ({
          id: String(d.id || ''),
          departmentName: String(d.departmentName || d.department_name || ''),
        }));
      }
      if (data?.error) {
        console.warn('[UPM] getDepartments error:', data.message || data.error);
      }
      return [];
    } catch (err) {
      const error = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
      if (error?.response?.data?.error) {
        console.warn('[UPM] getDepartments error:', error.response.data.message || error.response.data.error);
      }
      return [];
    }
  }
};
