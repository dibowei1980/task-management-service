import React, { createContext, useContext, useState, useEffect } from 'react';
import { BridgeUser } from '../types';
import { bridgeAuthService } from '../services/bridgeService';
import { authStorage } from '../utils/storage';

interface AuthContextType {
  user: BridgeUser | null;
  token: string | null;
  login: (token: string, user: BridgeUser) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<BridgeUser | null>(null);
  const [token, setToken] = useState<string | null>(authStorage.getToken());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = authStorage.getToken();
      const storedUser = authStorage.getUser();

      if (storedToken && storedUser) {
        try {
          const me = await bridgeAuthService.getMe();
          setToken(storedToken);
          setUser(me);
        } catch {
          authStorage.clear();
          setToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = (newToken: string, newUser: BridgeUser) => {
    authStorage.setToken(newToken);
    authStorage.setUser(newUser);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    bridgeAuthService.logout().catch(() => {});
    authStorage.clear();
    setToken(null);
    setUser(null);
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
