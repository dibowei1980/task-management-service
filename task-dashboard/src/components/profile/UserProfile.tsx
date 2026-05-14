import React, { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, Shield, Mail, Phone } from 'lucide-react';

// Translation Dictionaries
const ROLE_MAP: Record<string, string> = {
  'PRODUCTION_MANAGER': '生产管理员',
  'PROJECT_MANAGER': '项目经理',
  'OPERATOR': '操作员',
  'INSPECTOR': '质检员',
  'GLOBAL_OBSERVER': '全局观察者',
  'PROJECT_OBSERVER': '项目观察者',
  'TASK_OBSERVER': '任务观察者',
  'ADMIN': '系统管理员'
};

const PERMISSION_GROUP_MAP: Record<string, string> = {
  'PROJECT': '项目管理',
  'TASK': '任务管理',
  'USER': '用户管理',
  'ROLE': '角色管理',
  'PERMISSION': '权限配置',
  'DATA': '数据操作',
  'QUALITY': '质量控制',
  'REPORT': '报表查看',
  'AUDIT': '审计日志',
  'RESOURCE': '资源访问',
  'DEPARTMENT': '部门管理',
  'SYSTEM': '系统管理',
};

const PERMISSION_ACTION_MAP: Record<string, string> = {
  'create': '创建',
  'read_global': '全局查看',
  'read_department': '部门查看',
  'read_own': '本人查看',
  'read_project': '项目查看',
  'read_participant': '参与查看',
  'read': '查看',
  'update_global': '全局修改',
  'update_department': '部门修改',
  'update_own': '本人修改',
  'update_project': '项目修改',
  'update': '修改',
  'delete_global': '全局删除',
  'delete_department': '部门删除',
  'delete_own': '本人删除',
  'delete': '删除',
  'execute': '执行',
  'approve': '审核',
  'export': '导出',
  'write': '写入',
  'check': '检查',
  'view': '浏览',
  'claim': '认领',
  'update_progress': '更新进度',
  'submit_for_qa': '提交质检',
  'write_back': '回写',
  'reject': '驳回',
  'approve_final': '终审',
  'reject_final': '终审驳回',
  'update_status_internal': '状态流转',
  'project_archives_save': '项目归档',
  'manager': '管理',
};

function translatePermission(perm: string): { group: string; label: string } {
  const colonIdx = perm.indexOf(':');
  if (colonIdx > 0) {
    const resource = perm.substring(0, colonIdx);
    const action = perm.substring(colonIdx + 1);
    const group = PERMISSION_GROUP_MAP[resource.toUpperCase()] || resource;
    const label = PERMISSION_ACTION_MAP[action.toLowerCase()] || action;
    return { group, label };
  }
  return { group: PERMISSION_GROUP_MAP[perm.toUpperCase()] || perm, label: perm };
}

export const UserProfile: React.FC = () => {
  const { user } = useAuth();

  const { roles, permissions } = useMemo(() => {
    if (!user) return { roles: [], permissions: [] };

    const rolesList = (user.roles || []).filter(r => !r.includes(':'));
    const permsList = (user.permissions || []).length > 0
      ? user.permissions || []
      : (user.roles || []).filter(r => r.includes(':'));

    return { roles: rolesList, permissions: permsList };
  }, [user]);

  const groupedPermissions = useMemo(() => {
    const groups: Record<string, string[]> = {};
    permissions.forEach(p => {
      const { group, label } = translatePermission(p);
      if (!groups[group]) groups[group] = [];
      groups[group].push(label);
    });
    return groups;
  }, [permissions]);

  if (!user) return <div>加载中...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">个人中心</h1>

      {/* Basic Info Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center space-x-4 mb-6">
          <div className="h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center">
            <User className="h-8 w-8 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{user.username}</h2>
            <div className="flex items-center text-gray-500 mt-1">
              <Mail className="h-4 w-4 mr-1" />
              <span>{user.email || '未设置邮箱'}</span>
            </div>
            <div className="flex items-center text-gray-500 mt-1">
              <Phone className="h-4 w-4 mr-1" />
              <span>{user.phoneNumber || '未设置电话'}</span>
            </div>
            <div className="flex items-center text-gray-500 mt-1 text-sm">
               <span className="bg-blue-100 text-blue-800 text-xs font-medium mr-2 px-2.5 py-0.5 rounded">ID: {user.id}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <Shield className="h-5 w-5 mr-2 text-green-600" />
            角色与身份
          </h3>
          <div className="flex flex-wrap gap-2">
            {roles.length > 0 ? (
              roles.map(role => (
                <span key={role} className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  {ROLE_MAP[role] || role}
                </span>
              ))
            ) : (
              <span className="text-gray-500 italic">暂无角色</span>
            )}
          </div>
        </div>
      </div>

      {/* Permissions Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
          <Shield className="h-5 w-5 mr-2 text-purple-600" />
          权限详情
        </h3>
        
        {Object.keys(groupedPermissions).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(groupedPermissions).map(([group, perms]) => (
              <div key={group} className="border border-gray-100 rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold text-gray-700 mb-2 border-b border-gray-200 pb-2">{group}</h4>
                <div className="flex flex-wrap gap-2">
                  {perms.map(p => (
                    <span key={p} className="px-2 py-1 rounded text-xs font-mono bg-white border border-gray-200 text-gray-600">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-500 italic">暂无特定权限</div>
        )}
      </div>

    </div>
  );
};
