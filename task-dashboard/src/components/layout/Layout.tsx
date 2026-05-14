import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { hasAnyPermission } from '../../utils/constants';

const DASHBOARD_PERMISSIONS = [
  'project:read_global', 'project:read_department', 'project:read_own',
  'task:read_global', 'task:read_department', 'task:read_project',
];

const SETTINGS_PERMISSIONS = [
  'project:read_global', 'project:update_global',
  'task:read_global', 'task:update_global',
];

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const allAuths = [...(user?.roles || []), ...(user?.permissions || [])];
  const canAccessDashboard = hasAnyPermission(allAuths, ...DASHBOARD_PERMISSIONS);
  const canAccessSettings = hasAnyPermission(allAuths, ...SETTINGS_PERMISSIONS);

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <div className="text-xl font-bold text-gray-800">任务管理看板</div>
            <nav className="flex items-center gap-4 text-sm">
              {canAccessDashboard && (
                <Link to="/dashboard" className={isActive('/dashboard') ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-blue-600'}>管理看板</Link>
              )}
              <Link to="/kanban" className={isActive('/kanban') ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-blue-600'}>任务看板</Link>
              {canAccessSettings && (
                <>
                  <Link to="/settings/project-types" className={isActive('/settings/project-types') ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-blue-600'}>项目类型</Link>
                  <Link to="/settings/task-types" className={isActive('/settings/task-types') ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-blue-600'}>任务类型</Link>
                  <Link to="/settings/measurement-units" className={isActive('/settings/measurement-units') ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-blue-600'}>计量单位</Link>
                </>
              )}
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <Link to="/profile" className="text-sm text-gray-600 hover:text-blue-600 flex items-center gap-2">
              <span>欢迎, {user?.username}</span>
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm text-red-600 hover:text-red-800"
            >
              退出登录
            </button>
          </div>
        </div>
      </header>
      
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
};
