# 任务模型升级：数据库迁移方案

## 1. 目标

- 为任务表新增任务类别（category）、项目归属（project_id）、自检关联（self_check_for_task_id）、计划完成时间（planned_due_at）。
- 为项目补充创建人及创建部门字段（created_by_name、created_department_id、created_department_name）。
- 新增任务分配表（task_assignments），支持多操作员/多质检员并行。
- 保证历史数据在升级后可继续查询与使用。

## 2. 迁移脚本

task-management-service 使用 Flyway 迁移脚本（PostgreSQL 兼容）：
- `task-management-service/src/main/resources/db/migration/V1__init_task_schema.sql`
  - 初始化（若表不存在则创建）：tasks / task_dependencies / task_assignments
  - 建立必要索引与外键约束
- `task-management-service/src/main/resources/db/migration/V2__upgrade_task_model.sql`
  - 增量升级：新增字段与索引
  - 回填 planned_due_at（从历史 due_at 迁移）
  - 回填 category（基于 type 的缺省映射）
  - 回填 project_id（基于 parent_task_id 递归定位顶层项目）
- `task-management-service/src/main/resources/db/migration/V3__add_project_creator_fields.sql`
  - 新增项目创建人/创建部门字段
  - 将历史 department_id 回填至 created_department_id 以保留历史创建部门记录

## 3. 历史数据映射规则

- 若 `type=BRIDGE_REMOVAL_BATCH`：`category=PROJECT`，`project_id=null`
- 其他任务：默认 `category=OPERATION_TASK`，并根据层级计算 `project_id`
- `planned_due_at`：若为空，则从历史 `due_at` 回填
- `created_department_id`：历史数据以 `department_id` 回填（仅能保留创建时部门 ID）

## 4. 注意事项

- 生产环境建议启用 Flyway 并将 Hibernate DDL 设置为 validate，避免运行时自动改表。
- 若历史数据中存在跨部门或缺失 department_id 的任务，升级后部门隔离校验可能导致读取被拒绝，需要先补齐 department_id 再切换到强隔离策略。
