# TPM 外部系统 API 手册

> 版本：v1.19 | 基础路径：`http://{host}:8082/api`
> 认证方式：SSO OAuth2 授权码模式，请求头携带 `Authorization: Bearer {jwt_token}`

---

## 目录

1. [认证](#1-认证)
2. [外部系统注册](#2-外部系统注册)
3. [任务推送与同步](#3-任务推送与同步)
4. [任务状态与进度回调](#4-任务状态与进度回调)
5. [任务完成数据上报](#5-任务完成数据上报)
6. [人员工作统计查询](#6-人员工作统计查询)
7. [实时通知订阅](#7-实时通知订阅)
8. [状态枚举参考](#8-状态枚举参考)
9. [对接示例](#9-对接示例)

---

## 1. 认证

外部系统通过 SSO OAuth2 授权码模式获取 JWT 令牌后访问 TPM API。

### 1.1 获取 SSO 授权地址

```
GET /api/sso/auth-url?redirect_uri={your_callback_url}
```

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| redirect_uri | string | 否 | SSO 回调地址，默认为 TPM 前端地址 |

**响应**：

```json
{
  "authorization_url": "https://sso.example.com/login?client_id=xxx&redirect_uri=xxx&state=xxx"
}
```

### 1.2 用授权码换取令牌

```
POST /api/sso/token
Content-Type: application/json
```

**请求体**：

```json
{
  "code": "sso_authorization_code"
}
```

**响应**：

```json
{
  "session_id": "abc123",
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "user": {
    "userId": "uuid-of-user",
    "username": "zhangsan",
    "email": "zhangsan@example.com",
    "departmentId": "dept-001",
    "departmentName": "生产一部",
    "roles": ["OPERATOR"],
    "permissions": ["task:execute", "project:read"]
  }
}
```

### 1.3 验证会话

```
GET /api/sso/validate
X-Session-Id: {session_id}
```

**响应**：

```json
{
  "authenticated": true,
  "user": { ... }
}
```

### 1.4 登出

```
POST /api/sso/logout
X-Session-Id: {session_id}
```

---

## 2. 外部系统注册

外部系统在对接 TPM 之前，必须先完成注册。注册时需声明系统标识、SSO 客户端 ID、支持的任务类型和回调路径。

### 2.1 注册外部系统

```
POST /api/external-systems/register
Authorization: Bearer {jwt_token}
Content-Type: application/json
```

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| systemId | string | 是 | 系统唯一标识，建议使用英文小写+连字符，如 `bridge-removal` |
| displayName | string | 是 | 系统显示名称，如"桥梁去除系统" |
| serviceUrl | string | 是 | 系统服务地址，TPM 用于回调，如 `http://bridge-service:5050` |
| ssoClientId | string | 是 | 该系统在 SSO 注册的客户端 ID，TPM 校验白名单 |
| dashboardUrl | string | 否 | 系统面板 URL，TPM 用户可跳转查看业务详情（SSO 互通免登录） |
| supportedTaskTypes | string[] | 是 | 支持的任务类型编码列表，必须为 TPM 中已启用的类型 |
| callbackPath | string | 是 | 回调相对路径，拼接 serviceUrl 使用，如 `/api/callback` |

**请求示例**：

```json
{
  "systemId": "bridge-removal",
  "displayName": "桥梁去除系统",
  "serviceUrl": "http://bridge-service:5050",
  "ssoClientId": "bridge-removal-sso-client",
  "dashboardUrl": "http://bridge-dashboard:5174",
  "supportedTaskTypes": ["BRIDGE_REMOVAL"],
  "callbackPath": "/api/callback"
}
```

**响应**：`200 OK` 返回注册信息；`409 Conflict` 表示任务类型已被其他系统占用；`400 Bad Request` 表示任务类型不存在或未启用。

### 2.2 查询已注册外部系统

```
GET /api/external-systems
Authorization: Bearer {jwt_token}
```

### 2.3 查询单个外部系统

```
GET /api/external-systems/{systemId}
Authorization: Bearer {jwt_token}
```

### 2.4 注销外部系统

```
DELETE /api/external-systems/{systemId}
Authorization: Bearer {jwt_token}
```

需要 `project:delete` 权限。

### 2.5 查询外部系统支持的任务类型

```
GET /api/external-systems/task-types
Authorization: Bearer {jwt_token}
```

**响应**：

```json
[
  { "type": "BRIDGE_REMOVAL", "source": "桥梁去除系统" }
]
```

---

## 3. 任务推送与同步

### 3.1 推送顶层项目（推荐）

外部系统只推送顶层项目，子任务由 TPM 内部创建和管理。

```
POST /api/tasks/external/sequences/upsert
Authorization: Bearer {jwt_token}
Content-Type: application/json
```

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| externalSystem | string | 是 | 外部系统标识，与注册时 systemId 一致 |
| project | object | 是 | 项目创建请求，结构见下方 |

**project 对象**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 项目名称 |
| type | string | 是 | 项目类型编码，必须与注册时 supportedTaskTypes 中的类型一致 |
| category | string | 否 | 任务类别，默认 `PROJECT` |
| departmentId | string | 是 | 负责部门 ID |
| workload | double | 否 | 工作量 |
| workloadUnit | string | 否 | 工作量单位编码 |
| weight | double | 否 | 权重，默认 1.0，范围 0.01~100 |
| externalSystem | string | 否 | 若为空则自动取外层 externalSystem |
| externalTaskId | string | 否 | 外部系统中的任务 ID，用于幂等 upsert |
| externalUrl | string | 否 | 外部系统中的任务详情链接 |
| plannedDueAt | string | 否 | 计划完成时间，ISO 8601 格式 |
| priority | int | 否 | 优先级 |
| inputParams | string | 否 | 输入参数，JSON 字符串 |
| projectLeaderId | string(UUID) | 否 | 项目负责人 ID |
| operatorIds | string[](UUID) | 否 | 操作员 ID 列表 |
| inspectorIds | string[](UUID) | 否 | 质检员 ID 列表 |
| remarks | string | 否 | 备注 |

**请求示例**：

```json
{
  "externalSystem": "bridge-removal",
  "project": {
    "name": "京沪高速桥梁检测项目-2026Q2",
    "type": "BRIDGE_REMOVAL",
    "departmentId": "dept-001",
    "workload": 500.0,
    "workloadUnit": "幅",
    "externalTaskId": "BR-2026-0421",
    "externalUrl": "http://bridge-dashboard:5174/projects/BR-2026-0421",
    "plannedDueAt": "2026-06-30T23:59:59+08:00",
    "priority": 1
  }
}
```

**幂等说明**：若 `externalSystem` + `externalTaskId` 组合已存在，则更新已有项目而非重复创建。

### 3.2 推送单个任务（upsert）

```
POST /api/tasks/external/tasks/upsert
Authorization: Bearer {jwt_token}
Content-Type: application/json
```

与普通创建任务相同，但必须提供 `externalSystem` 和 `externalTaskId`。适用于外部系统需要直接创建子任务的场景。

**请求体**：同 [TaskCreateRequest](#taskcreaterequest-字段)，其中 `externalSystem` 和 `externalTaskId` 为必填。

### 3.3 创建任务（通用）

```
POST /api/tasks
Authorization: Bearer {jwt_token}
Content-Type: application/json
```

需要 `project:create` 权限。请求体同 TaskCreateRequest。

### 3.4 查询任务

```
GET /api/tasks/{id}
Authorization: Bearer {jwt_token}
```

### 3.5 查询任务列表

```
GET /api/tasks?page=0&size=20&category=PROJECT&externalSystem=bridge-removal
Authorization: Bearer {jwt_token}
```

| 参数 | 类型 | 说明 |
|------|------|------|
| page | int | 页码，从 0 开始 |
| size | int | 每页数量 |
| sort | string | 排序，格式 `field,direction`，如 `createdAt,desc` |
| category | string | 任务类别过滤：PROJECT / PHASE / OPERATION_TASK / SELF_CHECK_TASK |
| externalSystem | string | 按外部系统标识过滤 |

### 3.6 查询子任务

```
GET /api/tasks/{id}/subtasks
Authorization: Bearer {jwt_token}
```

### 3.7 更新任务

```
PUT /api/tasks/{id}
Authorization: Bearer {jwt_token}
Content-Type: application/json
```

请求体同 TaskUpdateRequest，所有字段可选。

### 3.8 删除任务

```
DELETE /api/tasks/{id}
Authorization: Bearer {jwt_token}
```

需要 `project:delete` 权限。

---

## 4. 任务状态与进度回调

外部系统通过以下接口回调 TPM 更新任务状态和进度。

### 4.1 更新工作流状态（核心回调接口）

外部系统通过此接口向 TPM 回报任务进度、状态变更和完成数据。

```
PATCH /api/tasks/{id}/workflow-status
Authorization: Bearer {jwt_token}
Content-Type: application/json
```

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| workflowStatus | string | 否 | 工作流状态：PENDING_ACCEPTANCE / ACCEPTANCE_COMPLETED / ARCHIVED |
| progress | int | 否 | 进度百分比 0~100 |
| results | string | 否 | 输出结果，JSON 字符串 |
| systemId | string | 否 | 回调的外部系统标识 |
| taskId | string(UUID) | 否 | 任务 ID，若提供必须与路径参数一致 |
| completedWorkload | double | 否 | 已完成工作量 |
| workloadUnit | string | 否 | 工作量单位编码 |
| intermediatePath | string | 否 | 中间产物路径 |
| commentStage | string | 否 | 评论阶段 |
| commentResult | string | 否 | 评论结果 |
| commentMessage | string | 否 | 评论内容 |
| stageResponsibles | object[] | 否 | 阶段责任人列表 |

**stageResponsibles 对象**：

| 字段 | 类型 | 说明 |
|------|------|------|
| stage | string | 阶段名称 |
| userId | string(UUID) | 责任人 ID |
| username | string | 责任人用户名 |
| completedAt | string | 完成时间，ISO 8601 格式 |

**状态映射规则**：

外部系统的业务状态由外部系统内部维护，回调 TPM 时只发送 TPM 平台标准状态。TPM 不存储或翻译任何业务状态。

| 外部系统内部状态 | 回调 TPM 的 workflowStatus | TPM 任务状态变化 |
|-----------------|---------------------------|-----------------|
| 处理中 | — | IN_PROGRESS（由进度驱动） |
| 待验收 | PENDING_ACCEPTANCE | SUBMITTED_FOR_QA |
| 验收通过 | ACCEPTANCE_COMPLETED | QA_COMPLETING → QA_COMPLETED |
| 归档 | ARCHIVED | COMPLETED |

**重要**：外部系统回调 `COMPLETED` 状态时，TPM 自动映射为 `SUBMITTED_FOR_QA`，不直接进入 `QA_COMPLETED`。TMS 质检通过后才标记为完成。

### 4.2 更新状态工作量

直接更新叶子任务各状态的工作量分布。

```
PATCH /api/tasks/{id}/status-workloads
Authorization: Bearer {jwt_token}
Content-Type: application/json
```

**请求体**：

```json
{
  "PENDING": 0,
  "ASSIGNED": 0,
  "RECEIVED": 0,
  "IN_PROGRESS": 25.0,
  "SUBMITTED_FOR_QA": 75.0,
  "QA_COMPLETING": 0,
  "QA_COMPLETED": 0
}
```

各阶段工作量之和应等于任务总工作量。TPM 根据各阶段工作量自动计算进度百分比。

### 4.3 更新任务状态

```
PATCH /api/tasks/{id}/status?status={TaskStatus}
Authorization: Bearer {jwt_token}
```

**status 参数**：TaskStatus 枚举值，见 [8.1 TaskStatus](#81-taskstatus)。

### 4.4 触发任务执行

```
POST /api/tasks/{id}/execute
Authorization: Bearer {jwt_token}
```

将任务分发到已注册的外部系统执行。TPM 根据 `task.type` 查找匹配的外部系统，按 `task.externalSystem` 绑定选择目标系统。

---

## 5. 任务完成数据上报

外部系统完成任务后，通过此接口上报完成数据，包括阶段责任人信息。

```
POST /api/tasks/{id}/completion-data
Authorization: Bearer {jwt_token}
Content-Type: application/json
```

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| systemId | string | 否 | 外部系统标识 |
| taskId | string(UUID) | 否 | 任务 ID，若提供必须与路径参数一致 |
| workflowStatus | string | 否 | 工作流状态枚举名称 |
| progress | int | 否 | 进度百分比 |
| results | string | 否 | 输出结果 |
| completedWorkload | double | 否 | 已完成工作量 |
| workloadUnit | string | 否 | 工作量单位 |
| stageResponsibles | object[] | 否 | 阶段责任人列表 |

**请求示例**：

```json
{
  "systemId": "bridge-removal",
  "workflowStatus": "PENDING_ACCEPTANCE",
  "progress": 100,
  "completedWorkload": 500.0,
  "workloadUnit": "幅",
  "results": "{\"totalBridges\": 120, \"processedBridges\": 120, \"removedBridges\": 85}",
  "stageResponsibles": [
    {
      "stage": "桥梁检测",
      "userId": "uuid-operator-1",
      "username": "zhangsan",
      "completedAt": "2026-05-10T14:30:00+08:00"
    },
    {
      "stage": "掩膜生成",
      "userId": "uuid-operator-2",
      "username": "lisi",
      "completedAt": "2026-05-12T09:15:00+08:00"
    }
  ]
}
```

---

## 6. 人员工作统计查询

查询某项目下人员的工作量统计，可按时间区间和粒度分组。

```
GET /api/tasks/{id}/personnel-stats?userId={userId}&startDate={startDate}&endDate={endDate}&interval={interval}
Authorization: Bearer {jwt_token}
```

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| userId | string(UUID) | 否 | 筛选指定用户 |
| startDate | string | 否 | 起始日期，ISO 8601 格式 |
| endDate | string | 否 | 结束日期，ISO 8601 格式 |
| interval | string | 否 | 统计粒度：day / week / month，默认 day |

**响应**：

```json
{
  "userId": "uuid-of-user",
  "username": "zhangsan",
  "totalTasks": 15,
  "completedTasks": 12,
  "totalWorkload": 1500.0,
  "workloadUnit": "幅",
  "intervalBreakdown": [
    { "period": "2026-05-01", "taskCount": 5, "workload": 500.0 },
    { "period": "2026-05-02", "taskCount": 3, "workload": 300.0 }
  ],
  "stageResponsibleInfo": [
    { "stage": "桥梁检测", "username": "zhangsan", "completedAt": "2026-05-10T14:30:00+08:00" }
  ]
}
```

---

## 7. 实时通知订阅

通过 Server-Sent Events (SSE) 订阅任务变更通知。

```
GET /api/sse/subscribe
Authorization: Bearer {jwt_token}
Accept: text/event-stream
```

连接建立后，TPM 在任务状态变更、进度更新、质检结果等事件发生时推送通知。SSE 事件格式：

```
event: task-update
data: {"taskId": "uuid", "action": "status-change", "status": "IN_PROGRESS", ...}
```

---

## 8. 状态枚举参考

### 8.1 TaskStatus

任务执行状态，10 个值。

| 枚举值 | 说明 | 可流转到 |
|--------|------|---------|
| PENDING | 待分配 | ASSIGNED |
| ASSIGNED | 已分配 | RECEIVED, PENDING（撤销分配） |
| RECEIVED | 已接收 | IN_PROGRESS, ASSIGNED（撤销接收） |
| IN_PROGRESS | 进行中 | SUBMITTED_FOR_QA, PAUSED, FAILED |
| PAUSED | 已暂停 | IN_PROGRESS |
| SUBMITTED_FOR_QA | 待质检 | QA_COMPLETING, IN_PROGRESS（撤销质检） |
| QA_COMPLETING | 质检中 | QA_COMPLETED, IN_PROGRESS（质检不通过） |
| QA_COMPLETED | 质检完成 | COMPLETED |
| COMPLETED | 已完成 | —（终态） |
| FAILED | 已失败 | IN_PROGRESS |

**关键约束**：
- `QA_COMPLETED` 是稳定完成态，不允许直接转为 `FAILED`。发现问题需新建返修任务并关联原任务。
- 外部系统回调 `COMPLETED` 时，TPM 自动映射为 `SUBMITTED_FOR_QA`，需 TMS 质检通过后才完成。

### 8.2 WorkflowStatus

项目验收归档阶段，3 个值，仅适用于根项目（PROJECT）。

| 枚举值 | 说明 |
|--------|------|
| PENDING_ACCEPTANCE | 待验收 |
| ACCEPTANCE_COMPLETED | 验收完成 |
| ARCHIVED | 已归档（归档后 status 自动设为 COMPLETED） |

### 8.3 TaskCategory

| 枚举值 | 说明 |
|--------|------|
| PROJECT | 项目（根节点） |
| PHASE | 阶段（可嵌套） |
| OPERATION_TASK | 作业任务（叶子节点） |
| SELF_CHECK_TASK | 自检任务（叶子节点） |

### 8.4 CompositionMode

| 枚举值 | 说明 |
|--------|------|
| HOMOGENEOUS | 同质任务——子任务类型相同，进度按 `权重 × 工作量 × 进度` 汇聚 |
| HETEROGENEOUS | 异质任务——子任务类型不同，进度按 `权重 × 进度` 汇聚 |

---

## 9. 对接示例

### 9.1 完整对接流程：桥梁去除系统

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  SSO 服务    │     │  TPM 后端    │     │ 桥梁去除系统 │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                    │                    │
       │  ① 注册外部系统     │                    │
       │                    │◄───────────────────│ POST /api/external-systems/register
       │                    │  200 OK            │
       │                    │                    │
       │  ② SSO 登录获取令牌 │                    │
       │◄───────────────────│────────────────────│ GET /api/sso/auth-url
       │  authorization_url │                    │
       │                    │                    │ 用户在 SSO 登录
       │                    │◄───────────────────│ POST /api/sso/token {code}
       │                    │  {token, user}     │
       │                    │                    │
       │  ③ 推送项目         │                    │
       │                    │◄───────────────────│ POST /api/tasks/external/sequences/upsert
       │                    │  {project}         │
       │                    │                    │
       │  ④ TPM 分发任务     │                    │
       │                    │───────────────────►│ POST {serviceUrl}{callbackPath}
       │                    │                    │ 桥梁系统开始处理
       │                    │                    │
       │  ⑤ 进度回调         │                    │
       │                    │◄───────────────────│ PATCH /api/tasks/{id}/workflow-status
       │                    │                    │ {progress: 50, ...}
       │                    │                    │
       │  ⑥ 完成回调         │                    │
       │                    │◄───────────────────│ POST /api/tasks/{id}/completion-data
       │                    │                    │ {workflowStatus: "PENDING_ACCEPTANCE", ...}
       │                    │                    │
       │  ⑦ TPM 质检        │                    │
       │                    │  SUBMITTED_FOR_QA  │
       │                    │  → QA_COMPLETING   │
       │                    │  → QA_COMPLETED    │
       │                    │  → COMPLETED       │
       │                    │                    │
```

### 9.2 Python 对接示例

```python
import requests

TPM_BASE = "http://localhost:8082/api"

class TpmClient:
    def __init__(self, base_url=TPM_BASE):
        self.base_url = base_url
        self.session = requests.Session()
        self.token = None

    def login(self, username: str, password: str = None):
        """方式一：SSO 登录（生产环境）"""
        # 1. 获取授权地址
        resp = self.session.get(f"{self.base_url}/sso/auth-url")
        auth_url = resp.json()["authorization_url"]
        # 2. 引导用户访问 auth_url，获取 code
        # 3. 用 code 换 token
        code = input(f"请访问 {auth_url} 完成登录后输入 code: ")
        resp = self.session.post(f"{self.base_url}/sso/token", json={"code": code})
        data = resp.json()
        self.token = data.get("token")
        self.session.headers["Authorization"] = f"Bearer {self.token}"
        return data

    def register_system(self, system_id: str, display_name: str,
                        service_url: str, sso_client_id: str,
                        task_types: list[str], callback_path: str,
                        dashboard_url: str = None):
        """注册外部系统"""
        payload = {
            "systemId": system_id,
            "displayName": display_name,
            "serviceUrl": service_url,
            "ssoClientId": sso_client_id,
            "supportedTaskTypes": task_types,
            "callbackPath": callback_path,
        }
        if dashboard_url:
            payload["dashboardUrl"] = dashboard_url
        resp = self.session.post(f"{self.base_url}/external-systems/register", json=payload)
        if resp.status_code == 409:
            raise Exception(f"任务类型已被占用: {resp.json()}")
        resp.raise_for_status()
        return resp.json()

    def push_project(self, external_system: str, name: str, task_type: str,
                     department_id: str, external_task_id: str,
                     workload: float = None, workload_unit: str = None,
                     **kwargs):
        """推送顶层项目"""
        project = {
            "name": name,
            "type": task_type,
            "departmentId": department_id,
            "externalTaskId": external_task_id,
        }
        if workload is not None:
            project["workload"] = workload
        if workload_unit:
            project["workloadUnit"] = workload_unit
        project.update(kwargs)

        resp = self.session.post(
            f"{self.base_url}/tasks/external/sequences/upsert",
            json={"externalSystem": external_system, "project": project}
        )
        resp.raise_for_status()
        return resp.json()

    def report_progress(self, task_id: str, progress: int,
                        completed_workload: float = None,
                        workload_unit: str = None):
        """回调进度"""
        payload = {"progress": progress}
        if completed_workload is not None:
            payload["completedWorkload"] = completed_workload
        if workload_unit:
            payload["workloadUnit"] = workload_unit
        resp = self.session.patch(
            f"{self.base_url}/tasks/{task_id}/workflow-status",
            json=payload
        )
        resp.raise_for_status()
        return resp.json()

    def report_completion(self, task_id: str, system_id: str,
                          workflow_status: str = "PENDING_ACCEPTANCE",
                          completed_workload: float = None,
                          workload_unit: str = None,
                          results: str = None,
                          stage_responsibles: list = None):
        """上报完成数据"""
        payload = {
            "systemId": system_id,
            "workflowStatus": workflow_status,
        }
        if completed_workload is not None:
            payload["completedWorkload"] = completed_workload
        if workload_unit:
            payload["workloadUnit"] = workload_unit
        if results:
            payload["results"] = results
        if stage_responsibles:
            payload["stageResponsibles"] = stage_responsibles
        resp = self.session.post(
            f"{self.base_url}/tasks/{task_id}/completion-data",
            json=payload
        )
        resp.raise_for_status()
        return resp.json()

    def get_task(self, task_id: str):
        """查询任务"""
        resp = self.session.get(f"{self.base_url}/tasks/{task_id}")
        resp.raise_for_status()
        return resp.json()

    def get_personnel_stats(self, task_id: str, interval: str = "day",
                            start_date: str = None, end_date: str = None):
        """查询人员工作统计"""
        params = {"interval": interval}
        if start_date:
            params["startDate"] = start_date
        if end_date:
            params["endDate"] = end_date
        resp = self.session.get(
            f"{self.base_url}/tasks/{task_id}/personnel-stats",
            params=params
        )
        resp.raise_for_status()
        return resp.json()


# ===== 使用示例 =====

client = TpmClient()
client.login("your_username")

# 1. 注册系统（首次对接时执行一次）
client.register_system(
    system_id="bridge-removal",
    display_name="桥梁去除系统",
    service_url="http://bridge-service:5050",
    sso_client_id="bridge-removal-sso-client",
    task_types=["BRIDGE_REMOVAL"],
    callback_path="/api/callback",
    dashboard_url="http://bridge-dashboard:5174"
)

# 2. 推送项目
project = client.push_project(
    external_system="bridge-removal",
    name="京沪高速桥梁检测项目-2026Q2",
    task_type="BRIDGE_REMOVAL",
    department_id="dept-001",
    external_task_id="BR-2026-0421",
    workload=500.0,
    workload_unit="幅"
)
task_id = project["id"]

# 3. 处理过程中回调进度
client.report_progress(task_id, progress=50, completed_workload=250.0, workload_unit="幅")

# 4. 处理完成，上报完成数据
client.report_completion(
    task_id=task_id,
    system_id="bridge-removal",
    workflow_status="PENDING_ACCEPTANCE",
    completed_workload=500.0,
    workload_unit="幅",
    results='{"totalBridges": 120, "processedBridges": 120}',
    stage_responsibles=[
        {"stage": "桥梁检测", "userId": "uuid-1", "username": "zhangsan", "completedAt": "2026-05-10T14:30:00+08:00"}
    ]
)

# 5. 查询任务状态
task = client.get_task(task_id)
print(f"当前状态: {task['status']}")  # SUBMITTED_FOR_QA（等待 TMS 质检）

# 6. 查询人员统计
stats = client.get_personnel_stats(task_id, interval="day", start_date="2026-05-01")
print(f"总工作量: {stats['totalWorkload']} {stats['workloadUnit']}")
```

### 9.3 cURL 对接示例

```bash
# 1. 注册外部系统
curl -X POST http://localhost:8082/api/external-systems/register \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "systemId": "bridge-removal",
    "displayName": "桥梁去除系统",
    "serviceUrl": "http://bridge-service:5050",
    "ssoClientId": "bridge-removal-sso-client",
    "supportedTaskTypes": ["BRIDGE_REMOVAL"],
    "callbackPath": "/api/callback",
    "dashboardUrl": "http://bridge-dashboard:5174"
  }'

# 2. 推送项目
curl -X POST http://localhost:8082/api/tasks/external/sequences/upsert \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "externalSystem": "bridge-removal",
    "project": {
      "name": "京沪高速桥梁检测项目-2026Q2",
      "type": "BRIDGE_REMOVAL",
      "departmentId": "dept-001",
      "workload": 500.0,
      "workloadUnit": "幅",
      "externalTaskId": "BR-2026-0421"
    }
  }'

# 3. 回调进度
curl -X PATCH http://localhost:8082/api/tasks/$TASK_ID/workflow-status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"progress": 50, "completedWorkload": 250.0, "workloadUnit": "幅"}'

# 4. 上报完成数据
curl -X POST http://localhost:8082/api/tasks/$TASK_ID/completion-data \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "systemId": "bridge-removal",
    "workflowStatus": "PENDING_ACCEPTANCE",
    "progress": 100,
    "completedWorkload": 500.0,
    "workloadUnit": "幅",
    "stageResponsibles": [
      {"stage": "桥梁检测", "userId": "uuid-1", "username": "zhangsan", "completedAt": "2026-05-10T14:30:00+08:00"}
    ]
  }'

# 5. 查询任务
curl http://localhost:8082/api/tasks/$TASK_ID \
  -H "Authorization: Bearer $TOKEN"

# 6. 查询人员统计
curl "http://localhost:8082/api/tasks/$TASK_ID/personnel-stats?interval=day&startDate=2026-05-01" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 附录：TaskCreateRequest 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 任务名称 |
| type | string | 条件必填 | 叶子任务必填，容器任务为 null |
| category | string | 是 | PROJECT / PHASE / OPERATION_TASK / SELF_CHECK_TASK |
| status | string | 否 | 初始状态，默认 PENDING |
| priority | int | 否 | 优先级 |
| plannedDueAt | string | 否 | 计划完成时间，ISO 8601 |
| departmentId | string | 是 | 负责部门 ID |
| projectId | string(UUID) | 否 | 所属项目 ID |
| parentTaskId | string(UUID) | 否 | 父任务 ID |
| workload | double | 否 | 工作量 |
| workloadUnit | string | 否 | 工作量单位编码 |
| weight | double | 否 | 权重 0.01~100，默认 1 |
| inProgressWeight | double | 否 | IN_PROGRESS 阶段权重，默认 0.95 |
| externalSystem | string | 条件必填 | 外部系统标识（外部推送时必填） |
| externalTaskId | string | 条件必填 | 外部任务 ID（外部推送时必填） |
| externalUrl | string | 否 | 外部系统任务详情链接 |
| inputParams | string | 否 | 输入参数 JSON |
| outputResults | string | 否 | 输出结果 JSON |
| projectLeaderId | string(UUID) | 否 | 项目负责人 |
| operatorIds | string[](UUID) | 否 | 操作员列表 |
| inspectorIds | string[](UUID) | 否 | 质检员列表 |
| qaDepartmentId | string | 否 | 质检部门 ID |
| qaAssigneeId | string(UUID) | 否 | 质检员 ID |
| remarks | string | 否 | 备注 |
