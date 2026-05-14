import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { bridgeSystemService } from '../../services/bridgeService';

interface SystemStatus {
  task_management_connected: boolean;
  sso_connected: boolean;
  upm_connected: boolean;
}

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<SystemStatus>({
    task_management_connected: true,
    sso_connected: true,
    upm_connected: true,
  });

  useEffect(() => {
    const checkStatus = async () => {
      const s = await bridgeSystemService.getSystemStatus();
      setStatus(s);
    };
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isLocalUser = user?.login_type === 'local';

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {!status.task_management_connected && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-sm text-amber-700">
          任务管理服务未连接 — 任务上报与接收功能不可用，桥梁去除项目可独立运行
        </div>
      )}
      {isLocalUser && !status.sso_connected && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-center text-sm text-blue-700">
          SSO 服务未连接 — 仅可使用本地账户创建本地项目
        </div>
      )}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="text-xl font-bold text-gray-800">桥梁去除系统</div>
            <div className="flex items-center space-x-2 text-xs">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full ${status.task_management_connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full mr-1 ${status.task_management_connected ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                任务管理
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full ${status.upm_connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full mr-1 ${status.upm_connected ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                用户管理
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full ${status.sso_connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full mr-1 ${status.sso_connected ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                SSO
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-600">欢迎, {user?.display_name || user?.username}</div>
            <button
              onClick={handleLogout}
              className="text-sm text-red-600 hover:text-red-800"
            >
              退出登录
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
