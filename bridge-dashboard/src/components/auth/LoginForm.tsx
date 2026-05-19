import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { bridgeAuthService, bridgeSsoService } from '../../services/bridgeService';
import { BridgeUser } from '../../types';
import { authStorage } from '../../utils/storage';

export const LoginForm: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('bridge_token');
    if (token) {
      authStorage.setToken(token);
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', cleanUrl);
      bridgeAuthService.getMe().then((me) => {
        const bridgeUser: BridgeUser = {
          userId: me.userId,
          username: me.username,
          displayName: me.displayName || me.username,
          role: me.role,
          permissions: me.permissions || [],
          departmentId: me.departmentId,
          departmentName: me.departmentName,
        };
        login(token, bridgeUser, 'sso');
        navigate('/projects');
      }).catch(() => {
        setError('SSO 登录验证失败，请重试。');
        authStorage.removeToken();
      });
      return;
    }

    const ssoError = searchParams.get('error');
    if (ssoError) {
      const errorMap: Record<string, string> = {
        sso: 'SSO 登录失败，请重试。',
        sso_no_code: 'SSO 未返回授权码，请重试。',
        sso_state_mismatch: 'SSO 状态校验失败，请重试。',
        sso_token_failed: 'SSO 令牌交换失败，请重试。',
        sso_no_session: 'SSO 会话无效，请重试。',
        sso_service_error: 'SSO 服务不可用，请稍后重试。',
      };
      setError(errorMap[ssoError] || `登录失败：${ssoError}`);
    }
  }, [searchParams, login, navigate]);

  const handleUpmLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const data = await bridgeAuthService.upmLogin({ username, password });
      const bridgeUser: BridgeUser = {
        userId: data.userId,
        username: data.username,
        displayName: data.displayName || data.username,
        role: data.role,
        permissions: data.permissions || [],
        departmentId: data.departmentId,
        departmentName: data.departmentName,
      };
      login(data.token, bridgeUser, 'upm');
      navigate('/projects');
    } catch {
      setError('登录失败，请检查用户名和密码。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSsoLogin = () => {
    setError('');
    setIsLoading(true);
    bridgeSsoService.redirectToSsoLogin().catch(() => {
      setError('无法连接 SSO 服务，请稍后重试。');
      setIsLoading(false);
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="w-full bg-white border-b border-gray-200 px-6 py-3">
        <h1 className="text-lg font-semibold text-gray-800">桥梁去除系统</h1>
      </header>

      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="text-center text-3xl font-extrabold text-gray-900">
              登录您的账户
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              桥梁去除系统
            </p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleUpmLogin}>
            <input type="hidden" name="remember" value="true" />
            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="username" className="sr-only">用户名</label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="password" className="sr-only">密码</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="text-red-500 text-sm text-center">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {isLoading ? '登录中...' : '登录'}
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-gray-50 text-gray-500">或使用</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSsoLogin}
                className="group relative w-full flex justify-center py-2 px-4 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                统一身份认证登录
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
