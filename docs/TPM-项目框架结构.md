# 生产协同系统 — 项目框架结构

> 口径来源：以《需求说明规格书》v1.20、《生产任务管理模型》v1.20 为基准。本文档仅做架构与实施层面的细化解释。

## 一、系统定位

通用地理信息协同生产任务管理系统，当前对接 **DOM 正射影像桥梁去除** 业务。系统通过外部系统注册机制实现公共层与业务层分离，支持多类型生产流程对接。

核心公共能力：任务 CRUD、状态流转、依赖管理、权限管控、日志审计、外部系统注册、项目/任务类型字典管理、计量单位字典管理。
业务扩展方式：外部系统通过 API 注册 → 任务分发 → 状态同步回调。

---

## 二、四模块架构

```
生产协同系统/
├── task-dashboard/              ← 通用管理前端（React SPA）
├── bridge-dashboard/            ← 桥梁去除前端（独立 React SPA，直连 bridge-removal-service）
├── task-management-service/     ← 后端（Spring Boot，公共层）
└── bridge-removal-service/      ← 桥梁去除业务服务（Python Flask，独立外部系统）
```

### 模块职责

| 模块 | 职责 | 边界 |
|------|------|------|
| **task-dashboard** | 通用管理交互层。负责任务看板（含叶子节点状态操作按钮：接收/指派/分解/撤销/开始处理/输入完成量）、管理仪表盘、作业工作台、质检交互（质检角色定制看板、Q 图标标识、质检推送）、项目/任务类型管理、计量单位管理、项目下达（含备注与附件）、叶子节点工作量流转录入、彩色进度条展示（叶子/非叶子节点均按同口径从子孙叶子聚合；IN_PROGRESS 双色段：深绿=可提交质检、浅绿=进行中未完成；非叶子节点使用 `_inProgressCompletedWorkloadForBar` 显示专用字段避免聚合口径不一致）、权限驱动按钮与列可见性、项目详情工作量只读、页面刷新保持树状态（选中节点自动展开祖先路径）。展示所有外部系统的项目概览 | 不包含任何业务操作界面，不直接调用 bridge-removal-service |
| **bridge-dashboard** | 桥梁去除专用交互层。负责项目管理、定位、掩膜、修复、合并等全部桥梁去除操作界面 | 直连 bridge-removal-service，不经过 task-management-service 代理 |
| **task-management-service** | 业务编排层（公共层）。负责任务生命周期管理（CRUD、状态机、依赖链）、项目/任务类型字典、计量单位字典、同质/异质进度汇聚、非叶子节点状态推导、叶子节点瀑布式工作量流转、叶子节点看板操作（接收/指派/分解/撤销/开始处理/输入完成量）、质检推送与质检角色视图、根项目自动流转链（PENDING_ACCEPTANCE/ACCEPTANCE_COMPLETED/ARCHIVED 仅根项目）、权限控制、日志审计、SSO认证对接、外部系统注册。通过 HTTP 分发任务给外部系统，通过回调接收状态同步 | 不直接执行任何业务算法，不包含业务 Controller/Service/Model |
| **bridge-removal-service** | 桥梁去除业务服务（独立外部系统）。负责全部桥梁去除业务逻辑：项目分解、影像处理算法执行（SAM2 分割、掩膜生成、重叠修复、结果合并等）、用户操作界面服务。以 Flask HTTP 服务形式运行，支持 SSO 登录 + 本地登录 fallback，拥有独立数据存储 | **可独立运行**：task-management-service 不可用时，任务上报/接收功能降级，桥梁去除项目核心功能不受影响。代理 UPM 用户/部门接口（直连 UPM），UPM 不可用时返回错误 |

### 模块间调用关系

```
┌──────────────────┐     ┌──────────────────────┐
│  task-dashboard  │     │  bridge-dashboard     │
│  (通用管理 UI)    │     │  (桥梁去除 UI)        │
│  - 看板/仪表盘   │     │  - 项目管理/定位/修复  │
│  - 类型字典管理   │     │  - 掩膜/合并/文件      │
│  - 项目下达       │     │                      │
│  - 任务 CRUD     │     │                      │
└────────┬─────────┘     └──────────┬────────────┘
         │                          │
         ▼                          ▼
┌──────────────────┐     ┌──────────────────────┐
│ task-management- │     │ bridge-removal-      │
│ service (Java)   │     │ service (Python)     │
│                  │     │                      │
│ - 任务 CRUD      │     │ - 项目分解/子任务管理 │
│ - 类型字典       │     │ - 定位/掩膜/修复/合并 │
│ - 状态机/依赖    │     │ - 文件存储/下载       │
│ - 进度汇聚       │     │ - SSO 登录 + 本地登录 │
│ - 认证/鉴权      │     │ - UPM 用户/部门代理   │
│ - 外部系统注册   │     │                      │
│  交互协议：       │     │                      │
│ ──分发任务──────→│     │                      │
│ ←──状态回调──────│     │                      │
└──────────────────┘     └──────────┬───────────┘
                                    │ UPM 代理
                                    ▼
                         ┌──────────────────────┐
                         │ UPM / user-service    │
                         │ (用户/部门/角色)       │
                         └──────────────────────┘
```

**说明**：bridge-dashboard 直连 bridge-removal-service 处理全部业务操作和用户/部门查询，不直连 task-management-service。

---

## 三、前端架构

### 3.1 双前端架构

| 应用 | 入口 | 路由器 | 布局 | API 后端 | 用途 |
|------|------|--------|------|----------|------|
| 通用管理 | App.tsx + main.tsx | BrowserRouter | Layout | task-management-service (:8082) | 任务看板、管理仪表盘、作业工作台、质检中心、类型字典管理、项目下达 |
| 桥梁去除 | BridgeApp.tsx + bridge-main.tsx | HashRouter | BridgeLayout | bridge-removal-service (:5050) | 桥梁去除全流程：项目管理 → 定位 → 掩膜 → 修复 → 合并 |

### 3.2 通用管理前端（task-dashboard）

#### 技术栈

| 类别    | 选型                                     |
| ------- | ---------------------------------------- |
| 框架    | React 18 + TypeScript 5                  |
| 构建    | Vite 6                                   |
| 路由    | react-router-dom 7                       |
| 状态    | zustand 5（轻量 store）+ Context（认证） |
| 请求    | axios 1                                  |
| 样式    | Tailwind CSS 3 + PostCSS + autoprefixer  |
| 拖拽    | react-beautiful-dnd（看板）              |
| 图标    | lucide-react                             |

#### 核心页面组件

```
components/
├── auth/                    # 认证
│   ├── LoginForm.tsx        # 通用登录
│   └── RoleBasedRoute.tsx   # 角色路由守卫
├── settings/                # 基础字典
│   ├── ProjectTypeManagementPage.tsx   # 项目类型管理（13 种服务领域）
│   ├── TaskTypeManagementPage.tsx      # 任务类型管理（5 组 30 种工序，含分组筛选）
│   └── MeasurementUnitManagementPage.tsx # 计量单位管理（5 基本计量单位 + 8 派生计量单位 + 自定义）
├── common/                  # 通用选择器
│   ├── ProjectTypeSelect.tsx      # 项目类型选择器（仅项目类型）
│   ├── TaskTypeSelect.tsx         # 任务类型选择器（分组→工序级联）
│   └── MeasurementUnitSelect.tsx  # 计量单位选择器
├── kanban/                  # 任务看板
│   ├── KanbanBoard.tsx      # 看板主视图（含树选中联动泳道、泳道列可见性配置、权限驱动列可见性）
│   ├── TaskCard.tsx / TaskColumn.tsx  # 卡片/列（叶子节点卡片显示工作量+操作按钮）
│   ├── TaskDetailModal.tsx  # 任务详情（工作量/单位/结构类型/外部系统入口）
│   ├── TaskEditModal.tsx    # 任务编辑（含类型选择器、权重 0.01~100、叶子节点工作量流转录入）
│   ├── ProjectEditModal.tsx # 项目创建/编辑（工作量必填、备注、附件上传、质检部门/人员指定）
│   ├── ProjectInfoModal.tsx # 项目详情（项目树、汇聚公式、分发状态、结构类型、层级深度）
│   ├── ProgressFormulaCard.tsx    # 进度汇聚公式卡片（同质/异质公式、贡献明细、告警）
│   ├── StatusWorkloadEditor.tsx   # 叶子节点分状态工作量编辑（瀑布扣减、守恒校验）
│   ├── ColorProgressBar.tsx       # 彩色进度条（叶子/非叶子均按同口径从子孙叶子聚合，IN_PROGRESS 双色段，_inProgressCompletedWorkloadForBar 显示专用字段，点击弹出详情）
│   ├── CompositionModeBadge.tsx   # 同质/异质标识（sm/md 尺寸）
│   ├── CreateChildTaskModal.tsx   # 子任务创建（深度校验、类型选择、约束预校验）
│   ├── DecomposeModal.tsx         # 分解操作弹窗（输入数量→均分→可编辑分配表→创建同质子任务）
│   ├── AssignModal.tsx            # 指派弹窗（负责部门/人+质检部门/人）
│   ├── SubmitCompletionModal.tsx   # 输入完成量弹窗（进行中→提交质检工作量流转）
│   ├── ActionAttachmentsPanel.tsx  # 操作附件面板（指派/质检操作附件上传/链接/继承/下载）
│   └── QBadge.tsx                 # 提交质检任务"Q"图标标识
├── tree/                    # 任务树（多层级管理）
│   └── TaskTreeView.tsx     # 展开/折叠、层级缩进 20px、深度色标、拖拽移动（含深度/结构校验）
├── dashboard/               # 管理员仪表盘
├── workspace/               # 作业员工作台
├── qa/                      # ~~质检中心~~（v1.8 已移除独立 QA_TASK 看板，质检改为主看板状态流转）
├── layout/                  # 布局壳
└── profile/                 # 用户资料
```

#### 前端页面与交互清单

| 模块 | 页面/组件 | 交互说明 |
|------|-----------|---------|
| 基础字典 | 项目类型管理页 | 列表、新增（模态对话框）、编辑（模态对话框）、启停、删除前引用校验。维护编码、名称、说明（不绑定计量单位） |
| 基础字典 | 任务类型管理页 | 左侧分组树 + 右侧类型列表。分组内新增/编辑工序（不绑定计量单位，创建任务时由用户选择） |
| 基础字典 | 计量单位管理页 | 基本计量单位（仅 system:manager 可管理）与派生计量单位（所有用户可创建）分类展示；新增/编辑采用模态对话框；派生单位创建时必须选择基准基本单位并填写换算量；预置单位编码/名称不可编辑 |
| 项目下达 | 项目创建弹窗 | 工作量必填（红色星号），用户选择计量单位，remarks 备注 + 附件上传 |
| 项目下达 | 项目详情页 | 展示项目树、汇聚公式、分发状态、备注内容、附件列表（点击下载） |
| 任务建模 | 任务创建弹窗 | 两步类型选择（分组→工序），workload 可选填（≤0 报错），权重 0.01~100 默认 1 |
| 任务建模 | 任务编辑弹窗 | 叶子节点：分状态工作量编辑（瀑布扣减、IN_PROGRESS/SUBMITTED_FOR_QA/QA_COMPLETED 直接设值）；非叶子节点：状态和进度只读 |
| 任务建模 | 任务树视图 | 展开/折叠、层级缩进、深度色标、拖拽移动（含深度限制+循环引用+结构校验+视觉反馈）、hover 显示完整名称 |
| 任务建模 | 子任务创建弹窗 | 深度校验、类型选择、`useTaskConstraintChecks` 集成 |
| 进度管理 | 任务/项目详情 | 展示同质/异质标识、进度汇聚公式、权重、工作量、子节点贡献明细；非叶子节点显示彩色进度条（同质按工作量比例、异质按直接子节点权重比例；灰=PENDING，红=ASSIGNED+RECEIVED，浅绿=IN_PROGRESS未完成，深绿=IN_PROGRESS已完成/可提交质检，青=SUBMITTED_FOR_QA+QA_COMPLETING，蓝=QA_COMPLETED+COMPLETED+ARCHIVED），点击显示各状态叶子节点数量和工作量分布 |
| 进度管理 | 进度公式卡片 | 同质/异质公式展示、缺失工作量告警、同质子任务不同权重告警；点击进度条弹出模态框 |
| 进度管理 | 叶子节点工作量编辑 | 分状态工作量直接设值（IN_PROGRESS/SUBMITTED_FOR_QA/QA_COMPLETED），系统自动扣减上游，守恒校验 |
| 泳道配置 | 泳道列可见性 | 工具栏齿轮入口，复选框多选状态列，localStorage 持久化；无 `department:manager` 权限时自动隐藏"已指派"列 |
| 跳转协同 | 外部系统跳转 | 任务详情展示 `dashboardUrl` 入口，新窗口跳转，SSO 互通免登录 |
| 叶子节点看板 | 待处理状态操作 | 状态卡显示工作量+计量单位；"接收"按钮（task:execute）→全部工作量 PENDING→RECEIVED；"指派"按钮（department:manager）→弹出指派表单→ASSIGNED；"分解"按钮（department:manager 或 department:create）→弹出分解流程→批量创建同质子任务 |
| 叶子节点看板 | 已指派状态操作 | "撤销"按钮（指派人/department:manager）→恢复 PENDING；被指派人接收后不可撤销 |
| 叶子节点看板 | 已接收状态操作 | "开始处理"按钮（task:execute）→IN_PROGRESS |
| 叶子节点看板 | 进行中状态操作 | "输入完成量"按钮（task:execute）→弹出输入框→完成量在 IN_PROGRESS 中累计记录，`inProgressCompletedWorkload` 同步累加；完成量=总工作量时按钮变为"提交质检"→IN_PROGRESS→SUBMITTED_FOR_QA，`inProgressCompletedWorkload` 清零。进度字段只读（由工作量驱动） |
| 叶子节点看板 | 提交质检状态 | 右上角"Q"图标标识；未指定质检员→推送给质检部门负责人（department:manager），负责人可在 ASSIGNED 列指派或撤销；已指定质检员→推送给该质检员，出现在 PENDING 列 |
| 叶子节点看板 | 外部系统叶子节点 | 关联外部系统的叶子节点状态由外部系统推送；外部 COMPLETED 映射为 SUBMITTED_FOR_QA，仍需 TMS 质检员接收并通过后才进入 QA_COMPLETED；看板不提供生产操作按钮 |
| ~~质检看板~~ | ~~质检任务独立看板~~（v1.8 已移除） | ~~QA_TASK 看板已移除，质检员在主看板 SUBMITTED_FOR_QA 状态列操作源任务：通过→QA_COMPLETING→QA_COMPLETED，退回→IN_PROGRESS（清零完成量+恢复assigneeId）~~ |
| 权限驱动 | 按钮可见性 | 操作按钮根据用户权限决定是否显示：接收/开始处理/输入完成量/提交质检/撤回质检=task:execute；指派/撤销=department:manager；分解=department:manager 或 department:create；质检通过/退回=quality:check |
| 权限驱动 | 列可见性 | 无 `department:manager` 权限的用户看板不显示"已指派"状态列 |
| 分解操作 | 分解弹窗 | 输入子任务数量→均分工作量→可编辑分配表→确认校验总和=父工作量+子任务名称唯一→批量创建同质子任务；列根据权限动态显示：执行部门/质检部门（department:create 可见）、执行人/质检人（department:manager 可见）；无 department:create 权限时后端强制填写执行部门和质检部门为当前用户所属部门（忽略前端传值）；人员选择约束：有 department:create 时按所选部门过滤，无 department:create 时限定为当前用户所属部门；执行部门或执行人相同时显示警告提示 |

#### 前端路由

| 路由 | 组件 | 说明 |
|------|------|------|
| `/settings/project-types` | `ProjectTypeManagementPage.tsx` | 项目类型字典管理 |
| `/settings/task-types` | `TaskTypeManagementPage.tsx` | 任务类型字典管理（含分组） |
| `/settings/measurement-units` | `MeasurementUnitManagementPage.tsx` | 计量单位字典管理 |
| `/tasks/tree` | `TaskTreePage.tsx` | 多层级任务树集中管理 |
| `/tasks/:id` | `TaskDetailModal.tsx` | 任务详情 |
| `/projects/:id` | `ProjectInfoModal.tsx` | 项目详情 |

#### 前端接口封装

| 模块 | 文件 | 说明 |
|------|------|------|
| 项目类型 | `projectTypeService.ts` | CRUD、启停、引用校验 |
| 任务类型 | `taskTypeService.ts` | CRUD、启停、按分组查询 |
| 任务类型分组 | `taskTypeGroupService.ts` | 分组 CRUD |
| 计量单位 | `measurementUnitService.ts` | CRUD、启停、基本单位查询 |
| 任务树 | `taskTreeApi.ts` | 树查询、节点移动、结构校验 |
| 工作量流转 | `statusWorkloadService.ts` | 分状态工作量设值、瀑布扣减、叶子节点进度查询 |
| 叶子节点操作 | `taskActionService.ts` | 接收、指派、分解、撤销指派、开始处理、输入完成量 |
| 附件 | `attachmentService.ts` | 上传、删除、列表 |
| 操作附件 | `actionAttachmentService.ts` | 指派/质检操作附件上传、链接、继承、列表、下载 |

#### 前端状态管理

| 模块 | 文件 | 说明 |
|------|------|------|
| 项目类型缓存 | `useProjectTypeStore.ts` | 缓存可用类型和默认单位映射，5 分钟 TTL |
| 任务树状态 | `useTaskTreeStore.ts` | 展开状态、选中节点，localStorage 持久化（expandedIds + selectedNodeId，刷新恢复） |
| 任务约束校验 | `useTaskConstraintChecks.ts` | 深度、全同全异、工作量、权重统一校验 |
| 泳道配置 | `useStatusLaneConfig.ts` | 泳道状态列可见性，localStorage 持久化 |
| 工作量流转 | `useStatusWorkload.ts` | 叶子节点分状态工作量编辑、瀑布扣减计算、守恒校验 |
| 用户权限 | `useUserPermissions.ts` | 当前用户权限列表（task:execute、department:manager、quality:check 等），驱动按钮可见性与列可见性 |

#### 当前实施进度（2026-05-12）

- 已落地页面：`/settings/project-types`、`/settings/measurement-units`、`/settings/task-types`
- 已落地组件：`ProjectTypeManagementPage.tsx`、`MeasurementUnitManagementPage.tsx`、`TaskTypeManagementPage.tsx`、`TaskTreeView.tsx`、`CreateChildTaskModal.tsx`、`CompositionModeBadge.tsx`、`ProgressFormulaCard.tsx`、`KanbanBoard.tsx`（含泳道联动 + 列配置）、`TaskTypeSelect.tsx`（分组→工序级联）、`StatusWorkloadEditor.tsx`（叶子节点分状态工作量编辑）、`ColorProgressBar.tsx`（彩色进度条）、`LeafProgressFormulaCard.tsx`（叶子进度公式卡片）、`AssignModal.tsx`（指派弹窗）、`DecomposeModal.tsx`（分解弹窗）、`SubmitCompletionModal.tsx`（输入完成量弹窗）、`ActionAttachmentsPanel.tsx`（操作附件面板）
- 已落地接口封装：`projectTypeService.ts`、`measurementUnitService.ts`、`taskTreeApi.ts`、`taskTypeService.ts`、`taskTypeGroupService.ts`、`attachmentService.ts`、`statusWorkloadService.ts`、`taskActionService.ts`、`actionAttachmentService.ts`
- 已落地 hook/store：`useProjectTypeStore.ts`、`useTaskTreeStore.ts`、`useTaskConstraintChecks.ts`、`useStatusLaneConfig.ts`、`useStatusWorkload.ts`、`useUserPermissions.ts`
- 已落地表单联动：`ProjectEditModal.tsx`、`TaskEditModal.tsx` 已接入 `ProjectTypeSelect` + `MeasurementUnitSelect`
- v1.13 已落地：计量单位层级体系（基本/派生单位、换算量）、类型字典移除计量单位列
- v1.14 已落地：两步质检流程（SUBMITTED_FOR_QA→QA_COMPLETING→QA_COMPLETED）、质检推送与角色视图、Q 图标标识、撤回质检（仅 SUBMITTED_FOR_QA 可撤回）
- v1.15 已落地：非叶子节点状态推导（混合状态→null）、彩色进度条、根项目自动流转链（PENDING_ACCEPTANCE/ACCEPTANCE_COMPLETED/ARCHIVED）
- v1.16 已落地：操作附件（ASSIGN/SUBMIT_QA 操作附件上传/链接/继承/下载）、附件可见性权限校验（ASSIGN→指派人可见，SUBMIT_QA→质检员/质检部门可见）、IN_PROGRESS 权重默认 0.95
- v1.17 已落地：`inProgressCompletedWorkload` 字段跟踪 IN_PROGRESS 完成量、进度公式改用完成量×权重、彩色进度条 IN_PROGRESS 双色段（深绿=可提交质检、浅绿=进行中）、子任务进度只读、`inProgressWeight` 两位小数精度、管理看板项目详情工作量只读、页面刷新保持树状态（localStorage 持久化 expandedIds + selectedNodeId）
- v1.19 已落地口径：外部系统 COMPLETED 映射为 SUBMITTED_FOR_QA 并仍需 TMS 质检；彩色进度条同质按工作量、异质按权重比例；QA_COMPLETED 后发现问题新建返修任务，不直接 FAILED 返工；同质工作量不一致必须提示差额；previousAssigneeId 质检通过/不通过后清空

#### API 路径约定

| 路径前缀 | 用途 | 说明 |
| -------- | ---- | ---- |
| `/api/tasks/` | 公共任务接口 | CRUD、状态流转、依赖管理、进度查询 |
| `/api/tasks/{id}/receive` | 叶子节点接收 | 全部工作量 PENDING→RECEIVED（需 task:execute 权限） |
| `/api/tasks/{id}/assign` | 叶子节点指派 | 输入负责部门/人+质检部门/人，→ASSIGNED（需 department:manager 权限） |
| `/api/tasks/{id}/decompose` | 叶子节点分解 | 批量创建同质子任务，工作量守恒校验+子任务名称唯一性校验（需 `department:manager` 或 `department:create` 权限） |
| `/api/tasks/{id}/revoke-assignment` | 撤销指派 | 被指派人未接收前可撤销，→PENDING（需 department:manager 权限） |
| `/api/tasks/{id}/start-progress` | 开始处理 | RECEIVED→IN_PROGRESS（需 task:execute 权限） |
| `/api/tasks/{id}/submit-completion` | 输入完成量 | 累计完成量记录在 IN_PROGRESS 中，`inProgressCompletedWorkload` 同步累加；完成量=总工作量时可提交质检（需 task:execute 权限） |
| `/api/tasks/{id}/submit-qa` | 提交质检 | IN_PROGRESS→SUBMITTED_FOR_QA，全部工作量搬移（需 task:execute 权限） |
| `/api/tasks/{id}/qa-approve` | 质检通过 | QA_COMPLETING→QA_COMPLETED，清空 previousAssigneeId（需 quality:check 权限） |
| `/api/tasks/{id}/qa-reject` | 质检退回 | QA_COMPLETING→IN_PROGRESS，清零完成量，assigneeId 恢复原操作员（previousAssigneeId），恢复后清空 previousAssigneeId（需 quality:check 权限） |
| `/api/tasks/{id}/revoke-qa` | 撤回质检 | SUBMITTED_FOR_QA→IN_PROGRESS，保留完成量（再次输入为增量累加）（需 task:execute 权限）；仅 SUBMITTED_FOR_QA 状态可撤回，QA_COMPLETING 及之后不可撤回 |
| `/api/tasks/{id}/status-workload` | 叶子节点工作量流转 | 分状态工作量设值（瀑布扣减）、进度查询 |
| `/api/project-types/` | 项目类型管理 | CRUD、启停 |
| `/api/task-types/` | 任务类型管理 | CRUD、启停、按分组查询 |
| `/api/task-type-groups/` | 任务类型分组管理 | 分组 CRUD |
| `/api/measurement-units/` | 计量单位管理 | CRUD、启停、基本单位查询（`/basic`） |
| `/api/attachments/` | 附件管理 | 上传、下载、删除 |
| `/api/action-attachments/` | 操作附件管理 | 指派/质检操作附件上传、链接、继承、列表、下载（按操作可见性权限校验） |
| `/api/upm/` | 统一用户目录代理接口 | 登录、用户列表、部门列表（由 task-management-service 代理） |
| `/api/sso/` | SSO 认证代理接口 | 获取授权地址、换取会话、会话校验 |
| `/api/external-systems/` | 外部系统注册/查询 | 注册时 supportedTaskTypes 引用 `task_type_definitions.code`；不接收项目类型编码 |

### 3.3 桥梁去除前端（bridge-dashboard）

与通用管理前端技术栈相同，API 客户端直连 bridge-removal-service。

#### 核心页面组件

```
components/
├── auth/
│   ├── LoginForm.tsx           # 登录页（SSO 登录 + 本地登录 fallback）
│   └── ProtectedRoute.tsx      # 登录路由守卫
├── bridge/
│   ├── BridgeProjects.tsx           # 项目列表
│   ├── BridgeProjectParamsModal.tsx # 项目参数配置
│   ├── BridgeRemovalWorkflow.tsx    # 工作流总控
│   ├── BridgeTaskLocatePage.tsx     # 桥梁定位
│   ├── BridgeTaskLocateModal.tsx    # 定位弹窗
│   └── BridgeInpaintResultsPage.tsx # 修复结果选择
└── layout/
    └── Layout.tsx                  # 桥梁系统布局
```

#### API 路径约定

| 路径前缀 | 用途 | 后端 |
| -------- | ---- | ---- |
| `/api/auth/*` | 认证（登录/登出/当前用户） | bridge-removal-service |
| `/api/sso/*` | SSO OAuth2 授权码流程 | bridge-removal-service 代理到 SSO |
| `/api/projects/` | 项目管理 | bridge-removal-service |
| `/api/tasks/{id}/dom-locate` | DOM 定位 | bridge-removal-service |
| `/api/tasks/{id}/preprocess-*` | 预处理 | bridge-removal-service |
| `/api/tasks/{id}/mask-*` | 掩膜操作 | bridge-removal-service |
| `/api/tasks/{id}/inpaint-*` | 修复操作 | bridge-removal-service |
| `/api/tasks/{id}/merge-results` | 结果合并 | bridge-removal-service |
| `/api/shapefiles/` | 矢量文件 | bridge-removal-service |
| `/api/upm/users` | 用户列表 | bridge-removal-service UPM 代理 |
| `/api/upm/departments` | 部门列表 | bridge-removal-service UPM 代理 |
| `/api/system/status` | 系统连接状态 | bridge-removal-service |

### 3.4 认证体系（SSO + JWT 兼容模式）

**认证模式**：`auth.mode` 支持 `jwt` | `sso` | `both`（默认），优先 SSO，失败回退 JWT。

**task-management-service 四级认证链**：
1. 内部自动化 Token（环境变量 `TASK_MANAGEMENT_AUTH_TOKEN`）
2. SSO Session（Header `X-Session-Id`）
3. SSO API Token（Header `Authorization: Bearer <api_token>`）
4. JWT 自验证（Header `Authorization: Bearer <jwt>`）

**bridge-removal-service 认证**：
1. 内部自动化 Token（与 task-management-service 共享 `TASK_MANAGEMENT_AUTH_TOKEN`）
2. 本地 token（本地登录或 SSO 回调后生成的 local_token）
3. SSO API Token（通过 SSO `/api/sso/api-token/validate` 验证）

**bridge-dashboard 双模式登录**：
- **SSO 登录**（生产环境首选）：OAuth2 授权码模式
- **本地登录**（开发/演示 fallback）：用户名/密码 → local_users.json 验证

两个系统共享 SSO 服务，用户在任一系统登录后，token 可在两系统间通用。

### 3.5 权限体系

所有操作基于权限字符串控制，不依赖角色枚举。SSO 返回的 permissions 列表直接作为用户权限。TMS 本地不维护任何用户和角色，全部由 SSO/UPM 统一管理。

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
| `project:create` | 项目验收完成确认（ACCEPTANCE_COMPLETED 流转，仅项目创建人可操作） |
| `resource:project_archives_save` | 项目归档权限（ARCHIVED 流转） |
| `department:manager` | 部门管理权限——项目负责人未指定时，负责部门中具有此权限的用户可看到项目；分解时可见执行人和质检人列 |
| `department:create` | 部门创建权限——可执行分解操作；分解时可见执行部门和质检部门列，无此权限时后端强制填写当前用户所属部门（忽略前端传值） |
| `user:manage` | 用户管理 |
| `system:manager` | 系统基础数据管理——基本计量单位的创建、编辑、启停、删除 |

**本地用户约束**：SSO 不可用时的本地用户不拥有任何 TMS 操作权限，仅可访问 BRS 本地功能。

---

## 四、后端 task-management-service

### 技术栈

| 类别    | 选型                                |
| ------- | ----------------------------------- |
| 语言    | Java 17                             |
| 框架    | Spring Boot 3.2.0                   |
| ORM     | Spring Data JPA + Hibernate         |
| 安全    | Spring Security + JWT               |
| 数据库  | H2（开发）/ PostgreSQL（生产）      |
| 迁移    | Flyway（生产环境启用）              |
| API文档 | springdoc-openapi (Swagger)         |
| AOP     | Spring AOP（操作日志切面）          |

### 分层架构

```
com.example.taskmanagement/
├── config/
│   ├── SecurityConfig.java          # Spring Security 配置
│   ├── H2SchemaBootstrap.java       # H2 初始化
│   └── ResponseHeaderFilter.java    # CORS/响应头
├── controller/
│   ├── TaskController.java          # 任务 CRUD + 状态流转 + 叶子节点操作（接收/指派/分解/撤销指派/开始处理/输入完成量）
│   ├── ProjectTypeController.java   # 项目类型 CRUD + 启停
│   ├── TaskTypeController.java      # 任务类型 CRUD + 启停 + 按分组查询
│   ├── TaskTypeGroupController.java # 任务类型分组 CRUD
│   ├── MeasurementUnitController.java # 计量单位 CRUD + 启停 + 基本单位查询
│   ├── AttachmentController.java    # 附件上传/下载/删除
│   ├── ExternalSystemController.java # 外部系统注册/查询
│   ├── DebugController.java         # 调试接口
│   ├── ApiExceptionHandler.java     # 全局异常处理
│   └── LogQueryController.java      # 日志查询
├── dto/
│   ├── TaskCreateRequest.java       # 含 remarks、workload(项目必填)、weight
│   ├── TaskResponse.java            # 含 depthLevel、compositionMode、attachmentCount、directChildCount、previousAssigneeId（v1.18 新增）；sourceTaskId/qaBatchNo/selfCheckForTaskId 已归档至历史字段
│   ├── TaskUpdateRequest.java       # 含 workflowStatus（仅根项目 PROJECT 专用）
│   ├── DecomposeRequest.java        # 叶子节点分解（subTasks 列表，工作量守恒+同质约束）
│   ├── RevokeAssignmentRequest.java # 撤销指派（被指派人未接收前可撤销）
│   ├── AssignRequest.java          # 指派叶子任务（departmentId + assigneeId + qaDepartmentId + qaAssigneeId）
│   ├── SubmitCompletionRequest.java # 输入完成量（completedWorkload）
│   ├── WorkflowStatusUpdateRequest.java
│   ├── ProjectTypeRequest.java / ProjectTypeResponse.java
│   ├── TaskTypeRequest.java / TaskTypeResponse.java
│   ├── TaskTypeGroupRequest.java / TaskTypeGroupResponse.java
│   ├── MeasurementUnitRequest.java / MeasurementUnitResponse.java  # 含 baseUnitCode、conversionFactor、basic
│   ├── AttachmentResponse.java
│   └── ExternalSystemRegistrationRequest.java
├── dto/ (续)
│   ├── TaskTypeRegistrationRequest.java   # 任务类型注册申请请求 DTO（含 callbackFields、resultQueryPath）
│   └── TaskTypeRegistrationResponse.java  # 任务类型注册申请响应 DTO（含 callbackFields 反序列化为 List<String>、resultQueryPath）
├── model/
│   ├── Task.java                    # 核心实体（含 workflow_status、remarks、attachment_count、status_workloads、in_progress_weight、qa_department_id、qa_assignee_id、assigner_id；source_task_id/qa_batch_no 已移除 v1.8）
│   ├── TaskStatus.java              # 任务状态枚举（10 值）：PENDING/ASSIGNED/RECEIVED/IN_PROGRESS/PAUSED/SUBMITTED_FOR_QA/QA_COMPLETING/QA_COMPLETED/COMPLETED/FAILED
│   ├── WorkflowStatus.java          # 项目验收归档阶段枚举（3 值）：PENDING_ACCEPTANCE/ACCEPTANCE_COMPLETED/ARCHIVED（仅根项目 PROJECT）
│   ├── TaskCategory.java            # PROJECT/PHASE/OPERATION_TASK（QA_TASK 已移除 v1.8；SELF_CHECK_TASK 已废弃 v1.4）
│   ├── ProjectTypeDefinition.java   # 项目类型字典（服务领域，不绑定计量单位）
│   ├── TaskTypeDefinition.java      # 任务类型字典（技术工序，含 group_id，不绑定计量单位）
│   ├── TaskTypeGroup.java           # 任务类型分组字典
│   ├── MeasurementUnitDefinition.java # 计量单位字典（含 base_unit_code、conversion_factor，基本/派生两级）
│   ├── TaskAttachment.java          # 附件实体
│   ├── CompositionMode.java         # HOMOGENEOUS / HETEROGENEOUS
│   ├── TaskAssignment.java          # 任务人员指派
│   ├── TaskDependency.java          # 任务依赖
│   ├── CallbackField.java            # 回传字段枚举（10值：TASK_ID/STATUS/NAME/OPERATOR/WORKLOAD/UNIT 必选，START_TIME/END_TIME/LOCATION/REMARKS 可选）
│   ├── TaskTypeRegistration.java    # 任务类型注册申请实体（含 callbackFields/resultQueryPath，审批状态 PENDING/APPROVED/REJECTED）
│   └── ExternalSystemRegistration.java # 外部系统注册表（含 resultViewUrl/callbackFields/resultQueryPath）
├── repository/
│   ├── TaskRepository.java
│   ├── ProjectTypeDefinitionRepository.java
│   ├── TaskTypeDefinitionRepository.java
│   ├── TaskTypeGroupRepository.java
│   ├── MeasurementUnitDefinitionRepository.java
│   ├── TaskAttachmentRepository.java
│   ├── TaskAssignmentRepository.java
│   ├── TaskDependencyRepository.java
│   └── ExternalSystemRegistrationRepository.java
├── repository/ (续)
│   └── TaskTypeRegistrationRepository.java
├── service/
│   ├── TaskService.java / impl/TaskServiceImpl.java
│   │   └── 创建/更新：类型校验（按 category 查不同字典）、工作量校验（项目必填、≤0 报错）
│   │   └── progress：同质/异质双公式重算（同质公式工作量需换算为基本单位）
│   │   └── 叶子节点：瀑布式工作量流转（statusWorkloads 瀑布扣减 + 加权进度计算）
│   │   └── 叶子节点看板操作：接收（PENDING→RECEIVED）、指派（→ASSIGNED）、分解（批量创建同质子任务+守恒校验）、撤销指派（→PENDING）、开始处理（RECEIVED→IN_PROGRESS）、输入完成量（累计记录完成量）、提交质检（IN_PROGRESS→SUBMITTED_FOR_QA，完成量=总工作量时可用）、撤回质检（SUBMITTED_FOR_QA→IN_PROGRESS，保留完成量+增量累加）
│   │   └── 质检操作（v1.19 更新）：接收质检（acceptQa）：SUBMITTED_FOR_QA→QA_COMPLETING，assigneeId 转质检员，原操作员 ID 保存到 previousAssigneeId；质检通过（qaApprove）：QA_COMPLETING→QA_COMPLETED，清空 previousAssigneeId；质检退回（qaReject）：QA_COMPLETING→IN_PROGRESS，清零完成量，assigneeId 恢复原操作员（previousAssigneeId），恢复后清空 previousAssigneeId；撤回质检（revokeQa）：SUBMITTED_FOR_QA→IN_PROGRESS，保留完成量+增量累加（操作人撤回，QA_COMPLETING 及之后不可撤回）；QA_COMPLETED 后发现问题需新建返修任务，不允许直接 FAILED 返工
│   │   └── 非叶子节点：状态推导（递归统计叶子节点状态，全同才设父状态）、进度只读
│   │   └── 根项目自动流转：质检完成叶子数=叶子总数→PENDING_ACCEPTANCE→ACCEPTANCE_COMPLETED→ARCHIVED→COMPLETED（仅根项目，子项目/任务不经过）
│   │   └── tree：深度校验、全同全异校验、compositionMode 自动判定
│   ├── ProjectTypeService.java / impl/ProjectTypeServiceImpl.java
│   │   └── validateTypeCodeUsable、computeReferenceCount
│   ├── TaskTypeService.java / impl/TaskTypeServiceImpl.java
│   │   └── validateTypeCodeUsable、listByGroup
│   ├── TaskTypeGroupService.java
│   ├── MeasurementUnitService.java / impl/MeasurementUnitServiceImpl.java
│   │   └── 基本单位仅 system:manager 可管理；派生单位换算量校验；基本单位删除级联校验（无派生单位+无任务/项目引用）；同质项目基本单位一致性校验
│   ├── AttachmentService.java
│   │   └── upload（≤50MB、≤20个）、download、delete（审计日志）
│   ├── ExternalSystemService.java
│   │   └── 注册校验：ssoClientId 白名单、taskType 存在于 task_type_definitions 且启用
│   │   └── 非独占：同一类型可绑定多个外部系统
│   │   └── 注册时保存 callbackFields（JSON 序列化）和 resultQueryPath
│   ├── TaskTypeRegistrationService.java
│   │   └── 提交注册申请（保存 callbackFields/resultQueryPath，JSON 序列化）
│   │   └── 审批通过：创建 TaskTypeDefinition + 同步 callbackFields/resultQueryPath 到 ExternalSystemRegistration
│   │   └── 审批拒绝：需填写拒绝原因
│   │   └── updateCallbackFields：更新字段配置并同步到 ExternalSystemRegistration
│   │   └── syncCallbackFieldsToExternalSystem：审批通过/更新字段时同步
│   ├── DependencyService.java / impl/DependencyServiceImpl.java
│   └── SsoClientWhitelistService.java
├── executor/
│   └── ExternalSystemExecutor.java  # HTTP 分发任务到外部系统（含幂等 dispatchId、重试、callback_fields 传入 payload、resultViewUrl 模板替换设置 task.externalUrl）
├── security/
│   ├── JwtAuthenticationFilter.java # 四级认证链
│   ├── AuthzService.java            # 权限校验
│   ├── TaskScopePolicy.java         # 任务可见范围策略
│   └── JwtUtil.java
├── upm/
│   ├── UpmClient.java               # UPM 用户/部门查询代理
│   └── UpmProxyController.java
├── sso/
│   ├── SsoController.java           # SSO 回调/验证
│   ├── SsoClient.java
│   └── SsoSessionCache.java
├── logging/
│   ├── OperationLogAspect.java      # AOP 操作日志
│   ├── LogQueryService.java / LogQueryController.java
│   ├── LogArchiveService.java / LogMonitorService.java
│   └── LogSanitizer.java            # 日志脱敏
└── exception/
    └── NotFoundException.java
```

### 关键规则引擎

| 规则 | 实现位置 | 说明 |
|------|---------|------|
| 类型编码校验 | `TaskServiceImpl.createTask/updateTask` | PROJECT/PHASE → `project_type_definitions`；OPERATION_TASK → `task_type_definitions` |
| 工作量校验 | `TaskServiceImpl.createTask` | 项目下达时 workload 必填；≤0 时报错 |
| 深度限制 | `TaskServiceImpl.calculateTaskDepth` | 沿父链回溯，超限抛异常 |
| 全同全异校验 | `TaskServiceImpl.validateParentChildTypeConstraint` | 混合结构阻断 |
| compositionMode | `TaskServiceImpl.calculateCompositionMode` | 实时判定 |
| 同质进度 | `TaskServiceImpl.recalculateAncestorProgress` | Σ(进度×权重×工作量_基本单位) / Σ(权重×工作量_基本单位)；工作量_基本单位 = 工作量 × 换算量 |
| 异质进度 | `TaskServiceImpl.recalculateAncestorProgress` | Σ(进度×权重) / Σ(权重) |
| 叶子节点进度 | `TaskServiceImpl.calculateLeafProgress` | (inProgressCompletedWorkload × w_ip + SUBMITTED_FOR_QA量 × 0.95 + QA_COMPLETING量 × 0.95 + QA_COMPLETED量 × 1.0) / 总工作量（w_ip 默认 0.95；IN_PROGRESS 未完成部分权重为 0） |
| 瀑布扣减 | `TaskServiceImpl.updateStatusWorkload` | 操作员/质检员设值某状态工作量，系统计算增量并自动从上游状态扣减 |
| 非叶子节点状态推导 | `TaskServiceImpl.recalculateAncestorStatus` | 递归统计叶子节点各状态数量，全同才设父状态，否则状态为空 |
| 根项目自动流转 | `TaskServiceImpl.checkAutoTransition` | 质检完成叶子数=叶子总数→PENDING_ACCEPTANCE；创建人确认→ACCEPTANCE_COMPLETED；归档权限→ARCHIVED→COMPLETED（仅根项目） |
| 非叶子节点只读 | `TaskServiceImpl.updateTask` | API 层拒绝直接修改非叶子节点的 status/progress |
| 外部系统注册 | `ExternalSystemService.register` | 非独占，supportedTaskTypes 引用 task_type_definitions；注册时保存 callbackFields（JSON 序列化）和 resultQueryPath |
| 分发回调 | `ExternalSystemExecutor` | 幂等 dispatchId，3 次重试（30s/60s/120s），超限告警；callback_fields 传入 payload；resultViewUrl 模板替换设置 task.externalUrl |
| 任务类型注册审批 | `TaskTypeRegistrationService` | 提交申请时保存 callbackFields/resultQueryPath；审批通过后同步到 ExternalSystemRegistration；审批拒绝需填写原因；仅 system:admin 可审批 |
| 回传字段配置 | `TaskTypeRegistrationService.updateCallbackFields` | 更新需要拉取的字段子集；必选字段始终包含；更新后同步到 ExternalSystemRegistration |
| 分解校验 | `TaskServiceImpl.decomposeTask` | Σ(subTasks.workload) = 父任务 workload（守恒，不一致时提示子节点合计、父节点工作量、差额和调整方向）；所有 subTasks.workloadUnit = 父任务 workloadUnit（同质）；子任务名称在同一父节点下必须唯一；父任务必须为叶子节点；操作人需 `department:manager` 或 `department:create` 权限；无 department:create 权限时强制覆盖执行部门和质检部门为当前用户所属部门 |
| 撤销指派校验 | `TaskServiceImpl.revokeAssignment` | 被指派人未接收前可撤销（status 仍为 ASSIGNED）；操作人为指派人或具有 department:manager 权限 |
| 接收校验 | `TaskServiceImpl.receiveTask` | 任务状态为 PENDING 或 ASSIGNED；操作人需 task:execute 权限；全部工作量从上游状态→RECEIVED |
| 指派校验 | `TaskServiceImpl.assignTask` | 任务状态为 PENDING；操作人需 department:manager 权限；必须指定负责部门/人 |
| 开始处理校验 | `TaskServiceImpl.startProgress` | 任务状态为 RECEIVED；操作人需 task:execute 权限 |
| 输入完成量校验 | `TaskServiceImpl.submitCompletion` | 任务状态为 IN_PROGRESS；累计完成量 + 本次 ≤ 总工作量；操作人需 task:execute 权限；完成量在 IN_PROGRESS 中累计记录，`inProgressCompletedWorkload` 同步累加 |
| 提交质检校验 | `TaskServiceImpl.submitQa` | 任务状态为 IN_PROGRESS；累计完成量 = 总工作量；操作人需 task:execute 权限；全部工作量从 IN_PROGRESS→SUBMITTED_FOR_QA，`inProgressCompletedWorkload` 清零 |
| 质检推送 | `TaskServiceImpl.submitQa` | 未指定质检员→推送给质检部门负责人（department:manager）；已指定质检员→推送给该质检员 |
| 质检通过校验 | `TaskServiceImpl.qaApprove` | 任务状态为 QA_COMPLETING；操作人需 quality:check 权限；QA_COMPLETING→QA_COMPLETED，清空 previousAssigneeId |
| 质检退回校验 | `TaskServiceImpl.qaReject` | 任务状态为 QA_COMPLETING；操作人需 quality:check 权限；QA_COMPLETING→IN_PROGRESS，清零完成量，assigneeId 恢复原操作员（previousAssigneeId），恢复后清空 previousAssigneeId |
| 撤回质检校验 | `TaskServiceImpl.revokeQa` | 任务状态为 SUBMITTED_FOR_QA；操作人需 task:execute 权限；SUBMITTED_FOR_QA→IN_PROGRESS，保留完成量（再次输入为增量累加）；QA_COMPLETING 及之后不可撤回 |
| 权限驱动 UI | 前端 `useUserPermissions.ts` | 按钮可见性：task:execute→接收/开始处理/输入完成量/提交质检/撤回质检；department:manager→指派/撤销；分解→`department:manager` 或 `department:create`；quality:check→质检通过/退回；列可见性：无 department:manager→隐藏"已指派"列 |

### 状态推导与进度汇聚调用链路

```
叶子节点工作量变更（updateStatusWorkload）
  → calculateLeafProgress（加权进度计算）
  → recalculateAncestorProgress（沿 parent_task_id 递归向上重算进度）
      → calculateCompositionMode（判定直接子节点结构类型）
      → 同质公式 / 异质公式（按 compositionMode 选择）
  → recalculateAncestorStatus（沿 parent_task_id 递归推导状态）
      → 递归统计叶子节点各状态数量和工作量分布
      → 全同→设父状态；否则→状态为空
  → checkAutoTransition（仅根项目，即无 parent_task_id 的顶层 PROJECT）
      → 所有叶子节点均达到 QA_COMPLETED → PENDING_ACCEPTANCE
      → 创建人确认 → ACCEPTANCE_COMPLETED
      → resource:project_archives_save 权限 → ARCHIVED
      → 自动 → COMPLETED
```

**触发时机**：
- 叶子节点工作量流转（`updateStatusWorkload`）
- 子节点增删/移动（`createTask` / `deleteTask` / `moveTask`）
- 子节点工作量/权重变更（`updateTask`）

### 数据迁移

| 版本 | 内容 |
|------|------|
| V1~V7 | 初始化任务表、升级模型、部门约束、类型可控 null |
| V8 | 创建 `measurement_unit_definitions` + `project_type_definitions`；预置 7 种单位；`tasks.composition_mode`、`tasks.weight` |
| V9 | 回填 6 种历史项目类型到字典；`tasks.type NOT NULL`；回填 `workload_unit` 按类型绑定关系 |
| V10 | 修复非法权重（<1 或 >100）；回填 `composition_mode` |
| V11（待） | 创建 `task_type_group` + `task_type_definitions`；预置 5 组 30 种工序；扩展计量单位为 9 种 |
| V12（待） | 创建 `task_attachments` 表；`tasks.remarks`、`tasks.attachment_count`；`tasks.workflow_status` |
| V13 | 计量单位层级体系：新增 `base_unit_code` + `conversion_factor` 字段；新增 4 种基本单位（米/立方米/千克/计数）；为已有派生单位补充换算量（公里→米、平方公里→平方米、个/点/幅/张/本/页→计数）；移除 `project_type_definitions.measurement_unit_code` 和 `task_type_definitions.measurement_unit_code` |
| V16（待） | 叶子节点工作量流转：新增 `tasks.status_workloads`（TEXT，JSON，含 QA_COMPLETING 键）+ `tasks.in_progress_weight`（DOUBLE，默认 0.95）+ `tasks.qa_department_id`（VARCHAR(64)）+ `tasks.qa_assignee_id`（UUID）+ `tasks.assigner_id`（UUID）；TaskStatus 扩展为 10 值（新增 SUBMITTED_FOR_QA/QA_COMPLETING/QA_COMPLETED）；WorkflowStatus 缩减为 3 值（PENDING_ACCEPTANCE/ACCEPTANCE_COMPLETED/ARCHIVED，仅根项目 PROJECT）；为已有叶子节点初始化 statusWorkloads（总工作量全部置于当前状态）；标记 SELF_CHECK_TASK 为废弃（不删除历史数据） |
| V17 | v1.5 枚举重构 + 字段补全：新增 `tasks.assigner_id`（UUID）字段 + 索引；为已有 statusWorkloads JSON 补充 `QA_COMPLETING` 键（值=0）；数据修复：将 PENDING_ACCEPTANCE/ACCEPTANCE_COMPLETED/ARCHIVED 状态的任务 workflow_status 字段写入对应值，status 字段改为 COMPLETED |
| V18 | 允许非叶子节点 status 为 NULL：`ALTER TABLE tasks ALTER COLUMN status DROP NOT NULL` |
| V19 | 质检任务分离字段：新增 `tasks.source_task_id`（UUID, 可空）+ `tasks.qa_batch_no`（INTEGER, 可空）+ 索引 `idx_tasks_source_task_id` |

---

## 五、部署架构

### 5.1 服务清单

| 服务 | 端口 | 技术栈 |
|------|------|--------|
| task-management-service | 8082 | Java 17 / Spring Boot 3.2 |
| bridge-removal-service | 5050 | Python 3.10 / Flask 3.x |
| task-dashboard | 5173 | React 18 / TypeScript 5 / Vite 6 |
| bridge-dashboard | 5174 | React 18 / TypeScript 5 / Vite 6 |
| SSO 服务 | 8080 | — |
| UPM (user-service) | 8081 | — |

### 5.2 启动顺序

1. SSO 服务 + UPM (user-service)
2. task-management-service
3. bridge-removal-service（启动时向 TMS 提交任务类型注册申请，仅注册 BRIDGE_REMOVAL_BATCH；单元处理为 BRS 内部概念，不向 TMS 暴露）
4. 前端 dev server

### 5.3 容错策略

| 场景 | 行为 |
|------|------|
| TMS 不可用 | BRS 核心功能不受影响，任务上报/接收降级；启动注册失败仅 warning |
| UPM 不可用 | 用户/部门相关接口返回错误 |
| SSO 不可用 | BRS 仅本地账户登录，本地用户无 TMS 权限 |
| 分发未收到 RECEIVED | 最多 3 次重试（30s/60s/120s），超限标记"分发异常"并告警 |
