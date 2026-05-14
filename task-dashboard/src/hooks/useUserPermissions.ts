import { useState, useEffect, useMemo } from 'react';
import { userService } from '../services/userService';
import { hasAnyPermission } from '../utils/constants';

export interface UserPermissions {
  userId: string | undefined;
  authorities: string[];
  canExecute: boolean;
  canManage: boolean;
  canQualityCheck: boolean;
  isSystemManager: boolean;
}

export const useUserPermissions = (): UserPermissions => {
  const [userId, setUserId] = useState<string | undefined>();
  const [authorities, setAuthorities] = useState<string[]>([]);

  useEffect(() => {
    userService.getCurrentUser()
      .then(user => {
        setUserId(user.id);
        setAuthorities([...(user.roles || []), ...(user.permissions || [])]);
      })
      .catch(() => {});
  }, []);

  return useMemo(() => ({
    userId,
    authorities,
    canExecute: hasAnyPermission(authorities, 'task:execute'),
    canManage: hasAnyPermission(authorities, 'department:manager'),
    canQualityCheck: hasAnyPermission(authorities, 'quality:check'),
    isSystemManager: hasAnyPermission(authorities, 'system:manager'),
  }), [userId, authorities]);
};
