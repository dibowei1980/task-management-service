import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { bridgeSystemService } from '../../services/bridgeService';

interface SystemStatus {
  taskManagementConnected: boolean;
  tmsRegistered: boolean;
  localMode: boolean;
  ssoConnected: boolean;
  upmConnected: boolean;
}

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<SystemStatus>({
    taskManagementConnected: true,
    tmsRegistered: true,
    localMode: false,
    ssoConnected: true,
    upmConnected: true,
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

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {status.localMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-sm text-amber-700">
          本地项目模式 — 任务管理服务未连接，任务上报与接收功能不可用，桥梁去除项目可独立运行
        </div>
      )}
      {!status.ssoConnected && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-center text-sm text-red-700">
          SSO 服务未连接 — 认证服务不可用，请检查网络连接
        </div>
      )}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="text-xl font-bold text-gray-800">桥梁去除系统</div>
            <div className="flex items-center space-x-2 text-xs">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full ${status.taskManagementConnected ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                <span className={`w-1.5 h-1.5 rounded-full mr-1 ${status.taskManagementConnected ? 'bg-green-500' : 'bg-amber-500'}`}></span>
                {status.localMode ? '本地模式' : '任务管理'}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full ${status.upmConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full mr-1 ${status.upmConnected ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                用户管理
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full ${status.ssoConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                <span className={`w-1.5 h-1.5 rounded-full mr-1 ${status.ssoConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                SSO
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-600">欢迎, {user?.displayName || user?.username}</div>
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
