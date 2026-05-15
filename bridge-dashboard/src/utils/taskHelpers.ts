import { BridgeTask } from '../types';

export const getTaskFailureMessage = (project: BridgeTask): string => {
  const out = project.outputResults;
  if (typeof out === 'string') {
    const s = out.trim();
    if (!s) return '分解失败';
    try {
      const obj = JSON.parse(s) as { error?: unknown; raw?: unknown };
      if (obj?.error != null && String(obj.error).trim()) return String(obj.error);
      if (obj?.raw != null && String(obj.raw).trim()) return String(obj.raw);
      return s;
    } catch {
      return s;
    }
  }
  if (out && typeof out === 'object') {
    const obj = out as { error?: unknown; raw?: unknown };
    if (obj?.error != null && String(obj.error).trim()) return String(obj.error);
    if (obj?.raw != null && String(obj.raw).trim()) return String(obj.raw);
    try {
      return JSON.stringify(out);
    } catch {
      return '分解失败';
    }
  }
  return '分解失败';
};

export const getErrorMessage = (err: unknown, fallback: string): string => {
  if (err instanceof Error && err.message) return err.message;
  const error = err as { response?: { status?: number; data?: { message?: string; error?: string } } };
  const status = error?.response?.status;
  const data = error?.response?.data;
  const message = data?.message;
  const errorCode = data?.error;
  if (status === 403) return (typeof message === 'string' && message) ? message : '无权限执行该操作';
  if (status === 404) return (typeof message === 'string' && message) ? message : '项目不存在或已被删除';
  if (typeof message === 'string' && message) return message;
  if (typeof errorCode === 'string' && errorCode) return errorCode;
  return fallback;
};