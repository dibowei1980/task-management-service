# 地理信息项目生产RBAC权限模型设计

## 1. 概述

本文档设计了一套专门适配地理信息项目生产管理的RBAC（基于角色的访问控制）权限模型。模型以“项目”为顶层对象，并将任务细分为：项目、操作任务、质检任务、自检任务四类；同时支持部门隔离与任务分派（含多操作员/多质检员并行）。

## 2. 角色定义与权限层级

### 2.1 核心角色设计

| 角色名称 | 角色编码 | 权限范围 | 主要职责 |
|---------|---------|----------|----------|
| 生产管理员 | PRODUCTION_MANAGER | 全局 | 统筹管理所有项目生产，分配资源，监控进度 |
| 部门管理员 | DEPARTMENT_ADMIN | 部门级 | 接收生产管理员分配的项目；可创建本部门新项目；指派项目负责人（项目经理） |
| 项目经理 | PROJECT_MANAGER | 项目级 | 只能被部门管理员指派项目；禁止创建项目；可在被指派项目内创建任务或任务序列 |
| 操作员 | OPERATOR | 任务级 | 执行具体的地理信息数据处理任务 |
| 质检员 | INSPECTOR | 项目/任务级 | 负责数据质量检查和验收 |
| 全局观察者 | GLOBAL_OBSERVER | 全局只读 | 查看所有项目和任务状态 |
| 项目观察者 | PROJECT_OBSERVER | 项目级只读 | 查看指定项目及其下所有内容 |
| 任务观察者 | TASK_OBSERVER | 任务级只读 | 查看指定任务及其子任务 |

### 2.2 角色权限矩阵

```
权限维度：
- 项目管理：创建、修改、删除、查看
- 任务管理：创建、分配、执行、监控、查看
- 数据访问：读取、写入、删除、导出
- 质量管理：检查、审核、验收
- 报表查看：进度报表、质量报表、资源报表
```

| 角色\权限 | 项目管理 | 任务管理 | 数据访问 | 质量管理 | 报表查看 |
|----------|----------|----------|----------|----------|----------|
| 生产管理员 | 全部 | 全部 | 全部 | 全部 | 全部 |
| 部门管理员 | 本部门 | 本部门 | 本部门 | 本部门 | 部门相关 |
| 项目经理 | 被指派项目 | 被指派项目 | 被指派项目 | 被指派项目 | 被指派项目 |
| 操作员 | 查看 | 执行任务 | 读写任务数据 | 提交自检 | 查看任务 |
| 质检员 | 查看 | 查看 | 读取 | 全部质检 | 质量相关 |
| 全局观察者 | 查看 | 查看 | 查看 | 查看 | 全部 |
| 项目观察者 | 查看负责项目 | 查看负责项目 | 查看负责项目 | 查看负责项目 | 负责项目 |
| 任务观察者 | 查看父项目 | 查看负责任务 | 查看负责任务 | 查看负责任务 | 负责任务 |
| 部门管理员 | 查看部门项目 | 查看部门任务 | 查看部门任务 | 查看部门任务 | 部门相关 |

## 3. 数据范围权限设计

### 3.1 数据范围层级结构

```
数据范围层级：
├── 全局级别 (GLOBAL)
│   └── 所有项目
├── 项目级别 (PROJECT)
│   └── 特定项目
│       └── 阶段级别 (PHASE)
│           └── 特定阶段
│               └── 任务级别 (TASK)
│                   └── 特定任务
│                       └── 子任务级别 (SUBTASK)
│                           └── 特定子任务
```

### 3.2 数据范围权限规则

#### 3.2.1 权限继承规则
- 上级数据范围自动继承下级数据范围的权限
- 项目级角色自动拥有该项目下所有阶段、任务、子任务的权限
- 任务级角色自动拥有该任务下所有子任务的权限

#### 3.2.2 观察者权限规则
- 全局观察者：可查看所有项目和任务数据，无修改权限
- 项目观察者：仅可查看指定项目及其所有下级数据
- 任务观察者：仅可查看指定任务及其所有子任务数据

## 4. 数据库架构设计

### 4.1 核心表结构

```sql
-- 用户表（扩展）
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(200),
    department VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 角色表
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_code VARCHAR(50) UNIQUE NOT NULL,
    role_name VARCHAR(100) NOT NULL,
    role_type VARCHAR(20) CHECK (role_type IN ('MANAGER', 'OPERATOR', 'INSPECTOR', 'OBSERVER')),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 权限表
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_code VARCHAR(100) UNIQUE NOT NULL,
    permission_name VARCHAR(200) NOT NULL,
    resource_type VARCHAR(50) CHECK (resource_type IN ('PROJECT', 'PHASE', 'TASK', 'SUBTASK', 'DATA', 'REPORT')),
    action VARCHAR(50) CHECK (action IN ('CREATE', 'READ', 'UPDATE', 'DELETE', 'EXECUTE', 'APPROVE')),
    description TEXT
);

-- 用户角色关联表（支持多角色）
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    data_scope_id UUID, -- 关联到具体的数据范围
    data_scope_type VARCHAR(20), -- PROJECT, TASK, PHASE等
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_id, role_id, data_scope_id, data_scope_type)
);

-- 角色权限关联表
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(role_id, permission_id)
);

-- 项目层级表
CREATE TABLE project_hierarchy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES project_hierarchy(id),
    hierarchy_type VARCHAR(20) CHECK (hierarchy_type IN ('PROJECT', 'PHASE', 'TASK', 'SUBTASK')),
    entity_id UUID NOT NULL, -- 关联到具体的项目/阶段/任务ID
    entity_name VARCHAR(200) NOT NULL,
    project_id UUID, -- 顶级项目ID，便于快速查询
    path LTREE, -- PostgreSQL的层级路径，如：project1.phase1.task1
    depth INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 数据权限范围表
CREATE TABLE data_scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_name VARCHAR(100) NOT NULL,
    scope_type VARCHAR(20) CHECK (scope_type IN ('GLOBAL', 'PROJECT', 'PHASE', 'TASK', 'SUBTASK')),
    scope_entity_id UUID, -- 关联到具体的实体
    scope_path LTREE, -- 层级路径
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 4.2 视图和索引

```sql
-- 用户权限视图（包含数据范围）
CREATE VIEW user_permissions_view AS
SELECT 
    u.id as user_id,
    u.username,
    r.role_code,
    r.role_name,
    r.role_type,
    p.permission_code,
    p.permission_name,
    p.resource_type,
    p.action,
    ds.scope_type,
    ds.scope_entity_id,
    ds.scope_path,
    ph.entity_name as scope_entity_name
FROM users u
JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = true
JOIN roles r ON ur.role_id = r.id AND r.is_active = true
JOIN role_permissions rp ON r.id = rp.role_id
JOIN permissions p ON rp.permission_id = p.id
LEFT JOIN data_scopes ds ON ur.data_scope_id = ds.id
LEFT JOIN project_hierarchy ph ON ds.scope_entity_id = ph.id;

-- 层级查询索引
CREATE INDEX idx_project_hierarchy_path ON project_hierarchy USING GIST (path);
CREATE INDEX idx_project_hierarchy_project ON project_hierarchy (project_id);
CREATE INDEX idx_project_hierarchy_parent ON project_hierarchy (parent_id);

-- 权限查询优化索引
CREATE INDEX idx_user_roles_active ON user_roles (user_id, is_active);
CREATE INDEX idx_user_roles_scope ON user_roles (data_scope_id, data_scope_type);
```

## 5. 权限检查逻辑

### 5.1 权限检查核心算法

```typescript
interface PermissionCheckParams {
  userId: string;
  permissionCode: string;
  resourceType: 'PROJECT' | 'PHASE' | 'TASK' | 'SUBTASK' | 'DATA' | 'REPORT';
  resourceId?: string;
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'EXECUTE' | 'APPROVE';
}

class GeoRBACPermissionChecker {
  
  async checkPermission(params: PermissionCheckParams): Promise<boolean> {
    const { userId, permissionCode, resourceType, resourceId, action } = params;
    
    // 1. 获取用户的所有有效角色和权限
    const userPermissions = await this.getUserPermissions(userId);
    
    // 2. 检查是否有匹配的权限
    const hasPermission = userPermissions.some(permission => 
      permission.permission_code === permissionCode &&
      permission.resource_type === resourceType &&
      permission.action === action
    );
    
    if (!hasPermission) {
      return false;
    }
    
    // 3. 检查数据范围权限
    if (resourceId) {
      return await this.checkDataScopePermission(userId, resourceId, resourceType);
    }
    
    return true;
  }
  
  private async checkDataScopePermission(
    userId: string, 
    resourceId: string, 
    resourceType: string
  ): Promise<boolean> {
    // 获取资源的所有上级层级
    const resourceHierarchy = await this.getResourceHierarchy(resourceId, resourceType);
    
    // 获取用户的数据范围权限
    const userScopes = await this.getUserDataScopes(userId);
    
    // 检查是否有匹配的数据范围
    return userScopes.some(scope => {
      if (scope.scope_type === 'GLOBAL') {
        return true;
      }
      
      // 检查资源是否在用户的数据范围内
      return resourceHierarchy.some(resource => 
        resource.id === scope.scope_entity_id ||
        this.isInScopePath(resource.path, scope.scope_path)
      );
    });
  }
  
  private isInScopePath(resourcePath: string, scopePath: string): boolean {
    // 使用PostgreSQL的LTREE路径匹配
    return resourcePath.startsWith(scopePath);
  }
}
```

### 5.2 观察者权限特殊处理

```typescript
class ObserverPermissionChecker extends GeoRBACPermissionChecker {
  
  async checkObserverPermission(
    userId: string,
    observerType: 'GLOBAL' | 'PROJECT' | 'TASK',
    resourceId: string,
    resourceType: string
  ): Promise<boolean> {
    
    // 观察者只能执行READ操作
    if (!await this.checkPermission({
      userId,
      permissionCode: 'VIEW_RESOURCE',
      resourceType: resourceType as any,
      resourceId,
      action: 'READ'
    })) {
      return false;
    }
    
    // 检查观察者类型匹配
    const userRoles = await this.getUserRoles(userId);
    const observerRoles = userRoles.filter(role => role.role_type === 'OBSERVER');
    
    return observerRoles.some(role => {
      switch (observerType) {
        case 'GLOBAL':
          return role.role_code === 'GLOBAL_OBSERVER';
        case 'PROJECT':
          return ['GLOBAL_OBSERVER', 'PROJECT_OBSERVER'].includes(role.role_code);
        case 'TASK':
          return ['GLOBAL_OBSERVER', 'PROJECT_OBSERVER', 'TASK_OBSERVER'].includes(role.role_code);
        default:
          return false;
      }
    });
  }
}
```

## 6. 权限系统实施策略

### 6.1 直接实施策略

由于当前权限模型尚未投入正式生产，采用直接实施策略，无需兼容性考虑：

1. **数据库重构**
   - 直接删除现有权限相关表（如存在）
   - 按照第4节设计重新创建完整的数据库架构
   - 建立必要的索引和视图优化查询性能

2. **核心数据初始化**
   - 预置核心角色定义（生产管理员、项目经理、操作员等）
   - 配置标准权限集合（项目管理、任务管理、数据访问等）
   - 建立项目层级结构模板

3. **权限服务部署**
   - 部署权限检查微服务
   - 配置缓存策略和性能优化
   - 启用审计日志功能

### 6.2 数据初始化脚本

```sql
-- 6.2.1 初始化核心角色
INSERT INTO roles (role_code, role_name, role_type, description) VALUES
('PRODUCTION_MANAGER', '生产管理员', 'MANAGER', '统筹管理所有项目生产，分配资源，监控进度'),
('PROJECT_MANAGER', '项目经理', 'MANAGER', '负责具体项目的执行管理，任务分配'),
('OPERATOR', '操作员', 'OPERATOR', '执行具体的地理信息数据处理任务'),
('INSPECTOR', '质检员', 'INSPECTOR', '负责数据质量检查和验收'),
('GLOBAL_OBSERVER', '全局观察者', 'OBSERVER', '查看所有项目和任务状态'),
('PROJECT_OBSERVER', '项目观察者', 'OBSERVER', '查看指定项目及其下所有内容'),
('TASK_OBSERVER', '任务观察者', 'OBSERVER', '查看指定任务及其子任务');

-- 6.2.2 初始化标准权限
INSERT INTO permissions (permission_code, permission_name, resource_type, action, description) VALUES
-- 项目管理权限
('PROJECT_CREATE', '创建项目', 'PROJECT', 'CREATE', '创建新项目'),
('PROJECT_READ', '查看项目', 'PROJECT', 'READ', '查看项目信息'),
('PROJECT_UPDATE', '修改项目', 'PROJECT', 'UPDATE', '修改项目属性'),
('PROJECT_DELETE', '删除项目', 'PROJECT', 'DELETE', '删除项目'),

-- 任务管理权限
('TASK_CREATE', '创建任务', 'TASK', 'CREATE', '创建新任务'),
('TASK_READ', '查看任务', 'TASK', 'READ', '查看任务详情'),
('TASK_UPDATE', '修改任务', 'TASK', 'UPDATE', '修改任务信息'),
('TASK_EXECUTE', '执行任务', 'TASK', 'EXECUTE', '执行具体任务'),
('TASK_DELETE', '删除任务', 'TASK', 'DELETE', '删除任务'),

-- 数据访问权限
('DATA_READ', '读取数据', 'DATA', 'READ', '读取业务数据'),
('DATA_WRITE', '写入数据', 'DATA', 'UPDATE', '修改业务数据'),
('DATA_EXPORT', '导出数据', 'DATA', 'READ', '导出数据文件'),

-- 质量管理权限
('QUALITY_CHECK', '质量检查', 'DATA', 'EXECUTE', '执行质量检查'),
('QUALITY_APPROVE', '质量审核', 'DATA', 'APPROVE', '审核质量结果'),

-- 报表查看权限
('REPORT_VIEW', '查看报表', 'REPORT', 'READ', '查看各类报表');

-- 6.2.3 配置角色权限关联
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE (r.role_code = 'PRODUCTION_MANAGER' AND p.action IN ('CREATE', 'READ', 'UPDATE', 'DELETE', 'EXECUTE', 'APPROVE'))
   OR (r.role_code = 'PROJECT_MANAGER' AND p.resource_type IN ('PROJECT', 'TASK', 'DATA', 'REPORT') AND p.action IN ('READ', 'UPDATE', 'EXECUTE'))
   OR (r.role_code = 'OPERATOR' AND p.permission_code IN ('TASK_READ', 'TASK_EXECUTE', 'DATA_READ', 'DATA_WRITE'))
   OR (r.role_code = 'INSPECTOR' AND p.permission_code IN ('PROJECT_READ', 'TASK_READ', 'DATA_READ', 'QUALITY_CHECK', 'QUALITY_APPROVE'))
   OR (r.role_type = 'OBSERVER' AND p.action = 'READ');
```

### 6.3 验证测试策略

1. **单元测试验证**
   - 权限检查算法准确性测试
   - 数据范围继承逻辑测试
   - 观察者权限隔离测试

2. **集成测试验证**
   - 多角色权限组合测试
   - 跨层级权限继承测试
   - 并发权限检查性能测试

3. **业务场景验证**
   - 项目创建与分配流程
   - 任务执行与质检流程
   - 数据访问控制流程
   - 报表查看权限流程

4. **安全测试验证**
   - 权限绕过攻击测试
   - 垂直权限提升测试
   - 水平权限越权测试

### 6.4 上线部署步骤

1. **环境准备**
   - 数据库迁移执行
   - 应用服务配置更新
   - 监控告警配置

2. **功能验证**
   - 核心业务流程验证
   - 权限控制点验证
   - 性能基准测试

3. **用户培训**
   - 管理员操作培训
   - 权限配置培训
   - 问题排查指导

4. **运维保障**
   - 实时监控部署
   - 故障应急预案
   - 数据备份策略

## 7. 性能优化策略

### 7.1 缓存机制

```typescript
class PermissionCache {
  private cache: Map<string, CacheEntry> = new Map();
  private ttl: number = 300000; // 5分钟
  
  async getCachedPermission(key: string): Promise<PermissionResult | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.result;
  }
  
  setCachedPermission(key: string, result: PermissionResult): void {
    this.cache.set(key, {
      result,
      timestamp: Date.now()
    });
  }
}
```

### 7.2 批量权限检查

```typescript
async batchCheckPermissions(
  checks: PermissionCheckParams[]
): Promise<Map<string, boolean>> {
  
  // 按用户分组，减少数据库查询
  const groupedChecks = this.groupByUser(checks);
  const results = new Map<string, boolean>();
  
  for (const [userId, userChecks] of groupedChecks) {
    // 一次性获取用户所有权限
    const userPermissions = await this.getUserPermissions(userId);
    
    userChecks.forEach(check => {
      const result = this.checkSinglePermission(userPermissions, check);
      const key = this.generateCheckKey(check);
      results.set(key, result);
    });
  }
  
  return results;
}
```

## 8. 安全考虑

### 8.1 权限审计

```sql
-- 权限操作审计表
CREATE TABLE permission_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    role_id UUID REFERENCES roles(id),
    permission_id UUID REFERENCES permissions(id),
    action VARCHAR(50), -- GRANT, REVOKE, MODIFY
    resource_type VARCHAR(50),
    resource_id UUID,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建审计触发器
CREATE OR REPLACE FUNCTION audit_permission_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO permission_audit (user_id, role_id, permission_id, action, created_at)
        VALUES (NEW.user_id, NEW.role_id, NEW.permission_id, 'GRANT', NOW());
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO permission_audit (user_id, role_id, permission_id, action, created_at)
        VALUES (OLD.user_id, OLD.role_id, OLD.permission_id, 'REVOKE', NOW());
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_permission_audit
    AFTER INSERT OR DELETE ON user_roles
    FOR EACH ROW EXECUTE FUNCTION audit_permission_changes();
```

### 8.2 数据安全

1. **敏感数据加密**：对关键业务数据进行加密存储
2. **访问日志**：记录所有权限相关的操作日志
3. **权限最小化**：遵循最小权限原则，避免过度授权
4. **定期审计**：定期检查和清理过期权限

## 9. 实施建议

### 9.1 开发优先级

1. **高优先级**：
   - 核心角色和权限定义
   - 数据范围权限检查
   - 观察者权限实现

2. **中优先级**：
   - 权限缓存优化
   - 审计日志功能
   - 批量权限检查

3. **低优先级**：
   - 高级报表功能
   - 权限可视化界面
   - 自动化权限推荐

### 9.2 测试策略

1. **单元测试**：权限检查算法的各种边界情况
2. **集成测试**：多角色、多层级的权限组合测试
3. **性能测试**：大量用户并发权限检查的性能验证
4. **安全测试**：权限绕过、提权等安全漏洞测试

通过以上设计，可以构建一个既满足地理信息项目生产管理需求，又具备良好扩展性和安全性的RBAC权限系统。
