# 任务管理服务 (Task Management Service) 技术架构文档

本文档详细描述了地理信息协同生产系统中“任务管理服务”的技术架构、设计决策及核心组件。

## 1. 架构概览

任务管理服务采用微服务架构设计，基于 **Spring Boot** 框架构建，旨在提供高效、可靠的地理信息生产任务生命周期管理。服务遵循分层架构原则，确保职责分离和可维护性。

### 1.1 核心职责
*   **任务全生命周期管理**: 创建、指派、执行、监控、完成、归档。
*   **任务依赖管理**: 支持任务间的 DAG (有向无环图) 依赖关系，确保生产流程顺序执行。
*   **跨服务协同**: 与用户管理服务集成，实现任务指派与权限控制。
*   **状态流转控制**: 严格的状态机逻辑，管理任务从 PENDING 到 COMPLETED 的流转。

## 2. 技术栈 (Tech Stack)

| 组件 | 技术选型 | 版本 | 说明 |
| :--- | :--- | :--- | :--- |
| **语言** | Java | 17 (LTS) | 核心开发语言 |
| **框架** | Spring Boot | 3.2.0 | 应用框架 |
| **持久层** | Spring Data JPA | - | ORM 框架 (Hibernate 实现) |
| **数据库 (Dev)** | H2 Database | - | 内存数据库，用于开发和快速测试 |
| **数据库 (Prod)** | PostgreSQL | (Planned) | 生产环境推荐数据库，支持空间扩展 (PostGIS) |
| **安全** | Spring Security | - | 安全认证与授权 |
| **认证** | JWT (JSON Web Token) | 0.11.5 | 无状态身份验证 |
| **API 文档** | SpringDoc OpenAPI | 2.2.0 | 自动生成 Swagger UI 文档 |
| **构建工具** | Maven | 3.9+ | 依赖管理和构建 |

## 3. 系统架构设计

### 3.1 分层架构
系统自上而下分为四层：

1.  **Controller Layer (API 层)**:
    *   处理 HTTP 请求与响应。
    *   负责参数校验和 API 路由。
    *   组件: `TaskController`

2.  **Service Layer (业务逻辑层)**:
    *   封装核心业务逻辑。
    *   处理事务 (Transactional)。
    *   实现任务状态流转规则和依赖检查。
    *   组件: `TaskServiceImpl`

3.  **Repository Layer (数据访问层)**:
    *   抽象数据库操作。
    *   基于 Spring Data JPA 接口，提供 CRUD 和自定义查询。
    *   组件: `TaskRepository`, `TaskDependencyRepository`

4.  **Model Layer (领域模型层)**:
    *   定义实体类和枚举。
    *   组件: `Task`, `TaskDependency`, `TaskStatus`, `TaskType`

### 3.2 数据模型设计 (Schema)

#### 3.2.1 Tasks Table (`tasks`)
核心任务表，存储任务基本信息。

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PK | 主键 |
| `name` | VARCHAR | NOT NULL | 任务名称 |
| `type` | VARCHAR | NOT NULL | 任务类型 (Enum) |
| `status` | VARCHAR | NOT NULL | 任务状态 (Enum) |
| `priority` | INT | - | 优先级 |
| `assignee_id` | BIGINT | - | 负责人 ID (Ref User Service) |
| `progress` | INT | Default 0 | 进度 (0-100) |
| `parent_task_id` | UUID | - | 父任务 ID (支持子任务) |
| `input_params` | TEXT | - | JSON 格式输入参数 |
| `output_results` | TEXT | - | JSON 格式输出结果 |
| `created_at` | TIMESTAMP | - | 创建时间 |
| `due_at` | TIMESTAMP | - | 截止时间 |

#### 3.2.2 Task Dependencies Table (`task_dependencies`)
任务依赖关系表，实现多对多自关联。

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PK | 主键 |
| `task_id` | UUID | FK | 后续任务 ID |
| `dependency_task_id` | UUID | FK | 前置任务 ID |

*Constraint*: `Unique (task_id, dependency_task_id)` 防止重复依赖。

## 4. 安全设计 (Security)

### 4.1 JWT 认证
*   服务复用了用户管理系统的 JWT 密钥配置。
*   **Filter 机制**: `JwtAuthenticationFilter` 拦截所有请求，解析 Header 中的 `Bearer Token`。
*   **验证逻辑**: 验证签名有效性及过期时间。
*   **上下文注入**: 验证通过后，将用户信息注入 Spring Security Context，供 Controller 层使用。

### 4.2 跨服务信任
*   任务管理服务与用户管理服务共享 JWT Secret，实现了单点登录 (SSO) 的基础。
*   用户在用户服务登录获取 Token 后，可直接携带该 Token 访问任务服务 API。

## 5. 关键业务流程

### 5.1 任务创建
1.  接收 `POST` 请求。
2.  初始化状态为 `PENDING`。
3.  记录 `createdAt` 时间戳。
4.  持久化到数据库。

### 5.2 任务依赖添加
1.  接收依赖请求 (Task A depends on Task B)。
2.  校验 A 和 B 是否存在。
3.  校验 A != B (防止自依赖)。
4.  (未来扩展) 校验是否存在循环依赖 (Cycle Detection)。
5.  保存依赖关系。

## 6. 扩展性规划

*   **消息队列集成**: 引入 RabbitMQ/Kafka，当任务状态变更时发布事件，供其他服务订阅（如通知服务）。
*   **空间数据库**: 迁移至 PostgreSQL + PostGIS，支持基于地理位置的任务索引和查询（如“查询某区域内的所有测绘任务”）。
*   **工作流引擎**: 对于复杂的生产流程，考虑集成 Activiti 或 Camunda 引擎。
