import axios, { AxiosError, InternalAxiosRequestConfig, AxiosHeaders } from 'axios';
import { BRIDGE_SERVICE_URL } from './constants';

export const bridgeApi = axios.create({
  baseURL: BRIDGE_SERVICE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

bridgeApi.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('bridge_token');
  if (token) {
    const headers = config.headers ?? new AxiosHeaders();
    headers.set('Authorization', `Bearer ${token}`);
    config.headers = headers;
  }
  return config;
});

bridgeApi.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('bridge_token');
      localStorage.removeItem('bridge_user');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);
