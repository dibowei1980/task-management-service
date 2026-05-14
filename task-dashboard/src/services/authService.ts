import { taskApi } from '../utils/api';

export const authService = {
  login: async (credentials: { username: string; password: string }) => {
    const response = await taskApi.post('/api/upm/login', credentials);
    return response.data;
  },
};
