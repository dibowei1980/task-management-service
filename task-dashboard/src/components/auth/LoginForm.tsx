import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/authService';
import { ssoAuthService } from '../../services/ssoAuthService';
import { hasAnyPermission } from '../../utils/constants';

export const LoginForm: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // 显示URL中的错误信息
  const urlError = searchParams.get('error');
  const errorMessage = urlError === 'sso' ? 'SSO登录失败，请重试。' :
                       urlError === 'no_code' ? '登录授权码缺失，请重试。' :
                       urlError === 'exchange_failed' ? '登录会话兑换失败，请重试。' :
                       urlError === 'code_expired' ? '授权码已过期，请重新登录。' :
                       urlError === 'state_mismatch' ? '安全验证失败，请重新登录。' :
                       urlError === 'session_expired' ? '会话已过期，请重新登录。' :
                       urlError === 'sso_unavailable' ? 'SSO 认证服务不可用，请联系管理员或稍后重试。' :
                       urlError === 'backend_unavailable' ? '后端服务不可用，请检查网络连接或稍后重试。' :
                       '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const data = await authService.login({ username, password });
      login(data.token, {
        id: data.id,
        username: data.username,
        email: data.email,
        roles: data.roles || [],
        permissions: data.permissions || [],
        departmentId: data.departmentId,
        departmentName: data.departmentName
      });

      const allAuths = [...(data.roles || []), ...(data.permissions || [])];

      if (hasAnyPermission(allAuths, 'project:read_global', 'project:read_department', 'project:read_own', 'task:read_global', 'task:read_department', 'task:read_project')) {
        navigate('/dashboard');
      } else {
        navigate('/kanban');
      }
    } catch (err) {
      console.error(err);
      setError('登录失败，请检查用户名和密码。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSsoLogin = async () => {
    await ssoAuthService.redirectToSsoLogin();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            登录您的账户
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            生产协同任务管理系统
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
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

          {(error || errorMessage) && (
            <div className="text-red-500 text-sm text-center">
              {error || errorMessage}
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
  );
};
