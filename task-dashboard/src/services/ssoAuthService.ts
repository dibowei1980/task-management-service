const SSO_BASE_URL = import.meta.env.VITE_SSO_BASE_URL || 'http://localhost:8080';
const TASK_SERVICE_URL = import.meta.env.VITE_TASK_SERVICE_URL || 'http://localhost:8082';
const REDIRECT_URI = `${window.location.origin}/sso/callback`;

export const ssoAuthService = {
  /**
   * 获取授权URL并跳转到SSO登录页
   */
  redirectToSsoLogin: async () => {
    try {
      const response = await fetch(
        `${TASK_SERVICE_URL}/api/sso/auth-url?redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = errorData.error || '';
        if (errMsg.includes('Connection refused') || errMsg.includes('Connect timed out') || errMsg.includes('SSO service error')) {
          window.location.href = `/login?error=sso_unavailable`;
          return;
        }
        throw new Error(errMsg || 'Failed to get auth URL');
      }
      
      const data = await response.json();
      
      sessionStorage.setItem('sso_state', data.state);
      
      window.location.href = data.auth_url;
    } catch (error: unknown) {
      console.error('Failed to get SSO auth URL:', error);
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Network request failed')) {
        window.location.href = `/login?error=backend_unavailable`;
      } else {
        window.location.href = `/login?error=sso`;
      }
    }
  },

  /**
   * 用code兑换session（通过后端代理，避免CORS）
   */
  exchangeCode: async (code: string) => {
    const response = await fetch(`${TASK_SERVICE_URL}/api/sso/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to exchange code for session');
    }

    return response.json();
  },

  /**
   * 验证state参数
   * @param state 要验证的state
   * @param clear 验证成功后是否清除state（默认true）
   */
  validateState: (state: string, clear: boolean = true): boolean => {
    const savedState = sessionStorage.getItem('sso_state');
    if (savedState && savedState === state) {
      if (clear) {
        sessionStorage.removeItem('sso_state');
      }
      return true;
    }
    return false;
  },

  /**
   * 验证当前session（通过后端代理）
   */
  validateSession: async (sessionId: string) => {
    console.log('[SSO] Validating session:', sessionId);
    try {
      const response = await fetch(`${TASK_SERVICE_URL}/api/sso/validate`, {
        headers: { 'X-Session-Id': sessionId }
      });
      console.log('[SSO] Validate response status:', response.status);
      const data = await response.json();
      console.log('[SSO] Validate response data:', data);
      return data;
    } catch (error) {
      console.error('[SSO] Validate session error:', error);
      throw error;
    }
  },

  /**
   * 获取当前用户信息
   */
  getCurrentUser: async (sessionId: string) => {
    const response = await fetch(`${SSO_BASE_URL}/sso/me`, {
      headers: { 'X-Session-Id': sessionId }
    });
    return response.json();
  },

  /**
   * 登出
   */
  logout: async (sessionId: string) => {
    try {
      await fetch(`${TASK_SERVICE_URL}/api/sso/logout`, {
        method: 'POST',
        headers: { 'X-Session-Id': sessionId }
      });
    } catch (e) {
      console.warn('[SSO] Logout request failed (non-blocking):', e);
    }
  }
};
