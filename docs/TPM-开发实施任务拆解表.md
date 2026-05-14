# 生产协同系统 — 开发实施任务拆解表

> 口径来源：`需求说明规格书.md`（v1.19）、`生产任务管理模型.md`（v1.19）、`项目框架结构.md`（v1.19）
> 用途：作为动态项目类型、计量单位、同质/异质任务、工作量与进度规则、质检闭环与外部系统协同规则改造的实施指导清单

---

## 一、实施目标

本次实施围绕以下四项核心目标展开：

1. 将项目/任务类型从固定常量升级为动态字典管理。
2. 建立计量单位字典，并要求每个项目类型绑定计量单位。
3. 建立“同质任务 / 异质任务”结构约束及父进度双公式汇聚规则。
4. 完成质检闭环、外部系统完成后 TMS 质检、返修任务与验收回归。

---

## 二、后端任务清单

### 2.1 数据库与迁移

| 优先级 | 任务项 | 输出物 | 验收标准 |
|--------|--------|--------|---------|
| P1 | 新建 `measurement_unit_definitions` 表 | 表结构、唯一索引、启停字段 | 可维护预置单位和自定义单位，名称/编码不可重复 |
| P1 | 初始化预置单位 | 迁移脚本 | 预置 `个 / 平方公里 / 平方米 / 点 / 幅 / 张 / 本` 成功入库 |
| P1 | 新建 `project_type_definitions` 表 | 表结构、外键、索引 | 项目类型可维护编码、名称、说明、来源、启停、绑定计量单位 |
| P1 | 迁移历史任务类型到项目类型字典 | 数据回填脚本 | 历史任务 `type` 均能在字典中找到对应项 |
| P1 | 改造 `tasks.type` 为 `NOT NULL` | DDL 脚本 | 父节点保留类型，不再因有子任务而清空 |
| P1 | 新增 `tasks.composition_mode` 字段 | DDL 脚本 | 可缓存 `HOMOGENEOUS / HETEROGENEOUS` |
| P1 | 改造 `tasks.weight` 为 `DOUBLE DEFAULT 1` | DDL 脚本 | 权重范围 `0.01~100`，支持小数，默认值 `1` |
| P1 | 回填历史 `workload_unit` | 数据修复脚本 | 历史任务工作量单位与项目类型绑定关系一致 |
| P1 | 修复历史非法权重 | 数据修复脚本 | 空值或非法值统一修复为合法范围 |
| P1 | 新增 `tasks.in_progress_completed_workload` 字段 | DDL 脚本 | DOUBLE 默认 0，跟踪 IN_PROGRESS 状态下已完成但尚未提交质检的工作量（v1.17） ✅ 已完成——V28 迁移脚本已补齐 |
| P2 | 建立项目类型引用统计 | 字段或统计视图 | 支持删除前引用校验 |
| P2 | 扫描异常任务树结构 | 审计 SQL / 脚本 | 能识别“半同半异”父节点和同类型分散问题 |

> 当前状态（2026-05-14）：2.1 全部 P1 任务已完成——`measurement_unit_definitions` / `project_type_definitions` 建表、预置单位初始化（含 V11/V13 扩展）、`tasks.composition_mode` 增补与回填（V8/V10）、`tasks.weight` 改为 DOUBLE PRECISION DEFAULT 1（V8→V20）、`tasks.type NOT NULL` 收紧（V9）、历史类型回填（V9）、`workload_unit` 回填（V9）、非法权重修复（V8/V10）、`tasks.in_progress_completed_workload` 字段迁移（V28）。P2 任务中引用统计已通过 `reference_count` 字段部分完成，异常树结构审计脚本尚未开发。

### 2.2 字典管理能力

| 优先级 | 任务项 | 输出物 | 验收标准 |
|--------|--------|--------|---------|
| P1 | 实现项目类型管理接口 | `ProjectTypeController`、Service、Repository | 支持增删改查、启停、引用校验 |
| P1 | 实现计量单位管理接口 | `MeasurementUnitController`、Service、Repository | 支持增删改查、启停、唯一性校验 |
| P1 | 类型与单位联动校验 | Service 逻辑 | 项目类型必须绑定计量单位 ⚠️ **架构变更**：V14 迁移已删除 `measurement_unit_code` 列，当前项目类型与计量单位解耦；需重新设计联动方案 |
| P1 | 删除前引用校验 | Service 逻辑 | 已引用类型不可删除，只可停用 |
| P2 | 类型字典缓存 | Cache 或本地缓存层 | 高频查询场景下性能稳定 |

> 当前状态（2026-05-14）：已完成项目类型和计量单位的 Controller / Service / Repository 实现，支持列表、新增、编辑、启停和删除前引用校验（`referenceCount` 检查）。⚠️ 「类型与单位联动校验」因 V14 迁移删除了 `measurement_unit_code` 列而无法按原设计实现，需重新确定联动方案。`TaskTypeServiceImpl` 已使用 `@Cacheable` 实现缓存，`ProjectTypeServiceImpl` 尚未添加缓存。

### 2.3 任务域规则改造

| 优先级 | 任务项 | 输出物 | 验收标准 |
|--------|--------|--------|---------|
| P1 | 改造任务创建接口 | DTO、Service | 创建任务时校验动态类型并自动带出默认单位 |
| P1 | 改造任务更新接口 | DTO、Service | 支持任务后续修改工作量、类型、权重 |
| P1 | 实现任务树结构约束校验 | `TaskTreeConstraintService` | 直接子任务必须“全同或全异” |
| P1 | 实现同类型归集校验 | Validator / Service | 同类型任务不能散落到多个兄弟目录 |
| P1 | 实现 `composition_mode` 自动判定 | Service | 子任务增删改移动后父节点模式自动更新 |
| P1 | 实现同质任务工作量规则 | Service | 父已填工作量时，子工作量总和必须一致 ⚠️ **部分实现**：`validateHomogeneousChildWorkloadRequired()` 子任务必填为强制校验；`validateHomogeneousParentWorkload()` 父子一致性仅 warn 不阻断 |
| P1 | 实现父工作量动态汇总 | Service | 父未填工作量时，由子任务自动汇总 |
| P1 | 重构父进度汇聚逻辑 | `TaskProgressAggregationService` | 同质/异质任务分别使用不同公式 |
| P1 | 叶子任务进度来源兼容 | 回调/手工录入逻辑 | 无子任务节点仍可由外部系统回传或人工录入进度 |
| P1 | 改造叶子节点进度公式 | `ProgressCalculationHelper` | 进度公式从 `IN_PROGRESS量 × w_ip` 改为 `inProgressCompletedWorkload × w_ip`；IN_PROGRESS 未完成部分权重为 0（v1.17） |
| P1 | 输入完成量同步 inProgressCompletedWorkload | `TaskServiceImpl.submitCompletion` | 操作员累计输入完成量时 `inProgressCompletedWorkload` 同步累加；提交质检时清零；撤销质检时保留；质检不通过时清零并恢复原操作员（v1.19） |
| P1 | 补齐质检状态机与 previousAssigneeId 生命周期 | `TaskServiceImpl.acceptQa/qaApprove/qaReject/revokeQa` | 接收质检写入 previousAssigneeId；通过/不通过后清空；QA_COMPLETING 不通过退回 IN_PROGRESS；QA_COMPLETED 后不允许直接 FAILED 返工 |
| P1 | 新增返修任务规则 | Service / DTO | QA_COMPLETED 后发现问题只能新建返修任务并关联原任务，不直接修改原任务状态 ⚠️ **部分实现**：`TaskServiceImpl` 中已有 `QA_COMPLETED` 后禁止直接 FAILED 的校验，但无独立返修任务创建与关联机制 |
| P2 | 结构化返回公式说明 | DTO 扩展 | 前端可直接展示汇聚公式和计算依据 ✅ 已完成——`ProgressFormula` DTO + `buildProgressFormula()` |

> 当前状态（2026-05-14）：2.3 大部分 P1 任务已完成——任务创建/更新接口已改造（`TaskValidationHelper.validateTypeCodeByCategory()` 实现动态类型校验）；任务树结构约束校验已完成（`validateParentChildTypeConstraint()`）；同类型归集校验已完成（`validateSameTypeAggregation()`）；`composition_mode` 自动判定已完成（`calculateCompositionMode()` + `updateParentCompositionMode()`）；父工作量动态汇总已完成（`recalculateAncestorProgressAndStatus()` 中实现）；同质/异质双公式重算已完成（`ProgressCalculationHelper`）；叶子节点进度公式已改造（`calculateLeafProgress()` 使用 `inProgressCompletedWorkload × w_ip`）；质检状态机与 `previousAssigneeId` 生命周期已完成；`inProgressCompletedWorkload` 同步逻辑已完成。⚠️ 同质任务工作量父子一致性仅 warn 不阻断；返修任务规则仅实现禁止直接 FAILED，无独立返修任务创建机制。P2 结构化公式说明已完成。

### 2.4 外部系统与兼容性

| 优先级 | 任务项 | 输出物 | 验收标准 |
|--------|--------|--------|---------|
| P1 | 改造外部系统注册校验 | Service | `supportedTaskTypes` 引用启用状态的任务类型编码 ✅ 已完成——`ExternalSystemService.register()` 调用 `TaskTypeService.validateTypeCodeUsable()` 校验每个类型编码存在且启用 |
| P1 | 支持同一任务类型多外部系统注册 | Service | 同一任务类型可绑定多个外部系统，调度时按配置或任务绑定关系选择目标系统 ✅ 已完成——`ExternalSystemRegistrationRepository.findAllBySupportedTaskType()` 返回 List；`ExternalSystemExecutor.resolveSystem()` 按 `task.externalSystem` 绑定选择目标系统 |
| P1 | 改造外部系统完成回调 | 回调接口 / Service | 外部系统 COMPLETED 映射为 SUBMITTED_FOR_QA，不直接进入 QA_COMPLETED；TMS 质检通过后才完成 ✅ 已完成——`ExternalSystemExecutor.resolveTaskStatus()` 将 COMPLETED 映射为 SUBMITTED_FOR_QA |
| P1 | 兼容历史任务读取 | Repository / Service | 历史数据升级后可正常读取、编辑、分发 |
| P2 | 完善操作日志 | AOP / Log | 类型变更、结构阻断、公式重算可审计 |

### 2.5 后端测试任务

| 优先级 | 任务项 | 输出物 | 验收标准 |
|--------|--------|--------|---------|
| P1 | 迁移脚本测试 | Flyway/H2 测试 | 迁移可重复执行且结果正确 ⚠️ **未实现** |
| P1 | 项目类型服务测试 | 单元测试 | 覆盖新增、编辑、删除、停用、引用校验 ✅ 已完成——`ProjectTypeAndMeasurementUnitServiceTest` |
| P1 | 计量单位服务测试 | 单元测试 | 覆盖预置单位保护、重复校验 ✅ 已完成——同上 |
| P1 | 任务树约束测试 | 单元/集成测试 | 覆盖全同、全异、混合结构阻断 ✅ 已完成——`TaskTreeConstraintAndProgressTest` |
| P1 | 双公式进度测试 | 单元测试 | 覆盖同质与异质父节点计算结果 ✅ 已完成——同上 |
| P1 | 工作量联动测试 | 单元测试 | 覆盖父已填、父未填两种场景；父子差额提示字段完整 ⚠️ **部分完成**——`TaskTreeConstraintAndProgressTest.homogeneousWorkloadMustEqualParent` 覆盖基本场景 |
| P1 | 质检闭环测试 | 单元/集成测试 | 覆盖撤销质检保留完成量、质检不通过清零并恢复原操作员、QA_COMPLETED 后禁止直接返工 ✅ 已完成——`QaClosedLoopTest` 覆盖 acceptQa/qaReject/revokeQa 全链路及权限校验 |
| P1 | 外部系统完成回调测试 | 集成测试 | 覆盖外部 COMPLETED→SUBMITTED_FOR_QA→TMS 质检通过→QA_COMPLETED ✅ 已完成——`ExternalSystemCallbackFullChainTest` 覆盖 updateTask+progress 路径、updateStatusWorkload 路径、QA 通过/不通过全链路、进度增量计算 |

---

## 三、前端任务清单

### 3.1 基础字典页面

| 优先级 | 任务项 | 输出物 | 验收标准 |
|--------|--------|--------|---------|
| P1 | 新增项目类型管理页 | `ProjectTypeManagementPage.tsx` | 支持列表、筛选、分页、新增、编辑、启停、删除 ✅ 已完成 |
| P1 | 新增项目类型编辑弹窗 | `ProjectTypeEditModal.tsx` | 支持编码、名称、说明、计量单位、状态维护 ⚠️ **实现方式不同**：未创建独立组件，新增/编辑操作以模态对话框方式内联于 `ProjectTypeManagementPage.tsx` |
| P1 | 新增计量单位管理页 | `MeasurementUnitManagementPage.tsx` | 支持预置单位展示、自定义单位管理 ✅ 已完成 |
| P1 | 新增计量单位编辑弹窗 | `MeasurementUnitEditModal.tsx` | 支持编码/名称唯一性校验 ⚠️ **实现方式不同**：未创建独立组件，新增/编辑操作以模态对话框方式内联于 `MeasurementUnitManagementPage.tsx` |
| P1 | 新增类型选择器 | `ProjectTypeSelect.tsx` | 选择类型后可自动带出默认单位 ✅ 已完成 |
| P1 | 新增单位选择器 | `MeasurementUnitSelect.tsx` | 仅展示启用状态单位 ✅ 已完成 |

> 当前状态（2026-05-14）：3.1 全部 P1 任务已完成——`ProjectTypeManagementPage.tsx`、`MeasurementUnitManagementPage.tsx` 两个基础管理页已完成，新增/编辑操作以模态对话框方式内联实现；`ProjectTypeSelect.tsx`、`MeasurementUnitSelect.tsx` 表单联动组件已完成并集成到 `ProjectEditModal.tsx` 和 `TaskEditModal.tsx`。编辑弹窗未创建独立组件，采用内联模态框实现。

### 3.2 任务建模与任务树

| 优先级 | 任务项 | 输出物 | 验收标准 |
|--------|--------|--------|---------|
| P1 | 改造项目创建弹窗 | 表单组件 | 支持选择项目类型并自动带出单位 ✅ 已完成——`CreateProjectModal.tsx` + `ProjectEditModal.tsx` 集成 `ProjectTypeSelect` |
| P1 | 改造任务创建/编辑弹窗 | 表单组件 | 所有项目/任务均可填写工作量和权重；叶子节点进度字段只读（由工作量驱动）；`inProgressWeight` 输入支持两位小数（v1.17） ✅ 已完成——`TaskEditModal.tsx` 进度字段 disabled + 提示文案；`inProgressWeight` 输入 step=0.01 |
| P1 | 改造任务树页 | `TaskTreePage.tsx` | 展示层级结构、类型、同质/异质标签 ✅ 已完成——`TaskTreeView.tsx` + `KanbanBoard.tsx` 展示层级结构和 `compositionMode` 标签 |
| P1 | 增加父节点结构标识 | `CompositionModeBadge.tsx` | 明确展示 `同质任务 / 异质任务` ✅ 已完成 |
| P1 | 增加拖拽和移动校验提示 | 树组件逻辑 | 非法结构在前端保存前即可提示 ⚠️ **未实现**——无拖拽功能 |
| P1 | 实现同类型归集前端预校验 | Hook / 校验器 | 同类型任务分散时给出阻断提示 ✅ 已完成——`useTaskConstraintChecks.ts` |

### 3.3 进度与工作量展示

| 优先级 | 任务项 | 输出物 | 验收标准 |
|--------|--------|--------|---------|
| P1 | 新增进度公式卡片 | `ProgressFormulaCard.tsx` | 展示当前父节点的汇聚公式、计算过程和结果 ✅ 已完成——`ProgressFormulaCard.tsx` + `LeafProgressFormulaCard.tsx` |
| P1 | 新增工作量一致性提示 | `WorkloadConsistencyAlert.tsx` | 同质任务工作量不一致时阻断并提示子节点合计、父节点工作量、差额和建议调整方向 ✅ 已完成——`WorkloadConsistencyAlert.tsx` 组件集成到 `KanbanBoard.tsx`，展示工作量差额和权重不一致告警 |
| P1 | 实现同质任务权重告警 | 弹窗或告警组件 | 权重不一致时仅告警，不强制阻断 ✅ 已完成——`WorkloadConsistencyAlert.tsx` 内含权重不一致 warn 级别告警 |
| P1 | 改造任务详情页 | 详情页组件 | 展示工作量、单位、结构类型、外部系统入口 ✅ 已完成——`TaskDetailModal.tsx` 已展示工作量/单位/结构类型/外部系统入口，已集成 `WorkloadConsistencyAlert` |
| P1 | 改造项目详情页 | 详情页组件 | 展示项目树、汇聚公式、分发状态 ✅ 已完成——`ProjectInfoModal.tsx` 已展示项目树/汇聚公式/分发状态/外部系统，已集成 `WorkloadConsistencyAlert` |
| P1 | 彩色进度条 IN_PROGRESS 双色段与宽度口径 | `ColorProgressBar.tsx` | IN_PROGRESS 绿色段细分为深绿（可提交质检）和浅绿（进行中）两个子段；同质节点按工作量比例、异质节点按直接子节点权重比例计算颜色段宽度（v1.19） ✅ 已完成 |
| P1 | 管理看板项目详情工作量只读 | `TaskDetailModal.tsx` | 项目详情弹窗中各状态工作量只读，不提供编辑和保存功能（v1.17） ✅ 已完成——`ProjectInfoModal.tsx` 纯展示无输入控件 |
| P1 | 页面刷新保持树状态 | `useTaskTreeStore.ts` | expandedIds 和 selectedNodeId 持久化到 localStorage，刷新后恢复；选中节点自动展开祖先路径（v1.17） ✅ 已完成 |

> 当前状态（2026-05-14）：3.3 全部 P1 任务已完成——进度公式卡片已完成（`ProgressFormulaCard.tsx` + `LeafProgressFormulaCard.tsx`）；工作量一致性提示已完成（`WorkloadConsistencyAlert.tsx` 集成到 `KanbanBoard.tsx` + `TaskDetailModal.tsx` + `ProjectInfoModal.tsx`）；同质任务权重告警已完成（`WorkloadConsistencyAlert.tsx` 内含 warn 级别告警）；任务详情页和项目详情页已集成 `WorkloadConsistencyAlert`；彩色进度条 IN_PROGRESS 双色段已完成；页面刷新保持树状态已完成。

### 3.4 前端接口与状态管理

| 优先级 | 任务项 | 输出物 | 验收标准 |
|--------|--------|--------|---------|
| P1 | 封装项目类型接口 | `projectTypeApi.ts` | 支持项目类型增删改查、启停 ✅ 已完成——`projectTypeService.ts` |
| P1 | 封装计量单位接口 | `measurementUnitApi.ts` | 支持计量单位增删改查、启停 ✅ 已完成——`measurementUnitService.ts` |
| P1 | 封装任务树接口 | `taskTreeApi.ts` | 支持树查询、节点移动、校验 ✅ 已完成——`taskTreeApi.ts` |
| P1 | 新增项目类型缓存 Store | `useProjectTypeStore.ts` | 表单打开时可快速加载类型和默认单位 ✅ 已完成 |
| P1 | 新增任务树状态 Store | `useTaskTreeStore.ts` | 管理展开状态、过滤条件、节点选中状态 ✅ 已完成 |
| P1 | 新增约束校验 Hook | `useTaskConstraintChecks.ts` | 统一处理结构、权重、工作量等校验 ✅ 已完成 |
| P2 | 新增公式渲染 Hook | `useProgressFormula.ts` | 根据后端结构化字段输出可读公式 ⚠️ **未实现**——`ProgressFormulaCard` 组件直接渲染，未抽取独立 Hook |

### 3.5 前端测试任务

| 优先级 | 任务项 | 输出物 | 验收标准 |
|--------|--------|--------|---------|
| P1 | 项目类型表单测试 | 单元测试 | 覆盖必填、唯一性、绑定单位校验 ⚠️ **未实现**——无独立表单测试，`ProjectTypeSelect.test.tsx` 仅覆盖选择器组件 |
| P1 | 计量单位表单测试 | 单元测试 | 覆盖预置单位保护和重复校验 ⚠️ **未实现**——无独立表单测试，`MeasurementUnitSelect.test.tsx` 仅覆盖选择器组件 |
| P1 | 任务结构校验测试 | 单元测试 | 覆盖全同、全异、混合结构阻断 ✅ 已完成——`useTaskConstraintChecks.test.ts` |
| P1 | 进度公式展示测试 | 组件测试 | 覆盖同质/异质两套展示 ✅ 已完成——`ProgressFormulaCard.test.tsx` |
| P1 | 工作量一致性测试 | 组件测试 | 覆盖阻断提示、自动汇总提示与差额展示 ✅ 已完成——`WorkloadConsistencyAlert.test.tsx` 覆盖超出/不足/权重不一致/异质不告警等 8 个用例 |
| P1 | 彩色进度条口径测试 | 组件测试 | 覆盖同质按工作量、异质按权重比例计算颜色段宽度 ✅ 已完成——`ColorProgressBar.test.tsx` 覆盖段比例、IN_PROGRESS 双色段拆分、_inProgressCompletedWorkloadForBar 优先级、cap 逻辑、compact 模式等 8 个用例 |

---

## 四、联调与验收清单

### 4.1 接口联调

| 优先级 | 联调项 | 参与方 | 验收标准 |
|--------|--------|--------|---------|
| P1 | 项目类型管理接口联调 | 前端 + 后端 | 页面可正常增删改查、启停、删除校验 |
| P1 | 计量单位管理接口联调 | 前端 + 后端 | 预置单位、自定义单位、启停逻辑正确 |
| P1 | 任务创建/更新接口联调 | 前端 + 后端 | 选择类型后单位自动带出，保存规则正确 |
| P1 | 任务树约束接口联调 | 前端 + 后端 | “全同/全异/混合结构”反馈一致 |
| P1 | 任务详情数据联调 | 前端 + 后端 | 工作量、单位、结构模式、公式展示字段齐全 |

> 当前状态（2026-05-14）：项目类型和计量单位接口已具备联调条件；任务创建/更新、任务树约束、详情公式相关联调尚未开始。

### 4.2 规则验收

| 优先级 | 验收项 | 验收方式 | 验收标准 |
|--------|--------|---------|---------|
| P1 | 项目类型动态管理 | 页面验收 | 可新增、编辑、停用、删除未引用类型 |
| P1 | 计量单位唯一性 | 页面 + 接口验收 | 编码/名称不可重复 |
| P1 | 父节点保留类型 | 数据验收 | 有子任务的项目/任务仍保留 `type` |
| P1 | 权重规则 | 页面 + 数据验收 | 权重只允许 `0.01~100`，支持小数，默认 `1` |
| P1 | 同质任务权重告警 | 交互验收 | 不同权重时提示告警但不阻断 |
| P1 | 同质任务工作量一致性 | 页面 + 数据验收 | 父已填工作量时子任务总和必须一致；不一致时展示子节点合计、父节点工作量、差额和调整方向 |
| P1 | 父工作量自动汇总 | 数据验收 | 父未填工作量时可由子任务动态汇总 |
| P1 | 同质任务进度计算 | 公式验收 | 按 `权重 × 工作量 × 进度` 计算正确 |
| P1 | 异质任务进度计算 | 公式验收 | 按 `权重 × 进度` 计算正确 |
| P1 | 同类型归集规则 | 结构验收 | 同类型任务不允许分散在多个兄弟目录 |

### 4.3 历史数据与兼容性验收

| 优先级 | 验收项 | 验收方式 | 验收标准 |
|--------|--------|---------|---------|
| P1 | 历史任务类型迁移 | 数据验收 | 历史任务均映射到项目类型字典 |
| P1 | 历史工作量单位回填 | 数据验收 | 历史任务单位正确、无丢失 |
| P1 | 历史权重修复 | 数据验收 | 空权重和非法权重全部修正 |
| P1 | 外部系统注册兼容 | 接口回归 | `supportedTaskTypes` 引用启用任务类型；同一任务类型可注册多个外部系统 |
| P1 | 叶子任务进度兼容 | 场景验收 | 外部系统进度回调映射为 SUBMITTED_FOR_QA/RECEIVED 后父节点可正常重算；外部 COMPLETED 仍需 TMS 质检 |

### 4.4 权限与审计验收

| 优先级 | 验收项 | 验收方式 | 验收标准 |
|--------|--------|---------|---------|
| P2 | 字典管理权限 | 权限验收 | 非授权用户不可维护项目类型和计量单位 |
| P2 | 任务结构修改权限 | 权限验收 | 非授权用户不可调整任务树结构 |
| P2 | 审计日志 | 日志验收 | 类型变更、单位变更、结构阻断、公式重算均有记录 |

### 4.5 场景化验收样例

| 编号 | 场景 | 验收重点 |
|------|------|---------|
| A1 | 同质项目 | 子任务同类型，权重与工作量参与父进度计算 |
| A2 | 异质项目 | 子任务不同类型，仅权重参与父进度计算 |
| A3 | 历史项目迁移 | 旧任务升级后类型、单位、权重均可正常读取 |
| A4 | 外部系统回调 | 外部进度映射为 SUBMITTED_FOR_QA/RECEIVED，外部 COMPLETED 后仍需 TMS 质检，父节点逐级重算正确 |
| A5 | 非法树结构拦截 | “半同半异”结构和同类型分散场景被正确阻断 |
| A6 | QA_COMPLETED 后返修 | 已质检完成任务发现问题时新建返修任务，原任务不直接 FAILED/IN_PROGRESS |

---

## 五、建议实施顺序

### 阶段一：后端基础改造

1. 落库表和迁移脚本。
2. 完成历史数据回填与修复。
3. 完成项目类型、计量单位管理接口。
4. 完成任务树约束和进度汇聚服务改造。

### 阶段二：前端功能开发

1. 开发项目类型和计量单位管理页。
2. 改造项目/任务表单和任务树。
3. 补充详情页中的结构标识、公式卡片和告警交互。

### 阶段三：联调与回归

1. 联调字典接口、任务接口、任务树接口。
2. 回放历史数据并执行兼容性验收。
3. 执行权限、审计、外部系统回调回归。

---

## 六、交付完成判定

满足以下条件时，视为本轮实施完成：

- 动态项目类型管理和计量单位管理功能可用。
- 任务树满足“全同或全异”与同类型归集规则。
- 权重规则切换为 `0.01~100` 且默认 `1`。
- 同质/异质任务双公式进度计算生效。
- 历史数据迁移完成，外部系统注册与回调链路回归通过。
- 前后端联调完成，并通过场景化验收。
