# 任务管理服务 (Task Management Service) API 文档

本文档描述了地理信息协同生产系统中任务管理服务的 API 接口。

**服务基础 URL**: `http://localhost:8082/api/tasks`

## 0. 桥梁去除分解/脚本回调鉴权（TASK_MANAGEMENT_AUTH_TOKEN）

桥梁去除相关的批任务分解/单元处理会由任务服务启动 Python 脚本执行。脚本在执行过程中需要回调任务服务接口（创建子任务、写入 workflow_status、写入 outputResults 等），因此需要在启动 `task-management-service` 的进程环境中提供一个可用的 Bearer Token：

- 环境变量名：`TASK_MANAGEMENT_AUTH_TOKEN`
- 值：用户管理服务签发的 **JWT access token**（不包含 `Bearer ` 前缀）

### 0.1 如何获取 Token（推荐：调用用户管理服务登录接口）

1) 调用用户管理服务登录接口（`user-management-service`）：

- URL：`POST http://localhost:8081/auth/login`
- Body 示例：

```json
{
  "username": "admin",
  "password": "your_password"
}
```

2) 从响应中取 `token` 字段作为 `TASK_MANAGEMENT_AUTH_TOKEN` 的值。

说明：
- 建议使用“生产经理/部门管理员/项目经理”等具备项目创建与分解能力的账号获取 token，并作为“脚本服务账号 token”使用，避免使用超级管理员 token。
- `task-management-service` 会校验 JWT，有效前提是任务服务与用户服务使用相同的 JWT 密钥（`jwt.secret`）或兼容的验签配置，否则即使拿到了 token 也会被任务服务拒绝。

### 0.2 如何配置到 task-management-service（Windows / PowerShell）

在启动 `task-management-service` 之前设置（临时，仅当前终端有效）：

```powershell
$env:TASK_MANAGEMENT_AUTH_TOKEN="你的JWTToken"
```

或设置为系统环境变量（永久，需重新打开终端/IDE 使其生效）：

```powershell
setx TASK_MANAGEMENT_AUTH_TOKEN "你的JWTToken"
```

完成后重启 `task-management-service`。如果未配置该变量，触发分解接口会返回明确错误提示。

## 1. 任务管理 (Task Management)

### 1.1 创建任务 (Create Task)

*   **URL**: `/api/tasks`
*   **Method**: `POST`
*   **Summary**: 创建一个新的协同生产任务。
*   **Authentication**: Required (Bearer Token)
*   **Request Body**:
    ```json
    {
      "name": "Task Name",
      "type": "DATA_PROCESSING",
      "priority": 1,
      "assigneeId": 101,
      "dueAt": "2023-12-31T23:59:59Z",
      "inputParams": "{\"region\": \"CN-BJ\"}",
      "parentTaskId": null
    }
    ```
    *   `name` (String, Required): 任务名称。
    *   `type` (String, Required): 任务类型 (e.g., `DATA_COLLECTION`, `DATA_PROCESSING`, `QUALITY_CHECK`, `MAP_compilation`).
    *   `priority` (Integer, Optional): 优先级 (数值越大优先级越高)。
    *   `assigneeId` (Long, Optional): 被指派的用户 ID (关联用户服务)。
    *   `dueAt` (DateTime, Optional): 截止时间。
    *   `inputParams` (String, Optional): 任务输入参数 (JSON 字符串格式)。
    *   `parentTaskId` (UUID, Optional): 父任务 ID。

*   **Response**: `200 OK`
    ```json
    {
      "id": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
      "name": "Task Name",
      "type": "DATA_PROCESSING",
      "status": "PENDING",
      "priority": 1,
      "assigneeId": 101,
      "progress": 0,
      "createdAt": "2023-10-27T10:00:00Z",
      "dueAt": "2023-12-31T23:59:59Z"
    }
    ```

### 1.2 获取任务列表 (Get All Tasks)

*   **URL**: `/api/tasks`
*   **Method**: `GET`
*   **Summary**: 分页获取所有任务。
*   **Authentication**: Required (Bearer Token)
*   **Parameters**:
    *   `page` (int, default: 0): 页码。
    *   `size` (int, default: 10): 每页大小。
*   **Response**: `200 OK`
    ```json
    {
      "content": [
        {
          "id": "...",
          "name": "Task 1",
          ...
        }
      ],
      "pageable": { ... },
      "totalElements": 100,
      "totalPages": 10
    }
    ```

### 1.3 获取任务详情 (Get Task by ID)

*   **URL**: `/api/tasks/{id}`
*   **Method**: `GET`
*   **Summary**: 根据 ID 获取任务详细信息。
*   **Authentication**: Required (Bearer Token)
*   **Parameters**:
    *   `id` (UUID): 任务 ID。
*   **Response**: `200 OK`
    ```json
    {
      "id": "...",
      "name": "Task Name",
      ...
    }
    ```

### 1.4 更新任务 (Update Task)

*   **URL**: `/api/tasks/{id}`
*   **Method**: `PUT`
*   **Summary**: 更新任务的基本信息（名称、类型、优先级、参数等）。
*   **Authentication**: Required (Bearer Token)
*   **Request Body**:
    ```json
    {
      "name": "Updated Name",
      "type": "QUALITY_CHECK",
      "priority": 2,
      ...
    }
    ```
*   **Response**: `200 OK` (Updated Task Object)

### 1.5 删除任务 (Delete Task)

*   **URL**: `/api/tasks/{id}`
*   **Method**: `DELETE`
*   **Summary**: 删除指定任务。
*   **Authentication**: Required (Bearer Token)
*   **Response**: `204 No Content`

### 1.6 更新任务状态 (Update Task Status)

*   **URL**: `/api/tasks/{id}/status`
*   **Method**: `PATCH`
*   **Summary**: 变更任务状态。
*   **Authentication**: Required (Bearer Token)
*   **Parameters**:
    *   `status` (String): 新状态 (e.g., `PENDING`, `ASSIGNED`, `RECEIVED`, `IN_PROGRESS`, `SUBMITTED_FOR_QA`, `QA_COMPLETING`, `QA_COMPLETED`, `PAUSED`, `COMPLETED`, `FAILED`).
*   **Response**: `200 OK` (Updated Task Object)

### 1.7 指派任务 (Assign Task)

*   **URL**: `/api/tasks/{id}/assign`
*   **Method**: `POST`
*   **Summary**: 将任务指派给特定用户。
*   **Authentication**: Required (Bearer Token)
*   **Parameters**:
    *   `userId` (Long): 用户 ID。
*   **Response**: `200 OK` (Updated Task Object)

### 1.8 获取子任务 (Get Subtasks)

*   **URL**: `/api/tasks/{id}/subtasks`
*   **Method**: `GET`
*   **Summary**: 获取指定任务的所有直接子任务。
*   **Authentication**: Required (Bearer Token)
*   **Response**: `200 OK` (List of Task Objects)

### 1.9 添加任务依赖 (Add Task Dependency)

*   **URL**: `/api/tasks/{id}/dependencies`
*   **Method**: `POST`
*   **Summary**: 为任务添加前置依赖任务（当前任务依赖于 dependencyTaskId 指定的任务）。
*   **Authentication**: Required (Bearer Token)
*   **Parameters**:
    *   `dependencyTaskId` (UUID): 被依赖的任务 ID。
*   **Response**: `200 OK`

### 1.10 提交质检 (Submit for QA)

*   **URL**: `/api/tasks/{id}/submit-qa`
*   **Method**: `POST`
*   **Summary**: 操作员提交质检（IN_PROGRESS → SUBMITTED_FOR_QA），工作量从 IN_PROGRESS 搬移到 SUBMITTED_FOR_QA。需 `task:execute` 权限且为任务接收人。
*   **Authentication**: Required (Bearer Token)
*   **Response**: `200 OK` (Updated Task Object)

### 1.11 接收质检 (Accept QA)

*   **URL**: `/api/tasks/{id}/accept-qa`
*   **Method**: `POST`
*   **Summary**: 质检员接收质检任务（SUBMITTED_FOR_QA → QA_COMPLETING），工作量从 SUBMITTED_FOR_QA 搬移到 QA_COMPLETING，assigneeId 转为质检员。需 `quality:check` 权限。
*   **Authentication**: Required (Bearer Token)
*   **Response**: `200 OK` (Updated Task Object)

### 1.12 质检通过 (QA Approve)

*   **URL**: `/api/tasks/{id}/qa-approve`
*   **Method**: `POST`
*   **Summary**: 质检员通过质检（QA_COMPLETING → QA_COMPLETED），工作量从 QA_COMPLETING 搬移到 QA_COMPLETED。需 `quality:check` 权限。
*   **Authentication**: Required (Bearer Token)
*   **Response**: `200 OK` (Updated Task Object)

### 1.13 质检不通过 (QA Reject)

*   **URL**: `/api/tasks/{id}/qa-reject`
*   **Method**: `POST`
*   **Summary**: 质检员判定不通过（QA_COMPLETING → IN_PROGRESS），工作量从 QA_COMPLETING 退回 IN_PROGRESS，保留已填完成量。需 `quality:check` 权限。
*   **Authentication**: Required (Bearer Token)
*   **Response**: `200 OK` (Updated Task Object)

### 1.14 撤销质检 (Revoke QA)

*   **URL**: `/api/tasks/{id}/revoke-qa`
*   **Method**: `POST`
*   **Summary**: 操作员撤销质检（SUBMITTED_FOR_QA → IN_PROGRESS），工作量从 SUBMITTED_FOR_QA 退回 IN_PROGRESS，保留已填完成量。需 assigneeId + `task:execute` 权限。仅 SUBMITTED_FOR_QA 状态可撤销。
*   **Authentication**: Required (Bearer Token)
*   **Response**: `200 OK` (Updated Task Object)

## 2. 任务统计 (Task Statistics)

### 2.1 统计作业人员完成的任务数 (Count Completed Tasks by Assignee)

*   **URL**: `/api/tasks/count/completed`
*   **Method**: `GET`
*   **Summary**: 根据作业人员ID，统计其已完成的任务数量。
*   **Authentication**: Required (Bearer Token)
*   **Parameters**:
    *   `assigneeId` (Long, Required): 作业人员的用户 ID。
*   **Response**: `200 OK`
    ```json
    15
    ```
    *   响应体直接为一个长整型 (`Long`) 数字，代表已完成的任务总数。

## 3. 数据模型 (Data Models)

### 2.1 Task (任务)

| 字段名 | 类型 | 描述 |
| :--- | :--- | :--- |
| `id` | UUID | 唯一标识符 |
| `name` | String | 任务名称 |
| `type` | Enum | 任务类型 (DATA_COLLECTION, DATA_PROCESSING, QUALITY_CHECK, MAP_COMPILATION) |
| `status` | Enum | 任务状态 (PENDING, ASSIGNED, RECEIVED, IN_PROGRESS, SUBMITTED_FOR_QA, QA_COMPLETING, QA_COMPLETED, PAUSED, COMPLETED, FAILED) |
| `priority` | Integer | 优先级 |
| `assigneeId` | Long | 负责人 ID (关联用户系统) |
| `departmentId` | String | 责任部门 ID |
| `createdByName` | String | 项目创建人姓名 |
| `createdDepartmentId` | String | 创建部门 ID |
| `createdDepartmentName` | String | 创建部门名称 |
| `progress` | Integer | 进度百分比 (0-100) |
| `inputParams` | String | 输入参数 (JSON文本) |
| `outputResults` | String | 输出结果 (JSON文本) |
| `parentTaskId` | UUID | 父任务 ID |
| `createdAt` | DateTime | 创建时间 |
| `dueAt` | DateTime | 截止时间 |

### 2.2 TaskDependency (任务依赖)

| 字段名 | 类型 | 描述 |
| :--- | :--- | :--- |
| `id` | UUID | 唯一标识符 |
| `taskId` | UUID | 任务 ID (后续任务) |
| `dependencyTaskId` | UUID | 依赖任务 ID (前置任务) |
