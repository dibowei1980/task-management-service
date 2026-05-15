import axios, { AxiosError, InternalAxiosRequestConfig, AxiosHeaders, AxiosResponse } from 'axios';
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
  (response: AxiosResponse) => {
    if (response.status === 204) {
      response.data = null;
      return response;
    }
    if (
      response.data &&
      typeof response.data === 'object' &&
      'data' in response.data &&
      !('error' in response.data)
    ) {
      const meta = response.data.meta;
      const links = response.data.links;
      if (meta || links) {
        response.data = response.data.data;
        (response.data as Record<string, unknown>)._meta = meta || undefined;
        (response.data as Record<string, unknown>)._links = links || undefined;
      } else {
        response.data = response.data.data;
      }
    }
    return response;
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('bridge_token');
      localStorage.removeItem('bridge_user');
      window.location.href = '/';
      return Promise.reject(error);
    }

    if (error.response?.data && typeof error.response.data === 'object') {
      const body = error.response.data as Record<string, unknown>;
      if (body.error && typeof body.error === 'object') {
        const errObj = body.error as Record<string, unknown>;
        const message = typeof errObj.message === 'string' ? errObj.message : String(errObj.code || 'Unknown error');
        (error as unknown as Record<string, unknown>).userMessage = message;
        (error as unknown as Record<string, unknown>).errorCode = errObj.code;
        (error as unknown as Record<string, unknown>).errorDetails = errObj.details;
      } else if (typeof body.error === 'string') {
        (error as unknown as Record<string, unknown>).userMessage = body.error;
      }
    }

    return Promise.reject(error);
  }
);
