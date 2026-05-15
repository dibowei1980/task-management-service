import { BridgeUser } from '../types';

const TOKEN_KEY = 'bridge_token';
const USER_KEY = 'bridge_user';

export const authStorage = {
  getToken: (): string | null => sessionStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  removeToken: () => sessionStorage.removeItem(TOKEN_KEY),
  getUser: (): BridgeUser | null => {
    const raw = sessionStorage.getItem(USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as BridgeUser; } catch { return null; }
  },
  setUser: (user: BridgeUser) => sessionStorage.setItem(USER_KEY, JSON.stringify(user)),
  removeUser: () => sessionStorage.removeItem(USER_KEY),
  clear: () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  },
};

export const prefStorage = {
  get: <T>(key: string, fallback: T): T => {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  },
  set: (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value)),
  remove: (key: string) => localStorage.removeItem(key),
};
