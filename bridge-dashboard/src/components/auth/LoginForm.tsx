import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { bridgeAuthService, bridgeSsoService } from '../../services/bridgeService';
import { BridgeUser } from '../../types';

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
      localStorage.setItem('bridge_token', token);
      bridgeAuthService.getMe().then((me) => {
        const bridgeUser: BridgeUser = {
          user_id: me.user_id,
          username: me.username,
          display_name: me.display_name || me.username,
          role: me.role,
          permissions: me.permissions || [],
          department_id: me.department_id,
          department_name: me.department_name,
          login_type: 'sso',
        };
        login(token, bridgeUser);
        navigate('/projects');
      }).catch(() => {
        setError('SSO 登录验证失败，请重试。');
        localStorage.removeItem('bridge_token');
      });
      return;
    }

    const ssoError = searchParams.get('error');
    if (ssoError) {
      const errorMap: Record<string, string> = {
        sso: 'SSO 登录失败',
        sso_no_code: 'SSO 未返回授权码',
        sso_state_mismatch: 'SSO 状态校验失败',
        sso_token_failed: 'SSO 令牌交换失败',
        sso_no_session: 'SSO 会话无效',
        sso_service_error: 'SSO 服务不可用',
      };
      setError(errorMap[ssoError] || `登录失败：${ssoError}`);
    }
  }, [searchParams, login, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const data = await bridgeAuthService.login({ username, password });
      const bridgeUser: BridgeUser = {
        user_id: data.user.user_id,
        username: data.user.username,
        display_name: data.user.display_name,
        role: data.user.role,
        permissions: data.user.permissions || [
          'task:execute', 'task:update_global',
          'project:read', 'project:create', 'project:update', 'project:delete',
          'user:read', 'quality:check',
        ],
        login_type: 'local',
      };
      login(data.token, bridgeUser);
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            登录
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            桥梁去除系统
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleSsoLogin}
          disabled={isLoading}
          className="w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {isLoading ? '跳转中...' : '统一登录（SSO）'}
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-gray-50 text-gray-500">或使用本地账号</span>
          </div>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
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

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isLoading ? '登录中...' : '本地登录'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
