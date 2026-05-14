import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { ssoAuthService } from '../services/ssoAuthService';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token') || localStorage.getItem('session_id'));
  const [isLoading, setIsLoading] = useState(true);
  const justLoggedInRef = useRef(false);

  useEffect(() => {
    const initAuth = async () => {
      console.log('[AuthContext] initAuth started');
      const storedSessionId = localStorage.getItem('session_id');
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

      console.log('[AuthContext] Storage state:', {
        hasSessionId: !!storedSessionId,
        hasToken: !!storedToken,
        hasUser: !!storedUser,
        justLoggedIn: justLoggedInRef.current
      });

      if (storedSessionId && storedUser) {
        if (justLoggedInRef.current) {
          console.log('[AuthContext] Just logged in, skipping validation');
          justLoggedInRef.current = false;
          setToken(storedSessionId);
          setUser(JSON.parse(storedUser));
          setIsLoading(false);
          return;
        }

        // SSO模式：验证session是否有效
        console.log('[AuthContext] Validating session:', storedSessionId);
        try {
          const validation = await ssoAuthService.validateSession(storedSessionId);
          console.log('[AuthContext] Validation result:', validation);
          if (validation.authenticated) {
            console.log('[AuthContext] Session valid, setting user');
            setToken(storedSessionId);
            setUser(JSON.parse(storedUser));
          } else {
            // Session已过期，清理本地存储并重定向到登录页
            console.log('[AuthContext] Session not authenticated, clearing storage');
            localStorage.removeItem('session_id');
            localStorage.removeItem('user');
            localStorage.removeItem('token');
            // 只有不在登录页时才重定向
            if (!window.location.pathname.includes('/login')) {
              console.log('[AuthContext] Redirecting to login with session_expired');
              window.location.href = '/login?error=session_expired';
              return;
            }
          }
        } catch (e: unknown) {
          console.error('[AuthContext] Session validation failed:', e);
          localStorage.removeItem('session_id');
          localStorage.removeItem('user');
          localStorage.removeItem('token');
          if (!window.location.pathname.includes('/login')) {
            const msg = e instanceof Error ? e.message : '';
            if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Network request failed')) {
              window.location.href = '/login?error=backend_unavailable';
            } else {
              window.location.href = '/login?error=session_expired';
            }
            return;
          }
        }
      } else if (storedToken && storedUser) {
        // JWT兼容模式
        console.log('[AuthContext] Using JWT mode');
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
      setIsLoading(false);
      console.log('[AuthContext] initAuth completed');
    };

    initAuth();
  }, []);

  const login = (newToken: string, newUser: User) => {
    console.log('[AuthContext] login called', { tokenLength: newToken.length });
    if (newToken.length < 100) {
      localStorage.removeItem('token');
      localStorage.setItem('session_id', newToken);
    } else {
      localStorage.removeItem('session_id');
      localStorage.setItem('token', newToken);
    }
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    justLoggedInRef.current = true;
    console.log('[AuthContext] login completed, justLoggedIn set to true');
  };

  const logout = () => {
    const sessionId = localStorage.getItem('session_id');

    localStorage.removeItem('token');
    localStorage.removeItem('session_id');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    justLoggedInRef.current = false;

    if (sessionId) {
      const ssoBaseUrl = import.meta.env.VITE_SSO_BASE_URL || 'http://localhost:8080';
      const clientId = import.meta.env.VITE_SSO_CLIENT_ID || 'task-management-service';
      const loginUrl = `${window.location.origin}/login`;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: loginUrl,
        post_logout_redirect_uri: loginUrl,
      });
      window.location.href = `${ssoBaseUrl}/sso/logout?${params.toString()}`;
      return;
    }

    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      login,
      logout,
      isAuthenticated: !!token,
      isLoading
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
