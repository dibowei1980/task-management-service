import axios, { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { TASK_SERVICE_URL } from './constants';

// Task Service Client
export const taskApi = axios.create({
  baseURL: TASK_SERVICE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth header
const authInterceptor = (config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('token');
  const sessionId = localStorage.getItem('session_id');

  if (sessionId) {
    const headers = config.headers ?? new AxiosHeaders();
    headers.set('X-Session-Id', sessionId);
    config.headers = headers;
    return config;
  }

  if (token) {
    const headers = config.headers ?? new AxiosHeaders();
    headers.set('Authorization', `Bearer ${token}`);
    config.headers = headers;
    return config;
  }

  return config;
};

taskApi.interceptors.request.use(authInterceptor);

// Response interceptor for 401 (optional: redirect to login)
const errorInterceptor = (error: AxiosError) => {
  if (error.response?.status === 401) {
    const url = error.config?.url || '';
    const isSsoEndpoint = url.startsWith('/api/sso/');
    if (!isSsoEndpoint) {
      localStorage.removeItem('token');
      localStorage.removeItem('session_id');
      localStorage.removeItem('user');
      window.location.href = '/login?error=session_expired';
    }
  }
  return Promise.reject(error);
};

taskApi.interceptors.response.use((response) => response, errorInterceptor);
