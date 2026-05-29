# 生产任务管理模型

> 口径来源：以《需求说明规格书》v1.20 为唯一基准。本文件仅做实现细化与架构解释，不得改变需求规格书中的状态机定义、职责边界、安全约束与可靠性规则。
>
> 最新对照：已对齐《需求说明规格书》2026-05-28 v1.20（任务类型注册审批机制；resultViewUrl 语义明确；回传字段配置功能；BRS 相关类型禁止自动注册）。

## 一、模型总览

```
┌────────────────────────────────────────────────────────────────┐
│                   task-management-service                       │
│                      公共层模型                                 │
│                                                                │
│  Task ◄──────── TaskAssignment (多对多)                        │
│    │                │                                          │
│    │           TaskAssignmentId (复合主键)                      │
│    │                │                                          │
│    ├───── TaskDependency (前置/后置关系)                        │
│    ├───── TaskAttachment (备注附件)                             │
│    │                                                           │
│    ├─ TaskStatus (通用任务状态枚举，10 值，所有节点)              │
│    ├─ WorkflowStatus (项目验收归档阶段，3 值，仅根项目 PROJECT)   │
│    ├─ ProjectTypeDefinition (项目类型字典，服务领域)            │
│    ├─ TaskTypeDefinition (任务类型字典，技术工序)              │
│  ├─ TaskTypeGroup (任务类型分组字典)                         │
│  ├─ MeasurementUnitDefinition (计量单位字典，基本/派生两级)    │
│  ├─ CompositionMode (同质/异质枚举)                          │
│  ├─ TaskCategory (任务分类枚举)                              │
│  ├─ CallbackField (回传字段枚举，10值，6必选+4可选)             │
│  └─ TaskTypeRegistration (任务类型注册申请，含审批流程)       │
│                                                                │
│  ExternalSystemRegistration (外部系统注册表，含 callbackFields/resultQueryPath)                    │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  bridge-removal-service 作为外部系统对接                        │
│  （业务模型不在 task-management-service 中）                    │
│                                                                │
│  交互方式：                                                    │
│  - bridge → task-management: 注册系统、同步状态/进度           │
│  - task-management → bridge: 触发执行（任务分发）              │
│  - 桥梁去除具体操作（定位/掩膜/修复/合并）                     │
│    全部由 bridge-removal-service 独立处理                      │
└────────────────────────────────────────────────────────────────┘

模型关系：
- 公共层模型：Task、TaskAssignment、TaskDependency、TaskAttachment、
  ProjectTypeDefinition、TaskTypeDefinition、TaskTypeGroup、
  MeasurementUnitDefinition —— 持久化到数据库
- 外部系统模型：InpaintJob、OverlapFixResult 等 —— 由 bridge-removal-service 自行管理
- 两个系统不共享数据库，通过 REST API 交互
```

### 当前实施落地说明（2026-04-30）

- 已落地模型：ProjectTypeDefinition、MeasurementUnitDefinition（含基本/派生两级 + 换算量）、CompositionMode、扩展后的 Task（workload/workloadUnit/weight/compositionMode/depthLevel/attachmentCount/remarks）
- 已落地接口：项目类型管理接口、计量单位管理接口（含基本/派生分类、权限控制、换算量校验）
- 已落地迁移：V1~V13 迁移脚本
- 已落地规则：父节点保留 type、weight 默认值 1、全同全异校验、同质/异质双公式进度重算、深度限制校验、基本计量单位仅 system:manager 可管理、派生单位换算量约束、基本单位删除级联校验
- 待落地模型：TaskTypeDefinition、TaskTypeGroup、TaskAttachment 表
- 待落地规则：项目/任务类型独立字典、子项目使用项目类型分类、任务类型非独占注册、项目下达工作量必填、工作量 ≤0 校验

---

## 二、核心实体：Task

### 数据库表：`tasks`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK, 自动生成 | 主键 |
| `name` | VARCHAR(255) | NOT NULL | 任务名称 |
| `type` | VARCHAR(64) | NOT NULL | 类型编码。PROJECT/PHASE 引用 `project_type_definitions.code`；OPERATION_TASK 引用 `task_type_definitions.code`；父节点保留类型，不因拥有子节点而清空 |
| `category` | VARCHAR(32) | NOT NULL, 默认 `OPERATION_TASK` | 任务分类（PROJECT/PHASE/OPERATION_TASK）。QA_TASK 已移除（v1.8）；SELF_CHECK_TASK 已废弃（v1.4） |
| `status` | VARCHAR(32) | NOT NULL, 默认 `PENDING` | 任务状态（TaskStatus 枚举，10 值）：PENDING/ASSIGNED/RECEIVED/IN_PROGRESS/PAUSED/SUBMITTED_FOR_QA/QA_COMPLETING/QA_COMPLETED/COMPLETED/FAILED |
| `workflow_status` | VARCHAR(32) | 可空 | 项目验收归档阶段（WorkflowStatus 枚举，3 值），仅根项目 PROJECT 使用 |
| `composition_mode` | VARCHAR(16) | 可空 | 直接子节点结构类型缓存：`HOMOGENEOUS` / `HETEROGENEOUS`；叶子节点为空 |
| `priority` | INTEGER | 可空 | 优先级 |
| `assigner_id` | UUID | 可空 | 指派人 ID（执行指派操作的用户）。撤销指派时校验此字段 |
| `assignee_id` | UUID | 可空 | 被指派人 ID（指向用户服务） |
| `previous_assignee_id` | UUID | 可空 | 质检员接收前的原操作员 ID（v1.18 新增）。质检员接收时将原 assigneeId 保存到此字段；质检不通过时用于恢复 assigneeId；质检通过或质检不通过完成恢复后清空；再次质检接收时覆盖写入 |
| `qa_department_id` | VARCHAR(64) | 可空 | 质检部门 ID（创建项目/任务时指定，从具有 quality:check 权限的部门中选择） |
| `qa_assignee_id` | UUID | 可空 | 质检人员 ID（从质检部门中具有 quality:check 权限的用户中选择；不指定时该部门所有 quality:check 用户均可执行质检） |
| `project_id` | UUID | 可空, FK → tasks(id) CASCADE | 所属项目 ID（自引用） |
| `progress` | INTEGER | 默认 0 | 进度百分比（0-100）；非叶子节点由子节点汇聚，不可直接修改 |
| `workload` | DOUBLE | 可空 | 工作量；项目下达时必填；任务节点可选填。同质父节点未填写时由直接子节点动态汇总；≤0 时报错 |
| `workload_unit` | VARCHAR(32) | 可空 | 工作量单位快照。创建项目/任务时由用户选择计量单位后写入，保留历史快照用于统计与审计 |
| `status_workloads` | TEXT | 可空 | 叶子节点各状态工作量分布（JSON）。格式：{"PENDING":0,"ASSIGNED":0,"RECEIVED":100,"IN_PROGRESS":0,"SUBMITTED_FOR_QA":0,"QA_COMPLETING":0,"QA_COMPLETED":0}。各值之和必须等于 workload |
| `in_progress_weight` | DOUBLE | 默认 0.95 | IN\_PROGRESS 状态权重。项目级设置默认值（默认 0.95），子任务继承项目默认值但可单独覆盖。SUBMITTED\_FOR\_QA 固定 0.95，QA\_COMPLETED 及之后固定 1.0 |
| `in_progress_completed_workload` | DOUBLE | 默认 0 | IN\_PROGRESS 状态下已完成但尚未提交质检的工作量（v1.17 新增）。操作员累计输入完成量时此值累加；提交质检时清零；撤销质检时保留不清零，再次输入为增量累加（累加结果 ≤ 当前 IN_PROGRESS 工作量）；质检不通过时清零（返工从头输入），assigneeId 恢复原操作员（previousAssigneeId）。进度公式中使用此值乘以 in\_progress\_weight 参与计算 |
| `weight` | DOUBLE | 默认 `1` | 子节点权重，取值范围 `0.01~100`（支持小数，最多两位） |
| `remarks` | TEXT | 可空 | 项目备注，下达人填写工作范围、质量要求、交付标准、注意事项等 |
| `attachment_count` | INTEGER | 默认 0 | 附件数量缓存（冗余字段，用于列表快速展示） |
| `input_params` | TEXT | 可空 | 输入参数（JSON，公共层不解析内容） |
| `output_results` | TEXT | 可空 | 输出结果（JSON，公共层不解析内容） |
| `parent_task_id` | UUID | 可空, FK → tasks(id) CASCADE | 父节点 ID（自引用） |
| `department_id` | VARCHAR(64) | NOT NULL | 负责部门 ID（项目创建时必填） |
| `created_by_name` | VARCHAR(128) | 可空 | 创建人姓名 |
| `created_department_id` | VARCHAR(64) | 可空 | 创建人部门 ID |
| `created_department_name` | VARCHAR(255) | 可空 | 创建人部门名称 |
| `external_system` | VARCHAR | 可空 | 外部系统标识（如 `bridge-removal-app`） |
| `external_task_id` | VARCHAR | 可空 | 外部系统任务 ID |
| `external_url` | VARCHAR | 可空 | 外部系统链接（指向外部系统的任务页面） |
| `created_at` | TIMESTAMPTZ | 自动填充 | 创建时间 |
| `started_at` | TIMESTAMPTZ | 可空 | 开始时间 |
| `received_at` | TIMESTAMPTZ | 可空 | 接收时间（接收操作时记录） |
| `undo_requested_at` | TIMESTAMPTZ | 可空 | 撤销接收申请时间（接收人申请撤销时记录，审批后清空） |
| `due_at` | TIMESTAMPTZ | 可空 | 截止时间 |
| `planned_due_at` | TIMESTAMPTZ | 可空 | 计划截止时间 |
| `completed_at` | TIMESTAMPTZ | 可空 | 完成时间 |
| `version` | INTEGER | @Version | 乐观锁版本号 |

### 索引

| 索引名 | 字段 | 类型 |
|--------|------|------|
| PK | `id` | 主键 |
| `ux_tasks_self_check_for_task_id` | `self_check_for_task_id` | 唯一（WHERE NOT NULL） |
| `ix_tasks_parent_task_id` | `parent_task_id` | 普通 |
| `ix_tasks_project_id` | `project_id` | 普通 |
| `ix_tasks_department_id` | `department_id` | 普通 |
| `ix_tasks_assignee_id` | `assignee_id` | 普通 |
| `ix_tasks_assigner_id` | `assigner_id` | 普通 |
| `ix_tasks_qa_department_id` | `qa_department_id` | 普通 |
| `ix_tasks_type` | `type` | 普通 |
| `ix_tasks_category` | `category` | 普通 |

### 自引用关系

```
项目 P (PROJECT, type=工程测量)
 ├── 子项目 Phase1 (PHASE, type=工程测量)       ← parent_task_id → P
 │    ├── 任务 A (OPERATION_TASK, type=外业调绘) ← parent_task_id → Phase1
 │    └── 任务 B (OPERATION_TASK, type=外业调绘) ← parent_task_id → Phase1
 ├── 子项目 Phase2 (PHASE, type=工程测量)       ← parent_task_id → P
 │    ├── 任务 C (OPERATION_TASK, type=内业解译) ← parent_task_id → Phase2
 │    └── 任务 D (OPERATION_TASK, type=内业解译) ← parent_task_id → Phase2
```

- `parent_task_id`：直接父子关系，CASCADE 删除。最深 5 层（默认，管理员可在后台调整）
- `project_id`：项目归属，通过递归向上查找 PROJECT 类型的祖先得出
- 任意节点均可拥有直接子节点，是否为叶子节点由是否存在直接子节点判定
- 同一父节点的直接子节点类型必须满足"全相同"或"全不同"，据此派生 `composition_mode`
- 兄弟项目/子项目/任务的子节点类型允许相同，不强制同类型归集到同一目录
- 项目下可选择增加子项目（PHASE）或任务（OPERATION_TASK）；子项目和顶层项目使用相同的项目类型分类
- 质检由指定质检部门/人员执行，不再自动生成自检子节点
- **QA_TASK 已移除（v1.8）**：质检不再创建独立任务，改为源任务状态流转。质检通过/退回直接操作源任务

### 类型编码校验规则

对应需求规格书 2.1.2.1、2.1.2.5。

| 节点分类 | type 引用来源 | 校验 |
|---------|--------------|------|
| PROJECT | `project_type_definitions.code` | 必须存在且启用 |
| PHASE | `project_type_definitions.code` | 必须存在且启用 |
| OPERATION_TASK | `task_type_definitions.code` | 必须存在且启用 |
| ~~QA_TASK~~ | ~~已移除（v1.8）~~ | ~~不再创建 QA_TASK~~ |

### 进度逐层级汇聚

子节点进度或工作量变更时，系统自动沿 `parent_task_id` 链向上递归重算。**所有层级节点（任务→子项目→项目）统一参与同质/异质计算**。对应需求规格书 2.1.4、3.3。

1. 找到变更节点的直接父级，查询其所有直接子节点并判定 `composition_mode`
2. 若父级为 `HOMOGENEOUS`，按公式 `父进度 = Σ(子进度 × 子权重 × 子工作量_基本单位) / Σ(子权重 × 子工作量_基本单位)` 计算，其中 `子工作量_基本单位 = 子工作量 × 换算量`（基本单位换算量为 1，派生单位按 conversion_factor 换算）
3. 若父级为 `HETEROGENEOUS`，按公式 `父进度 = Σ(子进度 × 子权重) / Σ(子权重)` 计算
4. 同质父节点若已填写 `workload`，校验直接子节点工作量（换算为基本单位后）之和必须等于父节点工作量（换算为基本单位后）；未填写则由子节点汇总回写父节点（汇总值以基本单位为准）
5. 同质任务工作量不一致时必须提示差额，提示内容至少包含子节点合计、父节点工作量、差额和建议调整方向；工作量为空或 ≤0 时创建/更新报错
6. 若父级进度或工作量有变化，保存后继续沿 `parent_task_id` 向上重算
7. 递归深度上限与树最大深度一致，防止循环引用

**补充约束**：
- 叶子节点采用瀑布式工作量流转模型（详见下方"叶子节点工作量流转与进度计算"）
- 非叶子节点的状态和进度不能直接修改，由子节点驱动
- `weight` 取值范围 `0.01~100`（支持小数，最多两位），未设置按默认值 `1`
- 同质节点（含项目/子项目/任务）的直接子节点若设置为不同权重，系统在前端保存前给出警告，但不强制阻断

**完整链路示意**（对应需求规格书 3.3）：

```
项目 P（PROJECT, type=工程测量, 单位=平方公里, workload=100, compMode=HOMOGENEOUS）
 ├── 子项目 Phase1（PHASE, type=工程测量, 单位=平方公里, workload=60, 进度=80）
 │    ├── 任务 A（OPERATION_TASK, type=外业调绘, 单位=平方公里, weight=1, workload=30, 进度=90）
 │    └── 任务 B（OPERATION_TASK, type=外业调绘, 单位=平方公里, weight=1, workload=30, 进度=70）
 └── 子项目 Phase2（PHASE, type=工程测量, 单位=平方公里, workload=40, 进度=50）
      ├── 任务 C（OPERATION_TASK, type=外业调绘, 单位=平方公里, weight=1, workload=20, 进度=60）
      └── 任务 D（OPERATION_TASK, type=外业调绘, 单位=平方公里, weight=1, workload=20, 进度=40）

Phase1 进度 = (90×1×30 + 70×1×30) / (1×30 + 1×30) = 80
Phase2 进度 = (60×1×20 + 40×1×20) / (1×20 + 1×20) = 50
P 进度     = (80×1×60 + 50×1×40) / (1×60 + 1×40) = 68
工作量校验（基本单位）：Phase1(60) + Phase2(40) = P(100) ✓

── 含派生单位的示例 ──

项目 P（PROJECT, type=工程测量, 基本单位=米, workload=100000, compMode=HOMOGENEOUS）
 ├── 任务 A（单位=公里, 换算量=1000, weight=1, workload=60, 进度=90）
 └── 任务 B（单位=米, 换算量=1, weight=1, workload=40000, 进度=70）

A 工作量_基本单位 = 60 × 1000 = 60000
B 工作量_基本单位 = 40000 × 1 = 40000
P 进度 = (90×1×60000 + 70×1×40000) / (1×60000 + 1×40000) = 82
工作量校验（基本单位）：60000 + 40000 = 100000 ✓（不等于时必须提示差额；空/≤0 时报错）
```

### 叶子节点工作量流转与进度计算

对应需求规格书 2.1.7。叶子节点（无子任务的节点）采用**瀑布式工作量流转模型**。

**状态工作量流转**：

```
总工作量 W
  ↓ 系统自动（创建时全部量在 PENDING）
PENDING → ASSIGNED → RECEIVED
                       ↓ 操作员设值 IN_PROGRESS 量（增大值从 RECEIVED 扣减）
                    IN_PROGRESS
                       ↓ 操作员累计输入完成量（IN_PROGRESS 量逐次减少）
                       ↓ 完成量 = 总工作量时，点击"提交质检"
                    SUBMITTED_FOR_QA（待质检，全部工作量从 IN_PROGRESS 搬入）
                    ├─ 操作员"撤销" → IN_PROGRESS（工作量退回）
                    └─ 质检员"接收" → QA_COMPLETING（质检中，工作量搬入）
                                         ├─ 质检员"通过" → QA_COMPLETED（工作量搬入）
                                         └─ 质检员"不通过" → IN_PROGRESS（工作量退回，清零完成量，assigneeId 恢复原操作员）
```

| 规则 | 说明 |
|------|------|
| 初始指派 | 叶子节点创建时，总工作量全部置于 PENDING 状态 |
| 系统自动流转 | PENDING → ASSIGNED → RECEIVED 由系统流程自动完成，工作量随状态自动搬移 |
| 操作员录入 | 操作员在 IN_PROGRESS 状态累计输入完成量，`in_progress_completed_workload` 逐次累加；IN_PROGRESS 量逐次减少；完成量 = 总工作量时，"输入完成量"按钮变为"提交质检"按钮 |
| 提交质检 | 点击"提交质检"后，全部工作量从 IN_PROGRESS 搬移到 SUBMITTED_FOR_QA，`in_progress_completed_workload` 清零，任务状态 → SUBMITTED_FOR_QA（待质检） |
| 撤销质检 | 操作员点击"撤销"（需 assigneeId + `task:execute` 权限），工作量从 SUBMITTED_FOR_QA 退回 IN_PROGRESS，**保留已填完成量**（`in_progress_completed_workload` 不清零），再次输入为增量累加（累加结果 ≤ 当前 IN_PROGRESS 工作量）；仅 SUBMITTED_FOR_QA 状态可撤销 |
| 接收质检 | 质检员点击"接收"（需 `quality:check` 权限），工作量从 SUBMITTED_FOR_QA 搬移到 QA_COMPLETING，assigneeId 转为质检员，原操作员 ID 保存到 `previous_assignee_id` |
| 质检通过 | 质检员点击"通过"（需 `quality:check` 权限，QA_COMPLETING 状态），工作量从 QA_COMPLETING 搬移到 QA_COMPLETED，清空 `previous_assignee_id` |
| 质检不通过 | 质检员点击"不通过"（需 `quality:check` 权限，QA_COMPLETING 状态），工作量从 QA_COMPLETING 退回 IN_PROGRESS，**清零已填完成量**（`in_progress_completed_workload` 清零，返工从头输入），`assigneeId` 恢复原操作员（`previous_assignee_id`），恢复后清空 `previous_assignee_id` |
| PAUSED 处理 | 暂停不是回退，工作量留在当前状态不动 |
| FAILED 处理 | `FAILED` 仅用于未完成阶段异常中止，不作为质检不通过路径；`SUBMITTED_FOR_QA` 或 `QA_COMPLETING` 如发生异常，可由具备相应管理权限的用户退回 `IN_PROGRESS` 重新处理；`QA_COMPLETED` 是稳定完成态，不允许直接置为 `FAILED` 或退回 `IN_PROGRESS`，发现问题需新建返修任务并关联原任务 |
| 守恒约束 | 各状态工作量之和必须等于总工作量，瀑布扣减天然保证守恒 |
| 进度驱动 | 叶子节点进度由 `in_progress_completed_workload × in_progress_weight` 及各状态工作量×权重自动计算，不可直接修改 |
| 外部系统映射 | 外部系统推送总体进度时，进度仅用于生产过程展示：已完成比例映射为 SUBMITTED_FOR_QA 工作量，其余量留在 RECEIVED；`in_progress_completed_workload = 0`。外部系统推送 COMPLETED 时，TMS 将任务置为 SUBMITTED_FOR_QA，必须由 TMS 质检员接收并通过后才进入 QA_COMPLETED |

**叶子节点进度计算**：

```
叶子进度 = (in_progress_completed_workload × w_ip + SUBMITTED_FOR_QA量 × 0.95 + QA_COMPLETING量 × 0.95 + QA_COMPLETED量 × 1.0) / 总工作量
```

其中 `in_progress_completed_workload` 即 IN_PROGRESS 状态下已完成但尚未提交质检的工作量。IN_PROGRESS 中未完成部分权重为 0，不参与进度计算。PENDING / ASSIGNED / RECEIVED 状态工作量权重均为 0，公式中省略。

| 状态 | 权重 | 说明 |
|------|------|------|
| PENDING / ASSIGNED / RECEIVED | 0 | 尚未开始，无实际工作产出 |
| IN_PROGRESS（已完成部分） | w_ip（默认 0.95，可配置） | `in_progress_completed_workload` 乘以权重参与进度计算 |
| IN_PROGRESS（未完成部分） | 0 | `IN_PROGRESS量 - in_progress_completed_workload`，权重为 0，不参与进度计算 |
| SUBMITTED_FOR_QA | 0.95 | 已完成待质检确认 |
| QA_COMPLETING | 0.95 | 质检进行中，与提交质检同等权重 |
| QA_COMPLETED 及之后 | 1.0 | 已确认完成 |

**非叶子节点进度汇聚**：仍按同质/异质公式由子节点进度汇聚，但非叶子节点的进度不能直接修改。

**管理看板彩色进度条**：彩色进度条仅用于管理看板（无泳道的视图），不在任务看板的任务卡上显示。非叶子节点显示按状态分布着色的进度条，颜色段宽度按节点结构类型计算：同质节点按工作量比例，异质节点按直接子节点权重比例。点击显示各状态叶子节点数量和工作量分布。顶层项目且 QA_COMPLETED 叶子数=叶子总数时显示"待验收"标签。

| 颜色 | 包含状态 | 含义 |
|------|--------|------|
| 灰色 | PENDING | 未指派 |
| 红色 | ASSIGNED + RECEIVED | 待接收 |
| 浅绿色 | IN_PROGRESS（未完成部分） | 进行中（未完成） |
| 深绿色 | IN_PROGRESS（已完成部分，即 `in_progress_completed_workload`） | 可提交质检 |
| 青色 | SUBMITTED_FOR_QA + QA_COMPLETING | 待质检 |
| 蓝色 | QA_COMPLETED + COMPLETED + ARCHIVED | 已完成 |

IN_PROGRESS 绿色段细分为两个子段：深绿色（已完成部分，标签"可提交质检"）和浅绿色（未完成部分，标签"进行中"）。同质节点按工作量基本单位计算：深绿色宽度 = `Σ(叶子.in_progress_completed_workload_基本单位) / 父总工作量_基本单位 × 100%`，浅绿色宽度 = `Σ(叶子.IN_PROGRESS未完成工作量_基本单位) / 父总工作量_基本单位 × 100%`。异质节点按直接子节点权重计算：颜色段宽度 = `Σ(直接子节点该颜色段比例 × 直接子节点weight) / Σ(直接子节点weight)`。

### 任务看板交互

对应需求规格书 2.1.8。任务看板以泳道呈现不同状态，任务按 statusWorkloads 分布在对应的状态泳道中。状态变更仅通过操作按钮触发，不支持拖拽改变状态。

**a. 多泳道分布规则**

叶子节点：叶子任务在每个有工作量的状态泳道中显示一张卡，不显示任务名称，显示该状态的工作量及计量单位。操作按钮仅在主状态（task.status）泳道的卡上显示，其他泳道的卡只显示工作量。

非叶子节点：递归所有子节点的 statusWorkloads 按状态聚合。同质模式按工作量基本单位直接汇总；异质模式按直接子节点权重比例聚合（某状态比例 = Σ(直接子节点该状态比例 × 直接子节点weight) / Σ(直接子节点weight)），避免不同计量单位直接相加。非叶子节点所有泳道的卡均不显示操作按钮。

**b. 操作按钮与权限矩阵**

| 当前状态 | 按钮 | 所需权限 | 操作结果 |
|---------|------|---------|---------|
| PENDING | 接收 | `task:execute` + 满足接收规则 | 全部工作量 PENDING/ASSIGNED→RECEIVED |
| PENDING / ASSIGNED | 指派 | `department:manager` 或创建人+`project:create` | 弹出指派表单。`department:manager`→部门中具有 `project:create` 的用户；`project:create`→部门中所有用户 |
| PENDING / ASSIGNED | 分解 | `department:manager` 或创建人+`project:create`（PROJECT 类型）或创建人+`task:create`/`project:create`（非 PROJECT 类型） | 弹出分解流程，批量创建同质子任务 |
| RECEIVED | 指派 | `department:manager` 或 `project:create` | 弹出指派表单，前端弹出二次确认，后端记录 REASSIGN 日志，工作量从 RECEIVED→ASSIGNED |
| RECEIVED | 分解 | `department:manager` 或 `project:create`（PROJECT 类型）或 `task:create`/`project:create`（非 PROJECT 类型） | 弹出分解流程 |
| ASSIGNED（重新指派） | 指派 | `department:manager`（被指派人非 department:manager）或创建人 | 允许 ASSIGNED 状态下重新指派，但被指派人若具有 department:manager 则拒绝并提示使用分解 |
| ASSIGNED | 撤销指派 | 指派人（assignerId） | 被指派人未接收前可撤销，清空 assigneeId 和 assignerId，→PENDING |
| RECEIVED | 申请撤销 | `task:execute`（接收人） | 接收人提交撤销申请，等待指派人审批 |
| RECEIVED | 同意撤销 | 指派人（assignerId） | 审批通过后清空负责人和指派人，→PENDING |
| RECEIVED | 开始处理 | `task:execute` | →IN_PROGRESS |
| IN_PROGRESS | 输入完成量 | `task:execute` | 弹出输入框，完成量在 IN_PROGRESS 中累计记录 |
| SUBMITTED_FOR_QA | 撤销质检 | `task:execute` | 任务状态 → IN_PROGRESS，工作量从 SUBMITTED_FOR_QA 退回 IN_PROGRESS，保留已填完成量（增量累加）；仅 SUBMITTED_FOR_QA 状态可撤销 |
| SUBMITTED_FOR_QA | 接收质检 | `quality:check` | 任务状态 → QA_COMPLETING，工作量从 SUBMITTED_FOR_QA 搬移到 QA_COMPLETING，assigneeId 转为质检员，原操作员 ID 保存到 previous_assignee_id |
| QA_COMPLETING | 质检通过 | `quality:check` | 任务状态 → QA_COMPLETED，工作量从 QA_COMPLETING 搬移到 QA_COMPLETED |
| QA_COMPLETING | 质检不通过 | `quality:check` | 任务状态 → IN_PROGRESS，工作量从 QA_COMPLETING 退回 IN_PROGRESS，清零已填完成量，assigneeId 恢复原操作员（previous_assignee_id） |

> **接收按钮可见性规则**（按节点类型区分）：
> - **PROJECT 类型叶子节点**：指定了负责人（assigneeId 非空）且当前用户为负责人本人，显示"接收"按钮。PROJECT 类型接收时，接收人必须为负责人（assigneeId），不可由其他人代接收。
> - **非 PROJECT 类型叶子节点**（OPERATION_TASK 等）：指定了负责人→仅负责人可见；未指定负责人但指定了操作员→操作员可见；两者均未指定→同部门用户可见；以上条件均不满足→不显示。
>
> **指派弹窗按类型区分**：
> - PROJECT 类型：标题"指派项目负责人"，部门标签"负责部门"。人员按指派人的权限区分：
>   - 指派人具有 `department:manager` 权限 → 列出负责部门中具有 `project:create` 或 `task:create` 权限的用户；
>   - 指派人具有 `project:create` 权限（但不具有 `department:manager`）→ 列出负责部门中具有 `task:create` 权限的用户。
> - 非 PROJECT 类型：标题"指派任务"，部门标签"执行部门"，人员规则同 PROJECT 类型。
> - 部门选择权限：只有具有 `department:read` 权限的用户可以选择任意部门；不具备该权限的用户只能指派到本部门（负责部门和质检部门均锁定为本部门）。
>
> **项目/子项目创建自动状态**：指定项目负责人时自动设为 ASSIGNED 状态，前端不得硬编码 status 字段。
>
> **指派人与被指派人约束**：指派人（assignerId）和被指派人（assigneeId）不能为同一用户，防止逻辑漏洞。

**c. 权限驱动的看板列可见性**

"待接收"（ASSIGNED）列对所有用户可见，不再按权限隐藏。所有用户看到的泳道列一致：待处理、待接收、已接收、进行中、待质检、质检中、质检完成、完成。

**d. 分解操作模型**

分解操作将一个叶子任务拆分为多个同质子任务，子任务分类和类型与父任务相同。权限：`department:manager` 可分解任意类型；PROJECT 类型另需 `project:create`，非 PROJECT 类型另需 `task:create`（或 `project:create`）。同时拥有 `project:create` 和 `task:create` 的用户可在弹窗顶部选择"分解为子项目"或"分解为子任务"，后端 DecomposeRequest.category 字段记录用户选择。交互流程：

```
① 输入子任务数量 N（N > 0）
        ↓
② 系统均分工作量：每子任务工作量 = 父工作量 / N
        ↓
③ 弹出可编辑分配表（列根据权限动态显示）
   ┌──────┬──────┬──────────┬──────────┬──────────┬──────┬──────┐
   │ 工作量 │ 计量单位 │ 执行部门   │ 质检部门   │ 执行人   │ 质检人 │
   ├──────┼──────┼──────────┼──────────┼──────────┼──────┼──────┤
   │ W/N  │ 父单位  │ （下拉）   │ （下拉）   │ （选择）│ （选择）│
   │ W/N  │ 父单位  │ （下拉）   │ （下拉）   │ （选择）│ （选择）│
   │ ...  │ ...   │ ...      │ ...      │ ...     │ ...  │
   └──────┴──────┴──────────┴──────────┴──────────┴──────┴──────┘
   列可见性规则：
   - 计量单位：始终显示，自动填写父任务单位，不可更改
   - 执行部门：project:create 或 task:create 权限可见，必填
   - 质检部门：project:create 或 task:create 权限可见，选填
   - 执行人：department:manager 权限可见，选填；有创建权限时按所选执行部门过滤，无创建权限时限定为当前用户所属部门人员
   - 质检人：department:manager 权限可见，选填；有创建权限时按所选质检部门过滤，无创建权限时限定为当前用户所属部门人员
   注：无创建权限时，后端强制将执行部门和质检部门设为当前用户所属部门（忽略前端传值）
        ↓
④ 用户调整：修改工作量、增删行
        ↓
⑤ 确认：校验 Σ(子任务工作量) = 父工作量，子任务名称在同一父节点下必须唯一，执行部门为必填项；执行部门或执行人相同时界面显示警告提示
   ├─ 通过 → ⑥ 批量创建同质子任务（分类、类型、计量单位与父任务相同），父节点变为非叶子节点
   └─ 不通过 → 提示错误，返回编辑
        ↓
⑦ 取消：不做任何操作
```

**分解操作后端接口**：

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/tasks/{id}/decompose` | POST | 分解叶子任务为多个同质子任务；PROJECT 类型需 `project:create` 或 `department:manager`，非 PROJECT 类型需 `task:create`/`project:create` 或 `department:manager` |

**DecomposeRequest**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `subTasks` | List\<SubTaskItem\> | 子任务列表 |
| `subTasks[].name` | String | 子任务名称 |
| `subTasks[].workload` | Double | 子任务工作量 |
| `subTasks[].workloadUnit` | String | 计量单位（自动填写父任务单位，不可更改） |
| `subTasks[].departmentId` | String | 执行部门 ID（有创建权限时必填；无创建权限时后端强制填写当前用户所属部门，忽略前端传值） |
| `subTasks[].assigneeId` | UUID | 执行人 ID（选填；department:manager 权限可见；有创建权限时按所选执行部门过滤，无创建权限时限定为当前用户所属部门人员） |
| `subTasks[].qaDepartmentId` | String | 质检部门 ID（选填；无创建权限时后端强制填写当前用户所属部门，忽略前端传值） |
| `subTasks[].qaAssigneeId` | UUID | 质检人 ID（选填；department:manager 权限可见；有创建权限时按所选质检部门过滤，无创建权限时限定为当前用户所属部门） |

**后端校验**：
- 子任务数量 > 0
- 各子任务工作量 > 0
- 各子任务工作量之和 = 父任务工作量
- 各子任务计量单位 = 父任务计量单位（同质约束）
- 子任务名称在同一父节点下必须唯一（不可与已有兄弟任务重名，也不可彼此重复）
- 执行部门：有创建权限时必填；无创建权限时后端强制填写当前用户所属部门（忽略前端传值）
- 分解后父节点 compositionMode 自动设为 HOMOGENEOUS
- 父任务必须为叶子节点（无子任务）

**e. 指派撤销接口**

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/tasks/{id}/revoke-assignment` | POST | 撤销指派，任务恢复到 PENDING |

**f. 撤销质检接口**

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/tasks/{id}/revoke-qa` | POST | 撤销质检（SUBMITTED_FOR_QA → IN_PROGRESS），工作量退回，保留已填完成量（再次输入为增量累加）；需 assigneeId + `task:execute` 权限；仅 SUBMITTED_FOR_QA 状态可撤销 |

**g. 接收质检接口（v1.14 新增）**

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/tasks/{id}/accept-qa` | POST | 接收质检（SUBMITTED_FOR_QA → QA_COMPLETING），工作量从 SUBMITTED_FOR_QA 搬移到 QA_COMPLETING，assigneeId 转为质检员，原操作员 ID 保存到 previous_assignee_id；需 `quality:check` 权限 |

**h. 用户可见项目树接口**

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/tasks/my-tree` | GET | 返回当前用户可见的所有节点（含祖先链），支持分页 |

**请求参数**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | int | 0 | 页码 |
| `size` | int | 5000 | 每页条数 |

**返回**：`Page<TaskResponse>`，每个节点包含 `canUpdate` 字段标记当前用户能否编辑。

**可见节点收集规则**：
1. 全局权限用户（project:read_global）→ 返回所有节点
2. 部门权限用户（project:read_department / task:read_department）→ 本部门可见节点
3. 项目负责人（project:read_own / task:read_project）→ 负责的项目及其所有子节点
4. 作业员（task:execute）→ 被指派执行的任务
5. 负责人节点（assigneeId = 当前用户）→ 加入直接可见集合
6. 对每个直接可见节点，沿 parentTaskId 向上追溯所有祖先节点
7. **负责人子树展开**：用户作为负责人（assigneeId）的节点，向下递归展开所有后代节点
8. **参与人员子树展开**：用户作为参与人员（operator / inspector）的节点，向下递归展开所有后代节点
9. 所有节点去重合并后分页返回

**canUpdate 计算规则**：与 canUpdateTask 一致——全局写权限 / 部门写权限 / 项目负责人 / 祖先节点负责人 → true，否则 false。

**校验**：
- 任务当前状态必须为 ASSIGNED
- 操作人必须为指派人（assignerId 对应用户）或具有 department:manager 权限
- 被指派人尚未接收（status 仍为 ASSIGNED）

**f. 质检角色看板模型**

质检部门负责人和普通质检员在看板中的视图不同，遵循与主任务相同的权限驱动规则：

| 差异项 | 普通用户看板 | 质检部门负责人看板 | 普通质检员看板 |
|------|------|------|------|
| 状态列 | 全部 | 不显示"待质检"（SUBMITTED_FOR_QA）和"完成"（COMPLETED）列 | 不显示"待质检"（SUBMITTED_FOR_QA）和"完成"（COMPLETED）列 |
| 提交质检任务标识 | 无特殊标识 | 右上角"Q"图标 | 右上角"Q"图标 |
| 未指定质检员时 | — | 任务出现在"待接收"列，可"指派"或"撤销" | 看不到（未指派给自己） |
| 已指定质检员时 | — | — | 任务出现在待质检泳道，可"接收" |
| 操作流程 | 进行中→提交质检 | 指派/撤销；或接收→通过/不通过 | 接收→通过/不通过 |
| 工作量同步 | 主任务界面 | 质检完成工作量与主任务同步 | 质检完成工作量与主任务同步 |

> v1.14 变更：质检员操作流程从"接收→开始处理→输入完成量→质检完成"简化为"接收→通过/不通过"。质检员不再执行开始处理和输入完成量操作，而是直接在质检中状态判定通过或不通过。

**质检推送规则**：
- 未指定质检员（qaAssigneeId 为空）：推送给质检部门（qaDepartmentId）中具有 `department:manager` 权限的用户（即质检部门负责人），负责人可在"待接收"列中"指派"给具体质检员或"撤销"
- 已指定质检员（qaAssigneeId 非空）：推送给该质检员，任务出现在质检员的 PENDING 列

**g. 指派后视图**

指派操作后，不同角色看到的任务位置不同：

| 角色 | 看到的位置 | 说明 |
|------|----------|------|
| 指派人（assignerId） | 待接收列 | 显示"撤销指派"按钮，可撤销指派 |
| 被指派人 | 待接收列 | 显示"接收"按钮 |

> 实现方式：ASSIGNED 状态统一显示在"待接收"泳道，不再按用户身份做泳道映射。所有用户视角一致。

### 项目下达备注与附件

对应需求规格书 2.1.8。

| 操作 | 说明 |
|------|------|
| `remarks` | 下达人填写工作范围、质量要求、交付标准等 |
| 附件上传 | PDF/Word/图片/ZIP/RAR，单文件 ≤50MB，每项目 ≤20 个 |
| 编辑权限 | 仅创建人、项目负责人、task:update 权限用户 |

### externalSystem / externalTaskId / externalUrl

当任务由外部系统创建或管理时：

| 字段 | 说明 |
|------|------|
| `external_system` | 标识来源系统 |
| `external_task_id` | 外部系统中的任务 ID |
| `external_url` | 指向外部系统的任务页面 |

---

## 三、枚举类型与动态字典

### TaskStatus — 通用任务状态

对应需求规格书 2.1.3。适用于所有节点（PROJECT / PHASE / OPERATION_TASK），`status` 字段存储。

| 值 | 含义 | 触发条件 | 回退 |
|----|------|----------|------|
| `PENDING` | 待处理 | 创建时默认 | - |
| `ASSIGNED` | 待接收 | 指定负责人 | ← 撤销指派（→PENDING） |
| `RECEIVED` | 已接收 | 确认接收任务 | - |
| `IN_PROGRESS` | 进行中 | 开始执行 | - |
| `PAUSED` | 已暂停 | 手动暂停 | - |
| `SUBMITTED_FOR_QA` | 待质检 | 操作员点击"提交质检"后 | ← IN_PROGRESS（操作员"撤销"，需 assigneeId + `task:execute` 权限） |
| `QA_COMPLETING` | 质检中 | 质检员点击"接收"后 | ← IN_PROGRESS（质检员"不通过"，需 `quality:check` 权限；assigneeId 恢复原操作员） |
| `QA_COMPLETED` | 质检完成 | 质检员确认通过 | - |
| `COMPLETED` | 已完成 | 子项目/任务 QA_COMPLETED 后直接完成；根项目归档后自动完成 | - |
| `FAILED` | 已失败 | 执行异常 | - |

状态流转：

```
PENDING ──→ ASSIGNED ──→ RECEIVED ──→ IN_PROGRESS ──→ SUBMITTED_FOR_QA ──→ QA_COMPLETING ──→ QA_COMPLETED ──→ COMPLETED
                                                    ↑                    │
                                                    └── 撤销(操作员，保留完成量)  └── 不通过(质检员，清零完成量+恢复assigneeId) ──→ IN_PROGRESS
```
  │            │                        │    ↑              │                    │
  │            │←─ 撤销 ─┘              ↓    │              │←── 退回 ──────────┘
  │            │                      PAUSED │              │←── 回退 ──┘
  │            │                        │    │
  └────────────┴────────────────────────┘    │
  └──────────────────────────────────────────┘
                ↓
              FAILED
```

### WorkflowStatus — 项目验收归档阶段

对应需求规格书 2.1.3。仅适用于根项目 PROJECT（没有 `parent_task_id` 的顶层 PROJECT 节点），`workflow_status` 字段存储。

| 阶段 | 含义 | 流转方向 | 回退 |
|------|------|---------|------|
| `PENDING_ACCEPTANCE` | 待验收 | → ACCEPTANCE_COMPLETED | - |
| `ACCEPTANCE_COMPLETED` | 验收完成 | → ARCHIVED | - |
| `ARCHIVED` | 项目归档 | 终态（归档后 status 自动设为 COMPLETED） | - |

**约束**：
- 除 TaskStatus 表和 WorkflowStatus 表标注可回退的流转外，其余只能向前流转，不可回退、不可跳过
- **根项目定义**：没有 `parent_task_id` 的顶层 PROJECT 节点。以下"仅根项目"均指此定义
- 子项目和任务节点在 QA_COMPLETED 后直接完成（status=COMPLETED），不经过 WorkflowStatus
- **根项目自动流转**：当根项目下所有叶子节点的 QA_COMPLETED 数量 = 叶子节点总数时，项目 workflowStatus 自动设置为 PENDING_ACCEPTANCE；由项目创建人确认后流转为 ACCEPTANCE_COMPLETED；由具有 resource:project_archives_save 权限的用户操作后流转为 ARCHIVED；归档后 status 自动设为 COMPLETED
- **非叶子节点状态推导**：非叶子节点的状态和进度不能直接修改，由子节点驱动；递归统计叶子节点各状态数量，全部叶子同状态才设父状态，否则状态为空

### ProjectTypeDefinition — 项目类型字典（服务领域）

对应需求规格书 2.1.2.1、2.1.2.2、2.1.2.4。`Task.type` 在 PROJECT/PHASE 节点上引用此字典。

**数据库表：`project_type_definitions`**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `code` | VARCHAR(64) | 类型编码，全局唯一 |
| `name` | VARCHAR(128) | 类型名称 |
| `description` | VARCHAR(500) | 类型说明 |
| `source` | VARCHAR(32) | 来源：`BUILTIN` / `CUSTOM` / `EXTERNAL`（内置 / 手动创建 / 外部系统注册审批） |
| `enabled` | BOOLEAN | 是否启用 |
| `reference_count` | INTEGER | 引用次数缓存，用于删除校验 |
| `created_at / updated_at` | TIMESTAMPTZ | 时间戳 |

**预设 13 种服务领域**：综合性项目 / 基础测绘 / 新型基础测绘和实景三维 / 测绘基准 / 国土空间规划 / 工程测量 / 不动产测绘 / 应急测绘 / 土地报批 / 调查监测 / 智慧城市 / 地图编制 / 其他

**管理规则**：
- TMS 提供独立管理页维护项目类型
- 仅允许删除从未被引用过的类型；已引用类型允许停用，停用后不影响已使用的项目或任务
- 外部系统不对接项目类型
- 项目类型不再绑定计量单位；计量单位在创建项目/子项目时由用户选择

### TaskTypeDefinition — 任务类型字典（技术工序）

对应需求规格书 2.1.2.1、2.1.2.3、2.1.2.4。`Task.type` 在 OPERATION_TASK 节点上引用此字典。

**数据库表：`task_type_definitions`**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `code` | VARCHAR(64) | 类型编码，全局唯一 |
| `name` | VARCHAR(128) | 类型名称 |
| `group_id` | UUID | 所属分组，FK → task_type_group(id) |
| `description` | VARCHAR(500) | 类型说明 |
| `source` | VARCHAR(32) | 来源：`BUILTIN` / `CUSTOM` / `EXTERNAL`（内置 / 手动创建 / 外部系统注册审批） |
| `enabled` | BOOLEAN | 是否启用 |
| `reference_count` | INTEGER | 引用次数缓存，用于删除校验 |
| `created_at / updated_at` | TIMESTAMPTZ | 时间戳 |

**预设 5 组 30 种工序**：

| 分组 | 数量 | 典型类型 |
|------|------|---------|
| 数据采集 | 9 | 外业调绘、航空测量、像控测量、无人机测量、全野外数据采集、野外调查、控制点埋设、水准测量、GNSS观测 |
| 数据处理 | 9 | 内业解译、地形图编制、数据建库、倾斜摄影建模、3DGS建模、内业模型粗修、内业单体建模、水准计算、控制网解算 |
| 产品制作与开发 | 8 | DLG制作、DEM制作、DOM制作、电子地图制作、地图集制作、2.5维地图制作、专题图制作、软件开发 |
| 文档编制 | 3 | 专业技术设计书编写、工作技术总结编写、标准规范编制 |
| 其他 | 1 | 其他任务 |

**管理规则**：
- 与项目类型共用删除/停用规则
- 外部系统注册时声明的 supportedTaskTypes 编码必须存在于本字典且已启用
- 同一任务类型编码可绑定多个外部系统，不限制独占（需求规格书 2.2.3）
- 任务类型不再绑定计量单位；计量单位在创建任务时由用户选择

### TaskTypeGroup — 任务类型分组字典

**数据库表：`task_type_group`**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `code` | VARCHAR(32) | 分组编码，唯一 |
| `name` | VARCHAR(64) | 分组名称 |
| `sort_order` | INTEGER | 排序 |
| `enabled` | BOOLEAN | 是否启用 |
| `created_at / updated_at` | TIMESTAMPTZ | 时间戳 |

**预设 5 组**：数据采集 / 数据处理 / 产品制作与开发 / 文档编制 / 其他

### MeasurementUnitDefinition — 计量单位字典

对应需求规格书 2.1.2.6。计量单位分为**基本计量单位**与**派生计量单位**两级。

**数据库表：`measurement_unit_definitions`**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `code` | VARCHAR(32) | 单位编码，全局唯一 |
| `name` | VARCHAR(32) | 单位名称，全局唯一 |
| `builtin` | BOOLEAN | 是否系统预置 |
| `enabled` | BOOLEAN | 是否启用 |
| `base_unit_code` | VARCHAR(32) | 基准单位编码，FK → measurement_unit_definitions(code)；NULL 表示基本计量单位 |
| `conversion_factor` | DOUBLE | 换算量（1 本单位 = conversion_factor 个基准单位）；基本单位为 NULL |
| `created_at / updated_at` | TIMESTAMPTZ | 时间戳 |

**外键约束**：`fk_unit_base_unit` — `base_unit_code` 引用 `measurement_unit_definitions(code)`，派生单位只能关联基本单位。

**预设基本计量单位（5 种）**：

| 编码 | 名称 | 量纲 |
|------|------|------|
| UNIT_M | 米 | 长度 |
| UNIT_SQ_M | 平方米 | 面积 |
| UNIT_CUBIC_M | 立方米 | 体积 |
| UNIT_KG | 千克 | 质量 |
| UNIT_COUNT | 计数 | 计数 |

**预设派生计量单位（8 种）**：

| 编码 | 名称 | 基准单位 | 换算量 | 换算说明 |
|------|------|---------|--------|----------|
| UNIT_KM | 公里 | 米 | 1000 | 1 公里 = 1000 米 |
| UNIT_SQ_KM | 平方公里 | 平方米 | 1000000 | 1 平方公里 = 1000000 平方米 |
| UNIT_GE | 个 | 计数 | 1 | 1 个 = 1 计数 |
| UNIT_POINT | 点 | 计数 | 1 | 1 点 = 1 计数 |
| UNIT_FU | 幅 | 计数 | 1 | 1 幅 = 1 计数 |
| UNIT_ZHANG | 张 | 计数 | 1 | 1 张 = 1 计数 |
| UNIT_BEN | 本 | 计数 | 1 | 1 本 = 1 计数 |
| UNIT_PAGE | 页 | 计数 | 1 | 1 页 = 1 计数 |

**管理规则**：
- 基本计量单位仅 `system:manager` 权限可创建、编辑、启停、删除
- 基本计量单位删除约束：无关联派生单位且无任务/项目引用时方可删除
- 派生计量单位所有用户可创建，创建时必须选择一个基本计量单位并填写正数换算量
- 换算量必须为正数（> 0）；派生单位只能关联基本单位，不可关联其他派生单位
- `builtin = true` 的单位不可编辑和删除
- 编码和名称在全局唯一（不区分基本/派生）
- 计量单位不在项目类型/任务类型中绑定，创建项目/任务时由用户选择并快照到 workloadUnit
- 同质项目（compositionMode = HOMOGENEOUS）下所有子节点必须使用相同的基本计量单位；派生单位按换算量归集到基本单位后校验
- 异质项目（compositionMode = HETEROGENEOUS）下子节点可使用不同的基本计量单位

### CompositionMode — 父节点子结构类型

| 值 | 含义 | 判定规则 |
|----|------|----------|
| `HOMOGENEOUS` | 同质 | 直接子节点类型全相同 |
| `HETEROGENEOUS` | 异质 | 直接子节点类型全不同 |

判定时适用于所有层级（PROJECT/PHASE/OPERATION_TASK）。

### TaskCategory — 任务分类

| 值 | 说明 | 类型来源 | 工作量单位来源 |
|----|------|---------|--------------|
| `PROJECT` | 顶层项目 | `project_type_definitions.code` | 创建时由用户选择计量单位 |
| `PHASE` | 子项目（中间层级） | `project_type_definitions.code` | 创建时由用户选择计量单位 |
| `OPERATION_TASK` | 作业任务 | `task_type_definitions.code` | 创建时由用户选择计量单位 |
| ~~`QA_TASK`~~ | ~~已移除（v1.8）~~ | ~~不再创建~~ | ~~质检改为源任务状态流转~~ |

> **v1.4 变更**：SELF_CHECK_TASK 分类已废弃，不再自动生成自检子节点。质检由指定质检部门/人员执行。`self_check_for_task_id` 字段保留用于历史数据兼容，新建任务不再使用。

> **v1.8 变更**：QA_TASK 分类已移除，质检不再创建独立任务，改为源任务状态流转。
> **v1.15 变更**：撤销权限收紧——撤销指派和审批撤销接收均仅限指派人（assignerId），`project:update_global` 不再参与撤销权限判断。异质进度条聚合从直接求和改为按比例平均。异质分解工作量按类型分组校验。

> **v1.14 变更**：质检流程两步化——SUBMITTED_FOR_QA（待质检）需质检员"接收"后进入 QA_COMPLETING（质检中），再"通过"或"不通过"。操作员可在待质检状态"撤销"。
> **v1.17 变更**：新增 `in_progress_completed_workload` 字段——IN_PROGRESS 状态下已完成但尚未提交质检的工作量跟踪。进度公式从 `IN_PROGRESS量 × w_ip` 改为 `in_progress_completed_workload × w_ip`。彩色进度条 IN_PROGRESS 绿色段细分为深绿（可提交质检）和浅绿（进行中）两个子段。子任务进度只读（由工作量驱动）。`in_progress_weight` 输入支持两位小数。管理看板项目详情工作量只读。页面刷新保持项目树状态。

> **v1.18 变更**：撤销质检/质检不通过区分处理——撤销质检保留完成量+增量累加，质检不通过清零+assigneeId恢复原操作员。新增 `previous_assignee_id` 字段。异质聚合公式从等权平均改为加权平均。非叶子节点IN_PROGRESS双色段递归汇总。`in_progress_weight` 项目级默认+任务级覆盖。外部系统推送 `in_progress_completed_workload=0`。废弃字段（source_task_id、qa_batch_no、self_check_for_task_id）归档至历史字段。

> **v1.16 变更**：新增操作附件（TaskActionAttachment）——指派和提交质检支持上传附件（≤10MB）和填写地址，指派可继承项目附件。附件仅接收人可见。

> **层级关系**：PROJECT → PHASE → OPERATION_TASK（或 PROJECT → OPERATION_TASK 两层）。PHASE 可嵌套，最深 ≤5 层。父节点进度统一由直接子节点汇聚；同质按"权重×工作量_基本单位×进度"（工作量_基本单位 = 工作量 × 换算量），异质按"权重×进度"。

---

## 四、关联实体

### TaskAssignment — 任务人员指派

数据库表：`task_assignments`。复合主键由 `TaskAssignmentId` 构成。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `task_id` | UUID | PK, FK → tasks(id) CASCADE | 任务 ID |
| `user_id` | UUID | PK | 用户 ID（指向用户服务） |
| `assignment_role` | VARCHAR(32) | PK | 角色：`OPERATOR` / `INSPECTOR` |

索引：`ix_task_assignments_task(task_id)`, `ix_task_assignments_user(user_id)`

### TaskDependency — 任务依赖关系

数据库表：`task_dependencies`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK | 主键 |
| `predecessor_id` | UUID | NOT NULL, FK → tasks(id) CASCADE | 前置任务 ID |
| `successor_id` | UUID | NOT NULL, FK → tasks(id) CASCADE | 后置任务 ID |
| `dependency_type` | VARCHAR(32) | 默认 `FINISH_TO_START` | 依赖类型 |
| `unlock_status` | VARCHAR(32) | 默认 `QA_COMPLETED` | 前置任务需达到此状态才解锁后置任务 |

唯一约束 `(predecessor_id, successor_id)`。索引：`ix_task_dependencies_predecessor`、`ix_task_dependencies_successor`。

> `unlock_status` 可选值为 TaskStatus 枚举值（如 COMPLETED、QA\_COMPLETED 等），默认 QA\_COMPLETED。只有项目负责人（具有 `department:manager` 权限）可设置此字段。依赖传播逻辑：前置任务状态变更时，若前置任务状态达到 `unlock_status`，则解锁后置任务；否则后置任务保持 PAUSED。

### TaskAttachment — 项目/任务附件

数据库表：`task_attachments`。对应需求规格书 2.1.8。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK | 主键 |
| `task_id` | UUID | NOT NULL, FK → tasks(id) CASCADE | 所属任务 ID |
| `file_name` | VARCHAR(255) | NOT NULL | 原始文件名 |
| `stored_name` | VARCHAR(255) | NOT NULL | 存储文件名（UUID 防冲突） |
| `file_size` | BIGINT | NOT NULL | 文件大小（字节） |
| `content_type` | VARCHAR(100) | NOT NULL | MIME 类型 |
| `storage_path` | VARCHAR(500) | NOT NULL | 存储路径 |
| `uploaded_by` | UUID | 可空 | 上传人 ID |
| `uploaded_by_name` | VARCHAR(128) | 可空 | 上传人姓名（快照） |
| `uploaded_at` | TIMESTAMPTZ | 默认 NOW() | 上传时间 |
| `created_at` | TIMESTAMPTZ | 默认 NOW() | 创建时间 |

**约束**：单文件 ≤50MB，每项目 ≤20 个。支持 PDF/Word/图片/ZIP/RAR。附件增删写入审计日志。

索引：`ix_task_attachments_task(task_id)`

### TaskActionAttachment — 操作附件（v1.16 新增）

数据库表：`task_action_attachments`。对应需求规格书 2.1.9。

操作附件与项目附件（TaskAttachment）隔离存储。通过 `action` 区分操作类型，通过 `type` 区分文件/地址。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK | 主键 |
| `task_id` | UUID | NOT NULL, FK → tasks(id) CASCADE | 所属任务 ID |
| `action` | VARCHAR(32) | NOT NULL | 操作类型：ASSIGN（指派）/ SUBMIT_QA（提交质检） |
| `type` | VARCHAR(16) | NOT NULL | 附件类型：FILE（文件）/ LINK（地址） |
| `file_name` | VARCHAR(255) | 可空 | 原始文件名（FILE 时必填） |
| `stored_name` | VARCHAR(255) | 可空 | 存储文件名（UUID 防冲突） |
| `file_size` | BIGINT | 可空 | 文件大小（字节） |
| `content_type` | VARCHAR(100) | 可空 | MIME 类型 |
| `storage_path` | VARCHAR(500) | 可空 | 存储路径 |
| `link_url` | VARCHAR(2000) | 可空 | 地址内容（LINK 时必填，不强制 URL 格式，支持网络路径） |
| `link_label` | VARCHAR(255) | 可空 | 地址描述 |
| `inherited_from` | UUID | 可空 | 继承自哪个项目附件（TaskAttachment.id） |
| `uploaded_by` | UUID | 可空 | 上传人/添加人 ID |
| `uploaded_by_name` | VARCHAR(128) | 可空 | 上传人姓名（快照） |
| `created_at` | TIMESTAMPTZ | 默认 NOW() | 创建时间 |

**约束**：单文件 ≤10MB，每 action ≤20 个。支持 PDF/Word/Excel/图片/ZIP/RAR/7z。继承不复制物理文件，仅记录 inheritedFrom 引用。

**可见性规则**：ASSIGN 附件仅接收人（assigneeId）可见；SUBMIT_QA 附件仅质检员（具有 `quality:check` 权限的用户）可见。TaskResponse 中通过 `assignAttachmentCount` 和 `submitQaAttachmentCount` 返回数量。

---

## 五、DTO 数据传输对象

### TaskCreateRequest — 创建任务

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | String | 任务名称 |
| `type` | String | 类型编码。PROJECT/PHASE 时引用 `project_type_definitions.code`；OPERATION_TASK 时引用 `task_type_definitions.code` |
| `category` | TaskCategory | 任务分类 |
| `status` | TaskStatus | 初始状态 |
| `priority` | Integer | 优先级 |
| `plannedDueAt` | ZonedDateTime | 计划截止时间 |
| `inputParams` | String | 输入参数（JSON） |
| `outputResults` | String | 输出结果（JSON） |
| `parentTaskId` | UUID | 父任务 ID |
| `projectId` | UUID | 项目 ID |
| `departmentId` | String | 部门 ID（必填） |
| `createdByName` | String | 创建人姓名 |
| `createdDepartmentId` | String | 创建人部门 ID |
| `createdDepartmentName` | String | 创建人部门名称 |
| `externalSystem` | String | 外部系统标识 |
| `externalTaskId` | String | 外部任务 ID |
| `externalUrl` | String | 外部链接 |
| `workload` | Double | 工作量。项目下达时必填；任务节点可选填。不得 ≤0 |
| `workloadUnit` | String | 工作量单位，创建时由用户选择 |
| `weight` | Double | 子节点权重，范围 `0.01~100`（支持小数），默认 `1` |
| `remarks` | String | 项目备注 |
| `projectLeaderId` | UUID | 项目负责人 ID |
| `operatorIds` | List\<UUID\> | 作业员 ID 列表 |
| `inspectorIds` | List\<UUID\> | 质检员 ID 列表 |

### TaskUpdateRequest — 更新任务

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | String | 任务名称 |
| `type` | String | 类型编码；允许更新，但须符合分类与字典约束 |
| `category` | TaskCategory | 任务分类 |
| `status` | TaskStatus | 任务状态 |
| `workflowStatus` | String | 项目验收归档阶段（WorkflowStatus 枚举，3 值），仅根项目 PROJECT 使用 |
| `priority` | Integer | 优先级 |
| `plannedDueAt` | ZonedDateTime | 计划截止时间 |
| `inputParams` | String | 输入参数（JSON） |
| `outputResults` | String | 输出结果（JSON） |
| `departmentId` | String | 部门 ID |
| `workload` | Double | 工作量，不得 ≤0 |
| `workloadUnit` | String | 工作量单位快照 |
| `weight` | Double | 子节点权重，范围 `0.01~100`（支持小数），默认 `1` |
| `remarks` | String | 项目备注 |
| `projectLeaderId` | UUID | 项目负责人 ID |
| `assigneeId` | UUID | 负责人 ID |
| `operatorIds` | List\<UUID\> | 作业员 ID 列表 |
| `inspectorIds` | List\<UUID\> | 质检员 ID 列表 |

### TaskResponse — 任务响应

包含 Task 实体所有字段 + 关联信息：

| 额外字段 | 类型 | 说明 |
|----------|------|------|
| `projectLeaderId` | UUID | 项目负责人 ID |
| `operatorIds` | List\<UUID\> | 作业员 ID 列表 |
| `inspectorIds` | List\<UUID\> | 质检员 ID 列表 |
| `depthLevel` | Integer | 节点在树中的深度（0=根节点 PROJECT，1~4=各级子节点） |
| `compositionMode` | String | 直接子节点结构类型：`HOMOGENEOUS` / `HETEROGENEOUS` |
| `remarks` | String | 项目备注 |
| `attachmentCount` | Integer | 附件数量（项目/任务附件） |
| `assignAttachmentCount` | Integer | 指派操作附件数量（v1.16 新增） |
| `submitQaAttachmentCount` | Integer | 提交质检操作附件数量（v1.16 新增） |
| `inProgressCompletedWorkload` | Double | IN_PROGRESS 状态下已完成但尚未提交质检的工作量（v1.17 新增） |
| `previousAssigneeId` | UUID | 质检员接收前的原操作员 ID（v1.18 新增） |
| `canUpdate` | Boolean | 当前用户能否编辑此节点（仅 my-tree 接口返回） |
| `directChildCount` | Integer | 直接子节点数量（用于前端判断是否所有子节点均可见，避免部分可见时误报工作量不一致警告） |

### WorkflowStatusUpdateRequest — 工作流状态更新

| 字段 | 类型 | 说明 |
|------|------|------|
| `workflowStatus` | String | 工作流状态（WorkflowStatus 枚举，非业务自定义） |
| `commentStage` | String | 阶段注释 |
| `commentResult` | String | 结果注释 |
| `commentMessage` | String | 消息注释 |
| `intermediatePath` | String | 中间产物路径 |
| `progress` | Integer | 进度 |
| `results` | String | 执行结果（JSON 字符串，写入 outputResults） |

### DecomposeRequest — 分解叶子任务

对应需求规格书 2.1.8 d 项。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `category` | String | 可空 | 子节点分类（`PROJECT` 或 `OPERATION_TASK`）。为空时默认取父节点分类。同时拥有 `project:create` 和 `task:create` 权限时前端弹窗供用户选择 |
| `subTasks` | List\<SubTaskItem\> | NOT NULL, size > 0 | 子任务列表 |
| `subTasks[].name` | String | NOT NULL | 子任务名称 |
| `subTasks[].workload` | Double | NOT NULL, > 0 | 子任务工作量 |
| `subTasks[].workloadUnit` | String | NOT NULL | 计量单位（必须与父任务相同） |
| `subTasks[].departmentId` | String | NOT NULL | 负责部门 ID |
| `subTasks[].assigneeId` | UUID | 可空 | 承担人 ID |
| `subTasks[].qaDepartmentId` | String | 可空 | 质检部门 ID |
| `subTasks[].qaAssigneeId` | UUID | 可空 | 质检员 ID |

**校验规则**：
- Σ(subTasks[].workload) = 父任务 workload（守恒约束）
- 所有 subTasks[].workloadUnit 相同且 = 父任务 workloadUnit（同质约束）
- 父任务必须为叶子节点（无子任务）
- 操作人必须具有 `department:manager` 权限

### RevokeAssignmentRequest — 撤销指派

对应需求规格书 2.1.8 c 项。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `taskId` | UUID | NOT NULL | 任务 ID（路径参数） |

**校验规则**：
- 任务当前状态必须为 ASSIGNED
- 操作人必须为指派人（assignerId 对应用户）、创建人（createdById 对应用户）或具有 `department:manager` 权限
- 被指派人尚未接收（status 仍为 ASSIGNED）
- 撤销后任务状态恢复为 PENDING，assignerId 和 assigneeId 清空

### AssignRequest — 指派叶子任务

对应需求规格书 2.1.8 b 项。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `departmentId` | String | NOT NULL | 负责部门 ID |
| `assigneeId` | UUID | 可空 | 被指派人 ID |
| `qaDepartmentId` | String | 可空 | 质检部门 ID |
| `qaAssigneeId` | UUID | 可空 | 质检员 ID |

**校验规则**：
- 任务当前状态必须为 PENDING
- 操作人必须具有 `department:manager` 权限
- 必须指定负责部门（departmentId）
- 指派后任务状态→ASSIGNED，assignerId 设为当前操作人，assigneeId 设为被指派人

### SubmitCompletionRequest — 输入完成量

对应需求规格书 2.1.8 f 项。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `completedWorkload` | Double | NOT NULL, > 0 | 本次完成的工作量 |

**校验规则**：
- 任务状态必须为 IN_PROGRESS
- completedWorkload + 已累计完成量 ≤ 总工作量（workload）
- 操作人必须具有 `task:execute` 权限
- 完成量在 IN_PROGRESS 中累计记录
- **完成量 = 总工作量时**：前端显示"提交质检"按钮，点击后任务状态 → SUBMITTED_FOR_QA（待质检），全部工作量从 IN_PROGRESS 搬移到 SUBMITTED_FOR_QA

> v1.8 变更：不再将完成量从 IN_PROGRESS 扣减到 SUBMITTED_FOR_QA，改为累计完成量。不再自动创建 QA_TASK。

### ActionAttachmentResponse — 操作附件响应（v1.16 新增）

对应需求规格书 2.1.9。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 附件 ID |
| `taskId` | UUID | 所属任务 ID |
| `action` | String | 操作类型：ASSIGN / SUBMIT_QA |
| `type` | String | 附件类型：FILE / LINK |
| `fileName` | String | 文件名（FILE 类型） |
| `fileSize` | Long | 文件大小（字节） |
| `contentType` | String | MIME 类型 |
| `linkUrl` | String | 地址内容（LINK 类型） |
| `linkLabel` | String | 地址描述 |
| `inheritedFrom` | UUID | 继承自哪个项目附件 |
| `uploadedBy` | UUID | 上传人/添加人 ID |
| `uploadedByName` | String | 上传人姓名 |
| `createdAt` | ZonedDateTime | 创建时间 |

### AddActionLinkRequest — 添加操作地址（v1.16 新增）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `action` | String | NOT NULL | 操作类型：ASSIGN / SUBMIT_QA |
| `url` | String | NOT NULL | 地址内容（不强制 URL 格式） |
| `label` | String | 可空 | 地址描述 |

### InheritAttachmentsRequest — 继承附件请求（v1.16 新增）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `action` | String | NOT NULL | 操作类型：ASSIGN（仅指派支持继承） |
| `sourceAttachmentIds` | List\<UUID\> | NOT EMPTY | 要继承的项目附件 ID 列表 |
| `uploadedBy` | UUID | 可空 | 操作人 ID |
| `uploadedByName` | String | 可空 | 操作人姓名 |

### ~~QaTaskQuery — 质检任务查询~~（v1.8 已移除）

> QA_TASK 不再创建，质检任务查询 API 已移除。质检员在主看板中操作 SUBMITTED_FOR_QA 状态的源任务。

### ~~QaApprove — 质检通过~~（v1.8 已移除）

> 质检通过改为直接操作源任务：质检员先在待质检泳道"接收"任务（SUBMITTED_FOR_QA → QA_COMPLETING），再在质检中泳道点击"通过"按钮（需 `quality:check` 权限），任务状态 → QA_COMPLETED，工作量从 QA_COMPLETING 搬移到 QA_COMPLETED。

### ~~QaReject — 质检退回~~（v1.8 已移除）

> 质检退回改为直接操作源任务：质检员在质检中泳道点击"不通过"按钮（需 `quality:check` 权限），任务状态 → IN_PROGRESS，工作量从 QA_COMPLETING 退回 IN_PROGRESS，**清零已填完成量**，assigneeId 恢复原操作员（previous_assignee_id）。

---

## 六、外部系统对接模型

对应需求规格书 2.2。

### 6.1 外部系统注册表

| 字段 | 类型 | 说明 |
|------|------|------|
| `system_id` | String | 系统标识（如 `bridge-removal-app`） |
| `display_name` | String | 显示名称 |
| `service_url` | String | 服务地址 |
| `sso_client_id` | String | UPM 注册的 SSO 客户端 ID（必填，需在 SSO 白名单内） |
| `dashboard_url` | String | 第三方应用面板 URL（可选，新窗口跳转） |
| `supported_task_types` | List\<String\> | 支持的任务类型编码列表，编码必须存在于 `task_type_definitions` 且已启用；不接收项目类型编码 |
| `callback_path` | String | 回调路径模板（如 `/api/v1/projects/{id}/execute`）；`{id}` 占位符在运行时替换为实际任务 ID |
| `result_view_url` | String | 任务结果查看页面 URL 模板（如 `http://localhost:5174/tasks/{id}/locate?tab=result`）；与 callbackPath 语义不同：callbackPath 是 TMS→外部系统的任务下发入口，resultViewUrl 是 TMS 用户查看外部系统任务执行结果的页面；`{id}` 占位符替换后写入 task.externalUrl |
| `callback_fields` | String | 外部系统可提供的回传字段列表（JSON 数组字符串，枚举值见 6.3）；审批通过后从 TaskTypeRegistration 同步 |
| `result_query_path` | String | 外部系统统一结果查询 API 路径模板（如 `/api/v1/projects/{id}/result`）；`{id}` 占位符在运行时替换为实际任务 ID；审批通过后从 TaskTypeRegistration 同步 |
| `registered_at` | Timestamp | 注册时间 |

**注册安全约束**：
- `ssoClientId` 必须在 SSO 客户端白名单内
- 同一任务类型编码可绑定多个外部系统，不限制独占
- 外部系统只能声明对任务类型的支持，不对接项目类型
- 服务间通信在内网部署场景下不使用额外认证

### 6.2 任务类型注册申请表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `type_code` | String | 任务类型代码（唯一标识符） |
| `type_name` | String | 任务类型名称 |
| `group_id` | UUID | 任务类型分组 ID（审批时由管理员选择） |
| `system_id` | String | 申请的外部系统标识 |
| `callback_path` | String | 任务分发路径模板 |
| `result_view_url` | String | 任务结果查看页面 URL 模板 |
| `interface_manifest` | String | TMS 对接接口清单（JSON，含接口名称、版本号、调用方式及参数说明） |
| `callback_fields` | String | 外部系统可提供的回传字段列表（JSON 数组字符串） |
| `result_query_path` | String | 外部系统统一结果查询 API 路径模板 |
| `status` | Enum | 申请状态：PENDING / APPROVED / REJECTED |
| `reviewer_id` | String | 审批人 ID |
| `reviewed_at` | Timestamp | 审批时间 |
| `review_remark` | String | 审批备注（拒绝时为拒绝原因） |
| `created_at` | Timestamp | 申请提交时间 |

**审批流程**：
- 收到申请后先查重，类型代码已存在则直接拒绝
- 未重复的申请进入 PENDING 状态，等待 system:admin 权限用户审批
- 审批通过（APPROVED）：选择分组后自动创建 TaskTypeDefinition，并将 callbackFields/resultQueryPath 同步到 ExternalSystemRegistration
- 审批拒绝（REJECTED）：必须填写拒绝原因

### 6.3 回传字段枚举（CallbackField）

| 枚举值 | 中文标签 | 必选 | 说明 |
|--------|---------|------|------|
| `TASK_ID` | 任务ID | ✅ | 外部系统任务唯一标识 |
| `STATUS` | 任务状态 | ✅ | 任务当前状态 |
| `NAME` | 任务名称 | ✅ | 任务名称 |
| `OPERATOR` | 操作员 | ✅ | 执行操作的人员 |
| `WORKLOAD` | 任务量 | ✅ | 双精度，任务工作量 |
| `UNIT` | 任务计量单位 | ✅ | 字符串，任务计量单位 |
| `START_TIME` | 开始时间 | ❌ | 任务开始执行时间 |
| `END_TIME` | 完成时间 | ❌ | 任务完成时间 |
| `LOCATION` | 位置信息 | ❌ | 位置数据，可能是点、线、面 |
| `REMARKS` | 备注信息 | ❌ | 备注说明 |

**字段配置规则**：
- 外部系统在注册申请时声明可提供的全部回传字段（`callbackFields`）和统一查询路径（`resultQueryPath`）
- TMS 管理员审批通过后，可随时通过 `PUT /{id}/callback-fields` 调整需要拉取的字段子集；必选字段始终包含
- 审批通过或更新字段配置时，自动将 callbackFields/resultQueryPath 同步到 ExternalSystemRegistration
- TMS 下发任务时将 callback_fields 传入 payload，外部系统仅返回请求字段的数据

### 6.4 交互协议

```
┌──────────────────────┐                    ┌──────────────────────────┐
│ task-management-     │                    │ bridge-removal-service    │
│ service              │                    │                          │
│                      │  ① 注册系统        │                          │
│                      │──────────────────→│                          │
│                      │                    │                          │
│                      │  ② 创建任务并分发  │                          │
│                      │──────────────────→│                          │
│                      │                    │                          │
│                      │←──────────────────│  ③ 确认接收（RECEIVED）  │
│                      │                    │                          │
│                      │←──────────────────│  ④ 同步状态/进度         │
│                      │                    │                          │
│                      │  ⑤ 触发执行        │                          │
│                      │──────────────────→│                          │
│                      │                    │                          │
│                      │←──────────────────│  ⑥ 回调执行结果          │
│                      │                    │                          │
│                      │  ⑦ 人员统计查询    │                          │
│                      │──────────────────→│  （按需调用，标注来源）   │
│                      │←──────────────────│                          │
│                      │                    │                          │
│                      │  ⑧ 提交类型注册申请 │                          │
│                      │←──────────────────│  （含 callbackFields）     │
│                      │                    │                          │
│                      │  ⑨ 结果数据查询    │                          │
│                      │──────────────────→│  （按 resultQueryPath）  │
│                      │←──────────────────│  （仅返回请求字段）       │
└──────────────────────┘                    └──────────────────────────┘
```

**交互要点**：
- 分发请求携带幂等键 `dispatchId`
- 未收到 `RECEIVED`：最多 3 次重试（30s/60s/120s），超限告警（需求规格书 2.2.5，冻结）
- 所有回调记录 `requestId` 与回调时间
- 人员统计标注数据来源（外部系统名或"TMS"）（需求规格书 2.3.2）
- 业务状态→平台状态的映射由外部系统内部维护；TMS 仅接收平台标准状态
- BRS 仅向 TMS 注册桥梁去除（批处理），单元处理为 BRS 内部概念，不向 TMS 暴露单个子任务；子任务的待初检映射为 TMS 的进行中（IN_PROGRESS）状态，通过/不通过也作为 BRS 内部业务流
- BRS 通过 statusWorkloads 机制上报批处理进度，并通过 `totalSubTaskCount` 字段上报总子任务数量，TMS 将其设置为任务 workload 用于进度计算

---

## 七、权限模型

对应需求规格书 2.4.2。权限基于字符串控制，不依赖角色枚举。SSO 返回的 permissions 列表直接作为用户权限。TMS 本地不维护任何用户和角色，全部由 SSO/UPM 统一管理。

| 权限 | 含义 |
|------|------|
| `project:read_global` / `read_department` / `read_own` | 项目查看范围 |
| `task:read_global` / `read_department` / `read_project` / `read_own` | 任务查看范围 |
| `task:create` | 创建任务 |
| `task:update_global` / `update_department` / `update_project` / `update_own` | 任务更新范围 |
| `task:execute` | 执行任务 |
| `task:claim` | 认领任务 |
| `task:update_progress` | 更新进度 |
| `task:approve` / `reject` / `cancel` | 审批/驳回/取消 |
| `quality:check` / `quality:approve` | 质检/质检审批 |
| `project:create` | 项目验收完成确认（ACCEPTANCE_COMPLETED 流转，仅项目创建人可操作）；分解 PROJECT 类型节点；指派项目负责人 |
| `task:create` | 分解非 PROJECT 类型节点（OPERATION_TASK 等） |
| `resource:project_archives_save` | 项目归档权限（ARCHIVED 流转） |
| `department:manager` | 部门管理权限——项目负责人未指定时，负责部门中具有此权限的用户可看到项目；指派和分解任意类型节点；分解时可见执行人和质检人列 |
| `department:create` | （已废弃，由 project:create 和 task:create 替代分解操作权限） |
| `user:manage` | 用户管理 |
| `system:manager` | 系统基础数据管理——基本计量单位的创建、编辑、启停、删除 |

**本地用户约束**：SSO 不可用时的本地用户不拥有任何 TMS 操作权限，仅可访问 BRS 本地功能。

**UPM 不可用降级**：UPM 不可用时，用户/部门相关接口返回错误，明确告知上游服务不可达（不返回空列表，避免前端无法区分"服务不可用"与"无数据"）。
