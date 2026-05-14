# 任务管理服务 UML 类图 (Task Management Service Class Diagram)

本文档展示了任务管理服务的核心类结构及其关系。

```mermaid
classDiagram
    %% Controller Layer
    class TaskController {
        -TaskService taskService
        +createTask(Task task) ResponseEntity~Task~ "创建任务"
        +getAllTasks(int page, int size) ResponseEntity~Page~Task~~ "分页获取任务"
        +getTaskById(UUID id) ResponseEntity~Task~ "获取任务详情"
        +updateTask(UUID id, Task taskDetails) ResponseEntity~Task~ "更新任务"
        +deleteTask(UUID id) ResponseEntity~Void~ "删除任务"
        +updateTaskStatus(UUID id, TaskStatus status) ResponseEntity~Task~ "更新状态"
        +assignTask(UUID id, Long userId) ResponseEntity~Task~ "指派任务"
        +getSubTasks(UUID id) ResponseEntity~List~Task~~ "获取子任务"
        +addDependency(UUID id, UUID dependencyTaskId) ResponseEntity~Void~ "添加依赖"
        +countCompletedTasksByAssignee(Long assigneeId) ResponseEntity~Long~ "统计完成任务"
    }

    %% Service Layer
    class TaskService {
        <<interface>>
        +createTask(Task task) Task "创建任务业务逻辑"
        +getTaskById(UUID id) Task "ID查询业务逻辑"
        +getAllTasks(Pageable pageable) Page~Task~ "分页查询业务逻辑"
        +updateTask(UUID id, Task taskDetails) Task "更新业务逻辑"
        +deleteTask(UUID id) void "删除业务逻辑"
        +updateTaskStatus(UUID id, TaskStatus status) Task "状态变更逻辑"
        +assignTask(UUID id, Long userId) Task "指派逻辑"
        +getSubTasks(UUID parentId) List~Task~ "子任务查询逻辑"
        +addDependency(UUID taskId, UUID dependencyTaskId) void "依赖添加逻辑"
        +countCompletedTasksByAssignee(Long assigneeId) long "按负责人统计完成任务"
    }

    class TaskServiceImpl {
        -TaskRepository taskRepository
        -TaskDependencyRepository taskDependencyRepository
    }

    %% Repository Layer
    class TaskRepository {
        <<interface>>
        +findByAssigneeId(Long assigneeId) List~Task~ "按负责人查询"
        +findByStatus(TaskStatus status) List~Task~ "按状态查询"
        +findByParentTaskId(UUID parentTaskId) List~Task~ "按父任务查询"
        +countByAssigneeIdAndStatus(Long assigneeId, TaskStatus status) long "按负责人和状态计数"
    }

    class TaskDependencyRepository {
        <<interface>>
        +findByTaskId(UUID taskId) List~TaskDependency~ "查询任务依赖"
        +findByDependencyTaskId(UUID dependencyTaskId) List~TaskDependency~ "查询被依赖任务"
    }

    %% Model Layer
    class Task {
        -UUID id "任务ID"
        -String name "任务名称"
        -TaskType type "任务类型"
        -TaskStatus status "任务状态"
        -Integer priority "优先级"
        -Long assigneeId "负责人ID"
        -Integer progress "进度"
        -String inputParams "输入参数"
        -String outputResults "输出结果"
        -UUID parentTaskId "父任务ID"
        -ZonedDateTime createdAt "创建时间"
        -ZonedDateTime dueAt "截止时间"
        +onCreate() void "持久化前钩子"
    }

    class TaskDependency {
        -UUID id "依赖关系ID"
        -UUID taskId "当前任务ID"
        -UUID dependencyTaskId "前置任务ID"
    }

    class TaskStatus {
        <<enumeration>>
        PENDING "待处理"
        ASSIGNED "已指派"
        RECEIVED "已接收"
        IN_PROGRESS "进行中"
        PAUSED "已暂停"
        COMPLETED "已完成"
        FAILED "已失败"
    }

    class TaskType {
        <<enumeration>>
        DATA_COLLECTION "数据采集"
        DATA_PROCESSING "数据处理"
        QUALITY_CHECK "质量检查"
        MAP_COMPILATION "地图编制"
    }

    %% Relationships
    TaskController ..> TaskService : Uses "调用"
    TaskServiceImpl ..|> TaskService : Implements "实现"
    TaskServiceImpl ..> TaskRepository : Uses "调用"
    TaskServiceImpl ..> TaskDependencyRepository : Uses "调用"
    TaskRepository --|> JpaRepository : Extends "继承"
    TaskDependencyRepository --|> JpaRepository : Extends "继承"

    Task "1" *-- "1" TaskStatus : Has "包含"
    Task "1" *-- "1" TaskType : Has "包含"
    TaskDependency "0..*" --> "1" Task : Links "关联"
```

## 说明 (Notes)

1.  **分层架构 (Layered Architecture)**:
    *   **Controller**: 处理 HTTP 请求，调用 Service 层。
    *   **Service**: 包含核心业务逻辑（如状态流转、依赖检查）。
    *   **Repository**: 负责与数据库交互。

2.  **核心实体 (Core Entities)**:
    *   **Task**: 核心业务对象，包含状态、类型、进度等信息。
    *   **TaskDependency**: 专门用于管理任务间的 DAG 依赖关系。

3.  **枚举 (Enums)**:
    *   **TaskStatus**: 定义了严格的任务生命周期状态。
    *   **TaskType**: 区分不同的生产任务类型。
