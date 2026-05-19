import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { bridgeSsoService } from '../../services/bridgeService';
import { useAuth } from '../../context/AuthContext';

export const SsoCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const exchangedRef = useRef(false);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      navigate('/?error=sso');
      return;
    }

    if (!code) {
      navigate('/?error=no_code');
      return;
    }

    if (exchangedRef.current) {
      return;
    }
    exchangedRef.current = true;

    if (state && !bridgeSsoService.validateState(state, false)) {
      navigate('/?error=state_mismatch');
      return;
    }

    bridgeSsoService.exchangeCode(code)
      .then((data) => {
        if (!data || !data.token || !data.user) {
          throw new Error('Invalid response from SSO');
        }

        const user = {
          userId: data.user.userId || data.userId,
          username: data.user.username || data.username,
          displayName: data.user.displayName || data.displayName || data.user.username,
          role: data.role || 'user',
          permissions: data.user.permissions || data.permissions || [],
          departmentId: data.user.departmentId || data.departmentId,
          departmentName: data.user.departmentName || data.departmentName,
        };

        login(data.token, user, 'sso');
        navigate('/projects');
      })
      .catch((err) => {
        const errMsg = err.message || '';
        if (errMsg.includes('Invalid or expired authorization code') || errMsg.includes('expired')) {
          navigate('/?error=code_expired');
        } else if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('Network request failed')) {
          navigate('/?error=backend_unavailable');
        } else if (errMsg.includes('SSO service error') || errMsg.includes('Connection refused')) {
          navigate('/?error=sso_unavailable');
        } else {
          navigate('/?error=exchange_failed');
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
