import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ssoAuthService } from '../../services/ssoAuthService';
import { useAuth } from '../../context/AuthContext';
import { hasAnyPermission } from '../../utils/constants';

export const SsoCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const exchangedRef = useRef(false);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    console.log('[SsoCallback] Starting callback processing', { code: !!code, state: !!state, error });

    if (error) {
      console.error('[SsoCallback] SSO login error:', error);
      navigate('/login?error=sso');
      return;
    }

    if (!code) {
      console.error('[SsoCallback] No code in callback');
      navigate('/login?error=no_code');
      return;
    }

    // 防止React StrictMode重复执行
    if (exchangedRef.current) {
      console.log('[SsoCallback] Already exchanged, skipping');
      return;
    }
    exchangedRef.current = true;

    // 验证state（不删除，防止StrictMode下第二次验证失败）
    if (state && !ssoAuthService.validateState(state, false)) {
      console.error('[SsoCallback] State validation failed');
      navigate('/login?error=state_mismatch');
      return;
    }

    console.log('[SsoCallback] Exchanging code for session');
    ssoAuthService.exchangeCode(code)
      .then((data) => {
        console.log('[SsoCallback] Exchange successful', data);
        if (!data || !data.session_id || !data.user) {
          throw new Error('Invalid response from SSO');
        }
        
        localStorage.setItem('session_id', data.session_id);
        console.log('[SsoCallback] Session ID saved:', data.session_id);

        const user = {
          id: data.user.userId,
          username: data.user.username,
          email: data.user.email,
          roles: data.user.roles || [],
          permissions: data.user.permissions || [],
          departmentId: data.user.departmentId,
          departmentName: data.user.departmentName
        };

        console.log('[SsoCallback] Calling login with user:', user);
        login(data.session_id, user);
        console.log('[SsoCallback] Navigating after login');
        const allAuths = [...(user.roles || []), ...(user.permissions || [])];
        if (hasAnyPermission(allAuths, 'project:read_global', 'project:read_department', 'project:read_own', 'task:read_global', 'task:read_department', 'task:read_project')) {
          navigate('/dashboard');
        } else {
          navigate('/kanban');
        }
      })
      .catch((err) => {
        console.error('[SsoCallback] Failed to exchange code:', err);
        const errMsg = err.message || '';
        if (errMsg.includes('Invalid or expired authorization code') || errMsg.includes('expired')) {
          navigate('/login?error=code_expired');
        } else if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('Network request failed')) {
          navigate('/login?error=backend_unavailable');
        } else if (errMsg.includes('SSO service error') || errMsg.includes('Connection refused')) {
          navigate('/login?error=sso_unavailable');
        } else {
          navigate('/login?error=exchange_failed');
        }
      });
  }, [searchParams, navigate, login]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">正在登录...</p>
      </div>
    </div>
  );
};
