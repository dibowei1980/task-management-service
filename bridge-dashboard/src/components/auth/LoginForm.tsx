import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { bridgeAuthService, bridgeSsoService } from '../../services/bridgeService';
import { BridgeUser } from '../../types';
import { authStorage } from '../../utils/storage';

export const LoginForm: React.FC = () => {
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
        login(token, bridgeUser);
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
          className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {isLoading ? '跳转中...' : '统一身份认证登录'}
        </button>

        <p className="mt-4 text-center text-xs text-gray-400">
          通过 SSO 统一身份认证登录，无需本地账号
        </p>
      </div>
    </div>
  );
};
