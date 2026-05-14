# Bridge Removal Service

## 简介

桥梁去除业务服务（独立外部系统），负责执行桥梁去除相关的全部业务逻辑，包括：
- 项目管理（创建/更新/删除/分解）
- 桥梁去除批处理任务编排（BRIDGE_REMOVAL_BATCH）
- 桥梁去除单元处理（BRIDGE_REMOVAL_UNIT）
- DOM 定位、预处理分段、掩膜生成/编辑、影像修复、结果合并
- SSO 登录 + 本地登录 fallback
- UPM 用户/部门代理
- 本地项目提交到 TMS

**任务层级**：BRS 只支持两层任务结构（项目 → 子任务单元），不涉及 PHASE 等中间层级。多层级任务结构和进度逐层汇聚由 TMS 管理。

**可独立运行**：task-management-service 不可用时，任务上报/接收降级，桥梁去除核心功能不受影响。

## 目录结构

```
bridge-removal-service/
├── app.py                          # Flask HTTP 服务入口
├── requirements.txt                # Python 依赖
├── bridge_removal_task.py          # 核心任务逻辑
├── base_task.py                    # 任务基类
├── local_users.json                # 本地用户配置（fallback）
├── bridge_removal/                 # 桥梁去除算法模块
│   ├── __init__.py
│   ├── pipeline.py
│   ├── vector_reader.py
│   ├── dom_mosaic.py
│   ├── inpaint_gen_Runninghub.py
│   ├── mask_pipeline.py
│   └── ...
└── intermediate/                   # 中间产物目录
```

## 运行方式

### 本地直接运行

```bash
pip install -r requirements.txt

# 必要环境变量
$env:SSO_BASE_URL="http://localhost:8080"
$env:SSO_CLIENT_ID="bridge-removal-service"
$env:SSO_CLIENT_SECRET="your-client-secret"
$env:SSO_REDIRECT_URI="http://localhost:5050/api/auth/sso/callback"
$env:UPM_BASE_URL="http://localhost:8081"
$env:UPM_SERVICE_USERNAME="your-upm-username"
$env:UPM_SERVICE_PASSWORD="your-upm-password"

# 可选环境变量（TMS 集成）
$env:TASK_MANAGEMENT_API_URL="http://localhost:8082/api"
$env:TASK_MANAGEMENT_AUTH_TOKEN="internal-automation-token"

python app.py
```

### Docker 运行

```bash
docker build -t bridge-removal-service .

docker run -d \
  -p 5050:5050 \
  -e SSO_BASE_URL=http://host.docker.internal:8080 \
  -e SSO_CLIENT_ID=bridge-removal-service \
  -e SSO_CLIENT_SECRET=your-client-secret \
  -e SSO_REDIRECT_URI=http://localhost:5050/api/auth/sso/callback \
  -e UPM_BASE_URL=http://host.docker.internal:8081 \
  -e TASK_MANAGEMENT_API_URL=http://host.docker.internal:8082/api \
  -e TASK_MANAGEMENT_AUTH_TOKEN=internal-automation-token \
  bridge-removal-service
```

## 环境变量

| 变量 | 说明 | 默认值 |
| ---- | ---- | ------ |
| `SSO_BASE_URL` | SSO 服务地址 | `http://localhost:8080` |
| `SSO_CLIENT_ID` | SSO 客户端 ID | `bridge-removal-service` |
| `SSO_CLIENT_SECRET` | SSO 客户端密钥 | （SSO 登录必须） |
| `SSO_REDIRECT_URI` | SSO 回调地址 | `http://localhost:5050/api/auth/sso/callback` |
| `UPM_BASE_URL` | UPM 服务地址 | `http://localhost:8081` |
| `UPM_SERVICE_USERNAME` | UPM 服务账号 | （用户/部门查询必须） |
| `UPM_SERVICE_PASSWORD` | UPM 服务密码 | （用户/部门查询必须） |
| `TASK_MANAGEMENT_API_URL` | TMS 服务地址 | `http://localhost:8082/api` |
| `TASK_MANAGEMENT_AUTH_TOKEN` | 内部自动化 Token | `internal-automation-token` |

## API 接口

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 本地登录（fallback） |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/me` | 当前用户信息 |
| GET | `/api/sso/auth-url` | 获取 SSO 授权 URL |
| GET | `/api/auth/sso/callback` | SSO OAuth2 回调 |
| POST | `/api/auth/sso/logout` | SSO 登出 |

### 项目管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects` | 项目列表（BridgeTask 格式） |
| POST | `/api/projects` | 创建项目（自动标记 source） |
| GET | `/api/projects/{id}` | 项目详情 |
| PUT | `/api/projects/{id}` | 更新项目 |
| DELETE | `/api/projects/{id}` | 删除项目（含关联 jobs） |
| POST | `/api/projects/{id}/execute` | 接收 TMS 分发的项目 |
| POST | `/api/projects/{id}/submit-to-tms` | 本地项目提交到 TMS |

### 任务操作

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tasks/{id}` | 任务详情 |
| PUT | `/api/tasks/{id}` | 更新任务 |
| PATCH | `/api/tasks/{id}/workflow-status` | 更新工作流状态（含质检拦截） |

### 桥梁处理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tasks/{id}/dom-locate` | DOM 定位信息 |
| GET | `/api/tasks/{id}/dom-file` | DOM 影像文件 |
| POST | `/api/tasks/{id}/preprocess-generate` | 触发预处理分段 |
| GET | `/api/tasks/{id}/preprocess-segments` | 预处理分段结果 |
| POST | `/api/tasks/{id}/mask-generate` | 生成掩膜 |
| POST | `/api/tasks/{id}/mask-save` | 保存掩膜 |
| POST | `/api/tasks/{id}/inpaint-start` | 启动修复 |
| GET | `/api/tasks/{id}/inpaint-status` | 修复状态 |
| POST | `/api/tasks/{id}/inpaint-cancel` | 取消修复 |
| POST | `/api/tasks/{id}/inpaint-retry` | 重试修复 |
| POST | `/api/tasks/{id}/inpaint-result` | 选择修复结果 |
| GET | `/api/tasks/{id}/inpaint-file` | 修复结果文件 |
| POST | `/api/tasks/{id}/merge-results` | 合并所有分段结果 |

### 矢量文件

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/shapefiles/upload` | 上传 Shapefile |

### UPM 代理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/upm/users` | 用户列表（可选 roleName 筛选） |
| GET | `/api/upm/departments` | 部门列表 |

### 系统状态

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/system/status` | TMS / UPM / SSO 连接状态 |

## 独立运行与容错

| 依赖服务 | 不可用时的影响 | 容错策略 |
|----------|---------------|---------|
| task-management-service | 任务上报/接收不可用 | 启动注册非阻塞；状态回调跳过；本地项目可独立创建和执行 |
| UPM (user-service) | 用户/部门列表为空 | UPM 代理返回错误，明确告知上游服务不可达；前端显示连接异常提示 |
| SSO 服务 | SSO 统一登录不可用 | 只能本地账户登录；创建的项目为本地项目（仅本系统可见） |

### 本地项目质检限制

本地项目（`source: local` 且 `tms_synced: false`）的处理流程止于"待初检"：
- 质检通过（待初检→待写回）和写回完成（待写回→完成）被后端 403 拦截
- 前端显示"需提交TMS"提示
- SSO 恢复后，有 `project:create` 权限的 SSO 用户可将本地项目提交 TMS
- 提交后质检由 TMS 侧有 `quality:check` 权限的用户完成

### 本地用户权限

本地用户拥有完整操作权限：`task:execute`, `task:update_global`, `project:read/create/update/delete`, `user:read`, `quality:check`，但受上述质检限制约束。

## 与 Task Management Service 集成

bridge-removal-service 启动时自动向 task-management-service 注册（`POST /api/external-systems/register`），注册失败不阻塞启动。

**注册准入控制**：内网部署，不使用 `authType` / `authToken`。注册时需提供 `ssoClientId`（UPM 注册的 SSO 客户端 ID），TMS 校验其在 SSO 白名单内。`supportedTaskTypes` 具有独占性，已被其他系统占用的类型会 409。SSO 登出回调绑定是本服务与 SSO 之间的双边关系，TMS 不存储也不代理此信息；本服务在用户首次 SSO 登录成功后自行调 SSO `POST /api/sso/register-client` 绑定登出回调（需 `session_id`）。注册时可提供 `dashboardUrl`（本服务面板 URL），TMS 用户可跳转查看业务详情。

**状态映射原则**：本服务内部维护业务状态（待定位/待初检/待写回/完成等）→ 平台标准状态的映射，回调 TMS 时只发送平台标准状态（PENDING/ASSIGNED/RECEIVED/IN_PROGRESS/PAUSED/COMPLETED/FAILED），TMS 不感知任何业务状态语义。

TMS 创建桥梁去除项目后，通过 `POST /api/projects/{id}/execute` 分发到本服务（内网无认证）。本服务处理完成后通过回调同步状态。

本服务创建的本地项目可通过 `POST /api/projects/{id}/submit-to-tms` 提交到 TMS。
