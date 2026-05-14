import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { hasAnyPermission } from '../../utils/constants';

interface PermissionBasedRouteProps {
  allowedPermissions?: string[];
}

export const PermissionBasedRoute: React.FC<PermissionBasedRouteProps> = ({ allowedPermissions }) => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (allowedPermissions && user) {
    const allAuths = [...(user.roles || []), ...(user.permissions || [])];
    const hasPermission = hasAnyPermission(allAuths, ...allowedPermissions);
    if (!hasPermission) {
      return <Navigate to="/kanban" replace />;
    }
  }

  return <Outlet />;
};
