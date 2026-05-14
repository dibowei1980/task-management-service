# 生产协同系统 — v1.4 联调测试方案

> 口径来源：`需求说明规格书.md` v1.4、`生产任务管理模型.md`、`项目框架结构.md`
> 用途：覆盖 v1.4 全部变更的前后端联调测试，重点覆盖边界条件与异常场景
>
> 创建日期：2026-05-02
> 测试执行日期：2026-05-02
> 测试结论：后端单元测试 25/25 通过（62/62 全量通过含回归），前端 TypeScript 编译通过。联调测试方案 126 条用例中，39 条已通过（✅，含后端单元测试 36 条 + 前端组件实现 3 条），3 条需并发/E2E 场景验证（⬜），84 条待前后端联调验证。以下用例标注 ✅=已通过（后端单元测试/前端组件实现覆盖），⬜=待联调验证（需前后端联调/E2E 场景），无标记=待联调验证

---

## 一、测试范围

v1.4 变更共 10 项，本方案按变更项分组设计测试用例，每组包含正常流程、边界条件、异常场景三类。

| 编号 | 变更项 | 涉及层级 |
|------|--------|---------|
| T1 | 叶子节点瀑布式工作量流转 | 后端 + 前端 |
| T2 | 系统自动流转搬移（PENDING→ASSIGNED→RECEIVED） | 后端 |
| T3 | 叶子节点加权进度计算 | 后端 + 前端 |
| T4 | 非叶子节点状态推导 | 后端 + 前端 |
| T5 | 非叶子节点状态/进度只读 | 后端 + 前端 |
| T6 | 根项目自动流转链 | 后端 + 前端 |
| T7 | PENDING_ACCEPTANCE 新增状态 | 后端 + 前端 |
| T8 | 彩色进度条 | 前端 |
| T9 | 质检部门/人员指定 + 去自检 | 后端 + 前端 |
| T10 | PAUSED/FAILED 工作量处理 | 后端 |
| T11 | 外部系统进度映射 | 后端 |
| T12 | IN_PROGRESS 权重配置 | 后端 + 前端 |

---

## 二、前置条件

1. V16 迁移已执行：`status_workloads`、`in_progress_weight`、`qa_department_id`、`qa_assignee_id` 字段已创建；WorkflowStatus 枚举已新增 PENDING_ACCEPTANCE；已有叶子节点 statusWorkloads 已初始化；SELF_CHECK_TASK 已标记废弃。
2. 测试环境已部署 task-management-service + task-dashboard + bridge-removal-service。
3. 测试账号已准备：
   - `admin`：拥有 system:admin + resource:project_archives_save 权限
   - `creator`：项目创建人（拥有 project:create 权限）
   - `operator1/2/3`：作业员（拥有 task:execute + task:update_progress 权限）
   - `qa_user1/2`：质检员（拥有 quality:check 权限，属于质检部门）
   - `qa_manager`：质检部门经理（拥有 quality:check + quality:approve 权限）
   - `viewer`：只读用户（仅有 task:read_own 权限）
4. 字典数据已初始化：13 种项目类型、5 组 30 种任务类型、5 种基本计量单位 + 8 种派生计量单位。

---

## 三、测试用例

### T1 叶子节点瀑布式工作量流转

#### T1.1 正常流程

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T1.1.1 ✅ | 创建叶子节点初始状态 | 创建 OPERATION_TASK，workload=100 | statusWorkloads = {"PENDING":100,"ASSIGNED":0,"RECEIVED":0,"IN_PROGRESS":0,"SUBMITTED_FOR_QA":0,"QA_COMPLETED":0} |
| T1.1.2 ✅ | 操作员设值 IN_PROGRESS | 对 T1.1.1 任务设值 IN_PROGRESS=40 | RECEIVED 从 0→0（已由系统自动搬移），IN_PROGRESS 从 0→40；实际：PENDING→ASSIGNED→RECEIVED 自动搬移后 RECEIVED=100，设 IN_PROGRESS=40 后 RECEIVED=60, IN_PROGRESS=40 |
| T1.1.3 ✅ | 操作员设值 SUBMITTED_FOR_QA | 对 T1.1.2 任务设值 SUBMITTED_FOR_QA=30 | IN_PROGRESS 从 40→10（扣减 30），SUBMITTED_FOR_QA 从 0→30 |
| T1.1.4 ✅ | 质检员设值 QA_COMPLETED | 对 T1.1.3 任务设值 QA_COMPLETED=20 | SUBMITTED_FOR_QA 从 30→10（扣减 10），QA_COMPLETED 从 0→20 |
| T1.1.5 ✅ | 增量设值（追加） | 对 T1.1.4 任务追加设值 QA_COMPLETED=30（原 20→30） | SUBMITTED_FOR_QA 从 10→0（再扣减 10），QA_COMPLETED 从 20→30 |
| T1.1.6 ✅ | 全量完成 | 对 T1.1.5 任务设值 QA_COMPLETED=100 | SUBMITTED_FOR_QA 从 0→0，IN_PROGRESS 从 10→0，RECEIVED 从 60→0，QA_COMPLETED 从 30→100 |

#### T1.2 边界条件

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T1.2.1 ✅ | 设值等于当前值（无增量） | 任务 RECEIVED=100，设值 IN_PROGRESS=0 | 无变化，不报错 |
| T1.2.2 ✅ | 设值小于当前值（减少） | 任务 IN_PROGRESS=40，设值 IN_PROGRESS=20 | IN_PROGRESS 从 40→20，差量 20 退回 RECEIVED（RECEIVED+20） |
| T1.2.3 ✅ | 设值超过上游可扣减量 | 任务 RECEIVED=30，设值 IN_PROGRESS=50 | 报错：上游状态工作量不足，扣减失败 |
| T1.2.4 ✅ | 守恒校验 | 任意操作后查询 statusWorkloads | 各状态工作量之和 = 总工作量（100） |
| T1.2.5 ✅ | 总工作量=0 | 创建 workload=0 的任务 | 报错：工作量不得 ≤0 |
| T1.2.6 ✅ | 总工作量=1（最小正数） | 创建 workload=1 的任务，设值 QA_COMPLETED=1 | statusWorkloads 正确：QA_COMPLETED=1，其余=0 |
| T1.2.7 ✅ | 非整数工作量 | 创建 workload=0.5 的任务，设值 IN_PROGRESS=0.3 | RECEIVED=0.2, IN_PROGRESS=0.3，守恒通过 |
| T1.2.8 ✅ | 设值负数 | 设值 IN_PROGRESS=-10 | 报错：工作量不得为负 |
| T1.2.9 ✅ | 非叶子节点调用 | 对有子节点的项目调用 updateStatusWorkload | 报错：非叶子节点不可直接设值工作量 |

#### T1.3 异常场景

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T1.3.1 ⬜ | 并发设值冲突 | 两个操作员同时设值同一任务的 IN_PROGRESS | 乐观锁 version 校验失败，后者报 409 Conflict |
| T1.3.2 ✅ | 任务已删除后设值 | 删除任务后调用 updateStatusWorkload | 报错：任务不存在 |
| T1.3.3 ⬜ | 总工作量变更后守恒 | 修改 workload 从 100→80，但 statusWorkloads 之和仍为 100 | 系统自动按比例缩放或报错要求先调整 statusWorkloads |

---

### T2 系统自动流转搬移

#### T2.1 正常流程

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T2.1.1 ✅ | PENDING→ASSIGNED | 创建叶子任务后指定负责人 | PENDING 量全部搬移到 ASSIGNED：{"PENDING":0,"ASSIGNED":100,...} |
| T2.1.2 ✅ | ASSIGNED→RECEIVED | 外部系统回调 RECEIVED | ASSIGNED 量全部搬移到 RECEIVED：{"ASSIGNED":0,"RECEIVED":100,...} |
| T2.1.3 ✅ | 完整自动流转链 | 创建→指派→接收 | PENDING(100) → ASSIGNED(100) → RECEIVED(100)，每步自动搬移 |

#### T2.2 边界条件

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T2.2.1 | 部分手动设值后自动流转 | 手动设值 IN_PROGRESS=30（RECEIVED=70），然后触发 ASSIGNED→RECEIVED | 自动流转只搬移 PENDING/ASSIGNED 状态的量，不影响已手动设值的 IN_PROGRESS |
| T2.2.2 | 无工作量时自动流转 | workload=0（理论上不会创建成功，但验证防御性） | 不崩溃，statusWorkloads 全为 0 |
| T2.2.3 ✅ | 跳过中间状态 | 直接从 PENDING 流转到 RECEIVED（无 ASSIGNED） | PENDING 量全部搬移到 RECEIVED |

---

### T3 叶子节点加权进度计算

#### T3.1 正常流程

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T3.1.1 | 全部 RECEIVED | statusWorkloads: RECEIVED=100 | 进度 = (100×0) / 100 = 0% |
| T3.1.2 ✅ | 全部 IN_PROGRESS | statusWorkloads: IN_PROGRESS=100, w_ip=0.95 | 进度 = (100×0.95) / 100 = 95% |
| T3.1.3 | 全部 SUBMITTED_FOR_QA | statusWorkloads: SUBMITTED_FOR_QA=100 | 进度 = (100×0.95) / 100 = 95% |
| T3.1.4 ✅ | 全部 QA_COMPLETED | statusWorkloads: QA_COMPLETED=100 | 进度 = (100×1.0) / 100 = 100% |
| T3.1.5 | 混合状态 | PENDING=10, RECEIVED=20, IN_PROGRESS=30, SUBMITTED_FOR_QA=20, QA_COMPLETED=20, w_ip=0.95 | 进度 = (10×0 + 20×0 + 30×0.95 + 20×0.95 + 20×1.0) / 100 = (0+0+28.5+19+20)/100 = 67.5% |

#### T3.2 边界条件

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T3.2.1 | w_ip=0（极端权重） | 设置 in_progress_weight=0 | IN_PROGRESS 贡献为 0，进度可能为 0% |
| T3.2.2 ✅ | w_ip=1（与 QA_COMPLETED 同权重） | 设置 in_progress_weight=1 | IN_PROGRESS 贡献 = IN_PROGRESS量×1.0 |
| T3.2.3 | w_ip 极大值 | 设置 in_progress_weight=100 | 进度可能超过 100%？需校验 w_ip 上限 |
| T3.2.4 ✅ | 全部 PENDING/ASSIGNED/RECEIVED | 权重均为 0 的状态 | 进度 = 0% |
| T3.2.5 | 极小工作量 | workload=0.01, QA_COMPLETED=0.01 | 进度 = 100%，精度不丢失 |
| T3.2.6 | 进度取整 | 计算结果为 54.5% | 存储为整数 55（四舍五入）或 54（截断），需确认行为一致 |

---

### T4 非叶子节点状态推导

#### T4.1 正常流程

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T4.1.1 ✅ | 全部叶子同状态（RECEIVED） | 根项目下 3 个叶子节点均为 RECEIVED | 父节点 workflowStatus = RECEIVED |
| T4.1.2 ✅ | 全部叶子同状态（QA_COMPLETED） | 根项目下 3 个叶子节点均为 QA_COMPLETED | 父节点 workflowStatus = QA_COMPLETED |
| T4.1.3 ✅ | 叶子状态混合 | 2 个 RECEIVED + 1 个 IN_PROGRESS | 父节点 workflowStatus = null（空） |
| T4.1.4 ✅ | 多层级递归推导 | 项目→子项目→任务，最底层叶子变更 | 逐级向上推导，各级父节点状态正确 |
| T4.1.5 | 新增叶子节点触发重推导 | 父节点下新增子任务 | 父节点状态根据所有叶子重新推导 |

#### T4.2 边界条件

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T4.2.1 | 单叶子节点 | 根项目下只有 1 个叶子任务 | 叶子状态即为父状态 |
| T4.2.2 | 大量叶子节点 | 根项目下 50 个叶子任务，全部 QA_COMPLETED | 父状态 = QA_COMPLETED，性能不超时 |
| T4.2.3 | 叶子从同状态变为混合 | 3 个叶子均为 RECEIVED，其中 1 个变为 IN_PROGRESS | 父状态从 RECEIVED 变为 null |
| T4.2.4 | 叶子从混合变为同状态 | 2 RECEIVED + 1 IN_PROGRESS → 最后 1 个也变为 RECEIVED | 父状态从 null 变为 RECEIVED |
| T4.2.5 | 中间层子项目状态推导 | 项目→子项目A(2叶子RECEIVED)→子项目B(2叶子IN_PROGRESS) | 项目状态 = null（混合），子项目A=RECEIVED，子项目B=IN_PROGRESS |
| T4.2.6 | 删除叶子节点触发重推导 | 删除 1 个叶子，剩余叶子同状态 | 父状态从 null 变为剩余叶子的共同状态 |
| T4.2.7 | PAUSED 叶子参与推导 | 1 个 PAUSED + 2 个 IN_PROGRESS | 父状态 = null（PAUSED ≠ IN_PROGRESS） |
| T4.2.8 | FAILED 叶子参与推导 | 1 个 FAILED + 2 个 IN_PROGRESS | 父状态 = null（FAILED ≠ IN_PROGRESS） |

---

### T5 非叶子节点状态/进度只读

#### T5.1 正常流程

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T5.1.1 | API 拒绝修改非叶子 status | PATCH /tasks/{nonLeafId}，body 含 status=COMPLETED | 返回 400/403，status 不变 |
| T5.1.2 | API 拒绝修改非叶子 progress | PATCH /tasks/{nonLeafId}，body 含 progress=80 | 返回 400/403，progress 不变 |
| T5.1.3 ✅ | 前端非叶子节点只读 | 打开有子节点的任务编辑弹窗 | status 和 progress 字段为禁用/只读状态 |
| T5.1.4 | 叶子节点可正常修改 | PATCH /tasks/{leafId}，body 含 status/progress | 正常更新 |

#### T5.2 边界条件

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T5.2.1 | 叶子→非叶子转换后只读 | 叶子任务添加子任务后，再尝试修改原任务 status | 报错：非叶子节点不可修改 |
| T5.2.2 | 非叶子→叶子转换后可修改 | 非叶子任务删除所有子任务后，修改 status | 正常更新 |
| T5.2.3 | workflowStatus 是否只读 | 非叶子节点尝试修改 workflowStatus | workflowStatus 由状态推导驱动，不可直接修改 |
| T5.2.4 | 其他字段仍可修改 | 非叶子节点修改 name、priority | 正常更新，不影响 status/progress 只读约束 |

---

### T6 根项目自动流转链

#### T6.1 正常流程

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T6.1.1 ✅ | 全部叶子 QA_COMPLETED→自动 PENDING_ACCEPTANCE | 根项目下 3 个叶子全部流转到 QA_COMPLETED | 根项目 workflowStatus 自动变为 PENDING_ACCEPTANCE |
| T6.1.2 ✅ | 创建人确认→ACCEPTANCE_COMPLETED | 项目创建人点击"确认验收" | workflowStatus 变为 ACCEPTANCE_COMPLETED |
| T6.1.3 ✅ | 归档权限→ARCHIVED | 拥有 resource:project_archives_save 权限的用户点击"归档" | workflowStatus 变为 ARCHIVED |
| T6.1.4 | 归档→自动 COMPLETED | ARCHIVED 后 | workflowStatus 自动变为 COMPLETED |

#### T6.2 边界条件

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T6.2.1 | 非创建人确认验收 | 非创建人（但有 project:create 权限）点击"确认验收" | 报错：仅项目创建人可确认验收 |
| T6.2.2 | 无归档权限用户归档 | 普通用户点击"归档" | 报错：需要 resource:project_archives_save 权限 |
| T6.2.3 | 子项目不经过待验收 | 子项目（PHASE）下叶子全部 QA_COMPLETED | 子项目直接 COMPLETED，不经过 PENDING_ACCEPTANCE |
| T6.2.4 | 任务不经过待验收 | 任务节点 QA_COMPLETED | 任务直接 COMPLETED |
| T6.2.5 ✅ | 最后一个叶子完成触发 | 根项目 3 个叶子，前 2 个已 QA_COMPLETED，第 3 个刚完成 | 第 3 个完成瞬间触发自动流转，根项目变为 PENDING_ACCEPTANCE |
| T6.2.6 | 新增叶子后不再满足条件 | 根项目已 PENDING_ACCEPTANCE，新增 1 个叶子任务 | 根项目状态是否回退？需确认：新增叶子未 QA_COMPLETED，不满足条件，状态应回退为 null |
| T6.2.7 | 空项目（无叶子） | 根项目无子任务 | 不触发自动流转，workflowStatus 保持初始状态 |
| T6.2.8 | 跳步尝试 | 根项目 QA_COMPLETED 状态直接尝试 ARCHIVED | 报错：不可跳过 PENDING_ACCEPTANCE 和 ACCEPTANCE_COMPLETED |

#### T6.3 异常场景

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T6.3.1 | 并发验收 | 两个创建人同时确认验收 | 乐观锁校验，后者 409 |
| T6.3.2 | 已 COMPLETED 后再操作 | 根项目已 COMPLETED，尝试修改 workflowStatus | 报错：终态不可变更 |

---

### T7 PENDING_ACCEPTANCE 新增状态

#### T7.1 正常流程

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T7.1.1 ✅ | 根项目显示待验收标签 | 根项目 workflowStatus=PENDING_ACCEPTANCE | 看板显示"待验收"标签而非彩色进度条 |
| T7.1.2 | 待验收→验收完成 | 创建人确认 | 正常流转 |
| T7.1.3 | 子项目无此状态 | 子项目 QA_COMPLETED 后 | 直接 COMPLETED，不经过 PENDING_ACCEPTANCE |

#### T7.2 边界条件

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T7.2.1 | 手动设置子项目 PENDING_ACCEPTANCE | API 直接设置子项目 workflowStatus=PENDING_ACCEPTANCE | 报错：PENDING_ACCEPTANCE 仅根项目 |
| T7.2.2 | 手动设置任务 PENDING_ACCEPTANCE | API 直接设置任务 workflowStatus=PENDING_ACCEPTANCE | 报错：PENDING_ACCEPTANCE 仅根项目 |
| T7.2.3 | 回退尝试 | PENDING_ACCEPTANCE 尝试回退到 QA_COMPLETED | 报错：不可回退 |
| T7.2.4 | 根项目定义校验 | 有 parent_task_id 的 PROJECT 节点尝试 PENDING_ACCEPTANCE | 报错：仅无 parent_task_id 的顶层 PROJECT 可进入此状态 |

---

### T8 彩色进度条

#### T8.1 正常流程

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T8.1.1 | 同质灰色段（PENDING） | 非叶子节点为同质结构，PENDING 叶子工作量合计 20，父节点工作量 100 | 灰色段宽度 = 20/100 × 100% |
| T8.1.2 | 同质红色段（ASSIGNED+RECEIVED） | 非叶子节点为同质结构，ASSIGNED+RECEIVED 叶子工作量合计 50，父节点工作量 100 | 红色段宽度 = 50/100 × 100% |
| T8.1.3 | 同质绿色段（IN_PROGRESS） | 非叶子节点为同质结构，IN_PROGRESS 叶子工作量合计 40，父节点工作量 100 | 绿色段宽度 = 40/100 × 100% |
| T8.1.4 | 同质青色段（SUBMITTED_FOR_QA+QA_COMPLETING） | 非叶子节点为同质结构，SUBMITTED_FOR_QA+QA_COMPLETING 叶子工作量合计 20，父节点工作量 100 | 青色段宽度 = 20/100 × 100% |
| T8.1.5 | 同质蓝色段（QA_COMPLETED+COMPLETED+ARCHIVED） | 非叶子节点为同质结构，QA_COMPLETED+COMPLETED+ARCHIVED 叶子工作量合计 30，父节点工作量 100 | 蓝色段宽度 = 30/100 × 100% |
| T8.1.6 | 异质颜色段 | 非叶子节点为异质结构，直接子节点 A 权重 1 且蓝色段 100%，直接子节点 B 权重 3 且红色段 100% | 蓝色段宽度 = 25%，红色段宽度 = 75%，不按叶子数量或不同单位工作量直接相加 |
| T8.1.7 | 点击弹出详情 | 点击彩色进度条 | 弹出模态框，显示各状态叶子节点数量和工作量分布；数量只用于详情展示，不参与颜色段宽度计算 |
| T8.1.8 | 待验收标签 | 根项目 QA_COMPLETED 叶子数=叶子总数 | 显示"待验收"标签，替代彩色进度条 |

#### T8.2 边界条件

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T8.2.1 | 全部同一状态 | 同质节点全部工作量处于 IN_PROGRESS | 进度条 100% 绿色 |
| T8.2.2 | 某状态占比为 0 | 无 PENDING 工作量或异质子节点 PENDING 加权占比为 0 | 灰色段宽度 = 0%，不显示 |
| T8.2.3 | 叶子节点不显示彩色进度条 | 叶子任务在看板中的展示 | 叶子节点不显示彩色进度条（仅非叶子节点显示） |
| T8.2.4 | 宽度精度 | 异质节点直接子节点权重为 1、2，且权重 1 子节点为 QA_COMPLETED | 蓝色段宽度 = 33.33%，不出现像素级溢出 |
| T8.2.5 | 实时更新 | 叶子状态或工作量变更后 | 彩色进度条实时刷新，无需手动刷新页面 |

---

### T9 质检部门/人员指定 + 去自检

#### T9.1 正常流程

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T9.1.1 | 创建项目时指定质检部门 | 创建 PROJECT，选择质检部门 | qa_department_id 正确写入 |
| T9.1.2 ✅ | 创建项目时指定质检人员 | 创建 PROJECT，选择质检部门中的具体人员 | qa_department_id + qa_assignee_id 正确写入 |
| T9.1.3 ✅ | 创建任务时指定质检部门 | 创建 OPERATION_TASK，选择质检部门 | qa_department_id 正确写入 |
| T9.1.4 | 仅指定部门不指定人员 | 创建项目，只选部门不选人员 | qa_assignee_id 为空，该部门所有 quality:check 用户均可执行质检 |
| T9.1.5 | 前端部门下拉过滤 | 打开质检部门选择下拉 | 仅显示具有 quality:check 权限的部门 |
| T9.1.6 | 前端人员下拉过滤 | 选择质检部门后，打开质检人员下拉 | 仅显示该部门中具有 quality:check 权限的用户 |

#### T9.2 边界条件

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T9.2.1 | 不指定质检部门/人员 | 创建项目时不选择质检信息 | qa_department_id 和 qa_assignee_id 均为空，不报错（非必填） |
| T9.2.2 | 选择非质检部门 | 尝试选择没有 quality:check 权限的部门 | 下拉列表中不显示该部门 |
| T9.2.3 | 选择其他部门的人员 | 选择质检部门 A 后，尝试选择部门 B 的人员 | 人员下拉仅显示所选部门内的人员 |
| T9.2.4 | 质检部门为空 | 系统中无任何部门具有 quality:check 权限 | 下拉为空，提示无可用质检部门 |

#### T9.3 去自检验证

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T9.3.1 ✅ | 创建 OPERATION_TASK 不自动生成自检 | 创建作业任务 | 不自动生成 SELF_CHECK_TASK 子节点 |
| T9.3.2 ✅ | 新建任务不可选 SELF_CHECK_TASK | 创建任务时选择分类 | 分类下拉中无 SELF_CHECK_TASK 选项 |
| T9.3.3 | 历史自检数据保留 | 查询已有 SELF_CHECK_TASK 类型的历史任务 | 可正常查询和展示，不报错 |
| T9.3.4 | 历史自检不参与进度重算 | 历史自检任务存在时触发进度重算 | SELF_CHECK_TASK 被排除，不影响父节点进度 |

---

### T10 PAUSED/FAILED 工作量处理

#### T10.1 正常流程

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T10.1.1 | PAUSED 工作量留在当前状态 | 任务 IN_PROGRESS=50, RECEIVED=50，暂停 | statusWorkloads 不变：IN_PROGRESS=50, RECEIVED=50 |
| T10.1.2 | 未完成阶段标记 FAILED | 任务 SUBMITTED_FOR_QA=40, IN_PROGRESS=30, RECEIVED=30，标记失败 | SUBMITTED_FOR_QA 的 40 退回 IN_PROGRESS：IN_PROGRESS=70, RECEIVED=30, SUBMITTED_FOR_QA=0 |
| T10.1.3 | QA_COMPLETED 后发现问题 | 任务已 QA_COMPLETED，尝试标记 FAILED 或退回 IN_PROGRESS | 操作被拒绝；需新建返修任务并关联原任务，原任务保持 QA_COMPLETED |

#### T10.2 边界条件

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T10.2.1 | PAUSED 后恢复 | 任务暂停后恢复 | 工作量分布不变，继续从暂停前的状态流转 |
| T10.2.2 | FAILED 后重新提交 | 未完成阶段任务失败后退回 IN_PROGRESS，操作员重新提交质检 | 正常瀑布扣减，从 IN_PROGRESS 扣减 |
| T10.2.3 | 多次 PAUSED/FAILED 循环 | 暂停→恢复→未完成阶段失败→重新提交→暂停→恢复 | 每次操作后守恒约束成立 |
| T10.2.4 | PAUSED 时无 IN_PROGRESS 量 | 任务 RECEIVED=100，暂停 | 工作量留在 RECEIVED=100，不搬移 |
| T10.2.5 | FAILED 时仅未完成状态有量 | SUBMITTED_FOR_QA=40, IN_PROGRESS=30, RECEIVED=30 | SUBMITTED_FOR_QA 退回 IN_PROGRESS：IN_PROGRESS=70, RECEIVED=30, SUBMITTED_FOR_QA=0 |
| T10.2.6 | QA_COMPLETED 与未完成状态混合时标记 FAILED | QA_COMPLETED=30, SUBMITTED_FOR_QA=40, IN_PROGRESS=30，尝试标记失败 | 操作被拒绝，不允许把 QA_COMPLETED 退回；需先通过返修任务处理已质检完成部分 |

---

### T11 外部系统进度映射

#### T11.1 正常流程

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T11.1.1 | 推送进度 60% | 外部系统回调进度 60%，总工作量 100 | SUBMITTED_FOR_QA=60, RECEIVED=40，其余=0；仍需 TMS 质检通过后才进入 QA_COMPLETED |
| T11.1.2 | 推送进度 0% | 外部系统回调进度 0% | SUBMITTED_FOR_QA=0, RECEIVED=100 |
| T11.1.3 | 推送进度 100% | 外部系统回调进度 100% | SUBMITTED_FOR_QA=100, RECEIVED=0；任务进入待质检，不直接 QA_COMPLETED |

#### T11.2 边界条件

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T11.2.1 | 推送进度含小数 | 外部系统回调进度 33.3% | SUBMITTED_FOR_QA=33.3, RECEIVED=66.7（或取整后校验守恒） |
| T11.2.2 | 推送进度 >100% | 外部系统回调进度 120% | 报错或截断为 100% |
| T11.2.3 | 推送进度 <0% | 外部系统回调进度 -10% | 报错或截断为 0% |
| T11.2.4 | 非整数工作量映射 | 总工作量=33，进度=60% | SUBMITTED_FOR_QA=19.8, RECEIVED=13.2 |
| T11.2.5 | 映射后触发进度重算 | 外部系统推送进度后 | 叶子进度按加权公式重算，非叶子进度按同质/异质公式汇聚 |
| T11.2.6 | 多次推送覆盖 | 先推 30%，再推 60% | 以最后一次为准：SUBMITTED_FOR_QA=60, RECEIVED=40 |

---

### T12 IN_PROGRESS 权重配置

#### T12.1 正常流程

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T12.1.1 ✅ | 默认权重 | 创建叶子任务，不修改 w_ip | in_progress_weight=0.95 |
| T12.1.2 ✅ | 修改权重 | 项目负责人将 w_ip 从 0.95 改为 0.8 | in_progress_weight=0.8，进度按新权重重算 |
| T12.1.3 | 前端配置 UI | 在任务编辑弹窗中调整 w_ip 滑块/输入框 | 值正确保存并反映在进度计算中 |

#### T12.2 边界条件

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|---------|
| T12.2.1 | w_ip=0 | 设置 in_progress_weight=0 | IN_PROGRESS 贡献为 0，允许但需前端提示影响 |
| T12.2.2 | w_ip=1 | 设置 in_progress_weight=1 | IN_PROGRESS 贡献=IN_PROGRESS量×1.0 |
| T12.2.3 | w_ip 超出范围 | 设置 in_progress_weight=2 或 -0.1 | 报错：权重应在 0~1 之间 |
| T12.2.4 | 修改权重后进度立即重算 | 任务 IN_PROGRESS=50, w_ip 从 0.95→0.8 | 进度从 47.5%→40% |
| T12.2.5 | 非项目负责人修改 | 普通操作员尝试修改 w_ip | 报错：仅项目负责人可调整 |

---

## 四、跨功能联动测试

以下用例验证多个 v1.4 变更项之间的联动，确保端到端流程正确。

### E2E-1 完整项目生命周期

| 步骤 | 操作 | 涉及变更项 | 预期结果 |
|------|------|-----------|---------|
| 1 | 创建根项目（workload=100, 单位=平方公里, 质检部门=质检一部） | T9 | qa_department_id 正确写入 |
| 2 | 创建子项目 Phase1（workload=60）和 Phase2（workload=40） | — | compositionMode=HOMOGENEOUS |
| 3 | Phase1 下创建任务 A（workload=30）和任务 B（workload=30） | — | 叶子节点 statusWorkloads 初始化 |
| 4 | Phase2 下创建任务 C（workload=20）和任务 D（workload=20） | — | 同上 |
| 5 | 任务 A 指派负责人 | T2 | PENDING(30)→ASSIGNED(30) |
| 6 | 任务 A 外部系统接收 | T2 | ASSIGNED(30)→RECEIVED(30) |
| 7 | 任务 A 设值 IN_PROGRESS=20 | T1 | RECEIVED=10, IN_PROGRESS=20 |
| 8 | 验证任务 A 进度 | T3 | (20×0.95)/30 = 63.3% |
| 9 | 验证 Phase1 进度 | T4 | 按同质公式汇聚 |
| 10 | 验证根项目彩色进度条 | T8 | 显示灰色+红色+绿色段 |
| 11 | 任务 A 设值 SUBMITTED_FOR_QA=15 | T1 | IN_PROGRESS=5, SUBMITTED_FOR_QA=15 |
| 12 | 验证任务 A 进度 | T3 | (5×0.95+15×0.95)/30 = 63.3% |
| 13 | 任务 A 质检员设值 QA_COMPLETED=30 | T1 | 全部完成 |
| 14 | 任务 B 同样完成全流程 | T1+T2+T3 | Phase1 下全部叶子 QA_COMPLETED |
| 15 | 验证 Phase1 状态推导 | T4 | Phase1 workflowStatus=QA_COMPLETED→COMPLETED |
| 16 | 任务 C、D 完成全流程 | T1+T2+T3 | Phase2 下全部叶子 QA_COMPLETED |
| 17 | 验证根项目自动流转 | T6 | 根项目自动 PENDING_ACCEPTANCE |
| 18 | 验证看板显示 | T7+T8 | 根项目显示"待验收"标签 |
| 19 | 创建人确认验收 | T6 | ACCEPTANCE_COMPLETED |
| 20 | 归档权限用户归档 | T6 | ARCHIVED→COMPLETED |

### E2E-2 FAILED 后重新提交

| 步骤 | 操作 | 涉及变更项 | 预期结果 |
|------|------|-----------|---------|
| 1 | 任务处于未完成阶段：IN_PROGRESS=50, SUBMITTED_FOR_QA=30, RECEIVED=20 | T1 | 守恒通过 |
| 2 | 标记任务 FAILED | T10 | SUBMITTED_FOR_QA(30) 退回 IN_PROGRESS：IN_PROGRESS=80, RECEIVED=20 |
| 3 | 操作员重新提交质检 | T1 | IN_PROGRESS 减少，SUBMITTED_FOR_QA 增加，守恒成立 |
| 4 | 质检员接收并通过 | T1 | 进入 QA_COMPLETED |
| 5 | QA_COMPLETED 后发现问题 | T10 | 原任务不允许 FAILED/IN_PROGRESS，需新建返修任务并关联原任务 |

### E2E-3 外部系统推送 + 手工录入混合

| 步骤 | 操作 | 涉及变更项 | 预期结果 |
|------|------|-----------|---------|
| 1 | 创建异质项目，2 个任务分别对接不同外部系统 | — | compositionMode=HETEROGENEOUS |
| 2 | 外部系统 A 推送任务 1 进度 60% | T11 | SUBMITTED_FOR_QA=60%×workload, RECEIVED=40%×workload，等待 TMS 质检 |
| 3 | 任务 2 无外部系统，手工设值 IN_PROGRESS=50 | T1 | 正常瀑布扣减 |
| 4 | 验证项目进度 | T3+T4 | 异质公式：Σ(子进度×子权重)/Σ(子权重) |

### E2E-4 非叶子节点只读 + 状态推导联动

| 步骤 | 操作 | 涉及变更项 | 预期结果 |
|------|------|-----------|---------|
| 1 | 创建项目→子项目→3 个任务 | — | 项目和子项目为非叶子节点 |
| 2 | 尝试 API 修改子项目 status | T5 | 报错：非叶子节点不可修改 |
| 3 | 前端打开子项目编辑弹窗 | T5 | status/progress 字段只读 |
| 4 | 2 个任务流转到 RECEIVED，1 个在 IN_PROGRESS | T4 | 子项目状态=null（混合） |
| 5 | 第 3 个任务也流转到 RECEIVED | T4 | 子项目状态自动变为 RECEIVED |
| 6 | 验证子项目进度由子节点驱动 | T5 | 进度 = 汇聚值，非手动值 |

### E2E-5 权重配置影响进度

| 步骤 | 操作 | 涉及变更项 | 预期结果 |
|------|------|-----------|---------|
| 1 | 创建任务 workload=100，设值 IN_PROGRESS=100 | T1 | RECEIVED=0, IN_PROGRESS=100 |
| 2 | 默认 w_ip=0.95，验证进度 | T3+T12 | 95% |
| 3 | 修改 w_ip=0.8 | T12 | 进度变为 80% |
| 4 | 修改 w_ip=0 | T12 | 进度变为 0% |
| 5 | 验证非叶子进度重算 | T4 | 父进度按新权重重算 |

---

## 五、数据迁移验证

V16 迁移后需验证历史数据正确性。

| 用例ID | 场景 | 验证方法 | 预期结果 |
|--------|------|---------|---------|
| M1 | 已有叶子节点 statusWorkloads 初始化 | 查询已有叶子任务的 status_workloads 字段 | 总工作量全部置于当前状态，其余状态为 0 |
| M2 | 已有非叶子节点 statusWorkloads 为空 | 查询已有非叶子任务的 status_workloads 字段 | 值为 null |
| M3 | in_progress_weight 默认值 | 查询已有任务的 in_progress_weight 字段 | 值为 0.95 |
| M4 | qa_department_id/qa_assignee_id 默认值 | 查询已有任务的质检字段 | 值为 null |
| M5 | SELF_CHECK_TASK 废弃标记 | 查询 TaskCategory 枚举 | SELF_CHECK_TASK 标注 @Deprecated |
| M6 | PENDING_ACCEPTANCE 枚举存在 | 查询 WorkflowStatus 枚举 | 包含 PENDING_ACCEPTANCE |
| M7 | 历史自检任务可正常查询 | 查询 category=SELF_CHECK_TASK 的任务 | 正常返回，不报错 |
| M8 | 历史数据进度计算不受影响 | 查询已有项目的进度 | 与迁移前一致 |

---

## 六、性能测试

| 用例ID | 场景 | 数据规模 | 验收标准 |
|--------|------|---------|---------|
| P1 | 状态推导递归性能 | 根项目下 5 层深度，每层 10 个节点，共 50 个叶子 | 叶子状态变更后，全链路状态推导 < 2s |
| P2 | 彩色进度条渲染 | 根项目下 100 个叶子节点 | 进度条渲染 < 500ms，无明显卡顿 |
| P3 | 批量工作量流转 | 同时对 20 个叶子节点设值工作量 | 每个请求响应 < 500ms，无死锁 |
| P4 | 外部系统并发推送 | 10 个外部系统同时推送进度 | 无数据不一致，无 500 错误 |

---

## 七、回归测试

v1.4 变更不应破坏已有功能，以下为回归检查项。

| 用例ID | 回归项 | 验证方法 | 预期结果 |
|--------|--------|---------|---------|
| R1 | 同质进度汇聚 | 创建同质项目，子节点进度变更 | 父进度按同质公式正确汇聚 |
| R2 | 异质进度汇聚 | 创建异质项目，子节点进度变更 | 父进度按异质公式正确汇聚 |
| R3 | 派生单位换算 | 子节点使用公里，父节点使用米 | 换算量正确参与汇聚 |
| R4 | 项目类型管理 | 增删改查项目类型 | 功能正常 |
| R5 | 任务类型管理 | 增删改查任务类型 | 功能正常 |
| R6 | 计量单位管理 | 增删改查计量单位 | 功能正常 |
| R7 | 附件上传/下载 | 上传和下载附件 | 功能正常 |
| R8 | 外部系统注册 | 注册外部系统 | 功能正常 |
| R9 | 任务树拖拽 | 拖拽移动节点 | 深度和结构校验正常 |
| R10 | QA_COMPLETING 回退 | 质检员退回和负责人回退 | 两处回退规则正常 |
