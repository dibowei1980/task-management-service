# 任务服务 API（V2 要点）

## 1. 通用字段

- category：`PROJECT | OPERATION_TASK | QA_TASK | SELF_CHECK_TASK`
- plannedDueAt：可选，ISO-8601 时间字符串（例如 `2026-02-15T12:00:00Z`）
- projectLeaderId：仅项目使用（对应项目负责人）
- operatorIds：操作任务多操作员
- inspectorIds：质检任务多质检员
- departmentId：项目的责任部门（用于部门隔离）
- createdByName：项目创建人姓名
- createdDepartmentId：创建部门 ID（记录创建时所属部门）
- createdDepartmentName：创建部门名称（记录创建时所属部门）

## 2. 主要接口

### 2.1 创建任务

`POST /api/tasks`

请求体（TaskCreateRequest，按类别使用相关字段）：
- 项目（PROJECT）：`name,type,category=PROJECT,status,priority,departmentId?,projectLeaderId?,plannedDueAt?,createdByName?,createdDepartmentId?,createdDepartmentName?`
- 操作任务（OPERATION_TASK）：`name,type,category=OPERATION_TASK,projectId,parentTaskId?,operatorIds?,plannedDueAt?`
- 质检任务（QA_TASK）：`name,type,category=QA_TASK,projectId,parentTaskId?,inspectorIds?,plannedDueAt?`

返回：TaskResponse（包含 operatorIds/inspectorIds/projectLeaderId）

### 2.2 更新任务

`PUT /api/tasks/{id}`

请求体（TaskUpdateRequest，字段均可选）：
- 项目：`name,status,priority,plannedDueAt,projectLeaderId`
- 操作任务：`name,status,priority,plannedDueAt,operatorIds`
- 质检任务：`name,status,priority,plannedDueAt,inspectorIds`

### 2.3 查询任务

- `GET /api/tasks?page=&size=`：分页查询（自动按 departmentId 进行部门隔离）
- `GET /api/tasks/{id}`：按 ID 查询（服务层校验 departmentId 一致性）
- `GET /api/tasks/{id}/subtasks`：子任务查询（服务层校验 departmentId 一致性）
- `GET /api/tasks/{id}/dependencies`：依赖查询（服务层校验 departmentId 一致性）
- `GET /api/tasks/count/completed?assigneeId=`：统计（按 departmentId 隔离）
