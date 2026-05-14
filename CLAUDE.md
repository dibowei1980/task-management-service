# Project Context

## About This Project
"生产协同系统"多模块仓库，包含任务协同前端、桥梁去除业务前端、Spring Boot 任务管理后端、Python 桥梁去除服务。

## Tech Stack
- **task-dashboard**: React 18 + TypeScript 5 + Vite 6 + Tailwind CSS + zustand
- **bridge-dashboard**: React 18 + TypeScript 5 + Vite 6 + Tailwind CSS
- **task-management-service**: Java 17 + Spring Boot 3.2 + Spring Data JPA + Spring Security
- **bridge-removal-service**: Python + Flask 3 + OpenCV + NumPy + Shapely
- **数据库**: H2（开发）/ PostgreSQL（生产），Flyway 迁移

## Code Style & Conventions
- 前端组件 `PascalCase`，变量/函数 `camelCase`，函数组件 + Hooks
- Java 类 `PascalCase`，包名 `com.example.taskmanagement`，`controller -> service -> repository` 分层
- Python 模块/函数/变量 `snake_case`
- 前端 API 调用集中在 `src/services`，认证态通过 `context/AuthContext.tsx` 管理
- 后端控制器返回 `ResponseEntity`，异常统一由 `ApiExceptionHandler` 处理，写操作 `@Transactional`
- **安全**：密钥/token 不进代码或文档，优先环境变量覆盖配置

## Common Commands
```bash
# 一键启动（Windows PowerShell）
.\start.ps1

# task-dashboard (port 5173)
cd task-dashboard && npm install && npm run dev -- --port 5173
npm run lint && npm run check && npm run build

# bridge-dashboard (port 5174)
cd bridge-dashboard && npm install && npm run dev -- --port 5174
npm run lint && npm run check && npm run build

# task-management-service (port 8082)
cd task-management-service
.\mvnw.cmd test
.\mvnw.cmd -DskipTests compile
.\mvnw.cmd -DskipTests spring-boot:run

# bridge-removal-service (port 5050)
cd bridge-removal-service && pip install -r requirements.txt && python app.py
python smoke_test_bridge_removal.py
```

## Key Directories
```text
生产协同系统/
├── task-dashboard/              # 任务协同前端（看板、工作台、QA、权限路由）
├── bridge-dashboard/            # 桥梁业务前端
├── task-management-service/     # Spring Boot 后端
│   ├── src/main/.../controller/ # REST 接口
│   ├── src/main/.../service/    # 业务逻辑
│   ├── src/main/.../security/   # 认证与权限
│   ├── src/main/resources/db/migration/  # Flyway 迁移脚本
│   └── src/test/java/           # 后端测试
├── bridge-removal-service/      # Flask 桥梁去除服务
│   ├── api/                     # HTTP 路由（auth/projects/tasks/shapefiles）
│   ├── bridge_removal/          # 算法模块（分割/掩膜/修复/拼接）
│   ├── db/                      # 数据模型与仓库
│   └── services/                # 业务服务（callback/job/project）
├── docs/                        # TPM为前缀的是TPM系列设计文档
├── .trae/                       # Trae 规则与参考文档
└── start.ps1                    # 一键启动脚本
```

## Important Constraints

### 跨模块集成
- 四个模块端口固定：task-dashboard `5173`、bridge-dashboard `5174`、后端 `8082`、桥梁服务 `5050`；变更端口需同步检查前端环境变量、后端 CORS 和启动脚本
- `start.ps1` 同时拉起所有模块，修改启动方式时需同步更新
- bridge-removal-service 可独立运行，TMS 不可用时桥梁核心功能不受影响

### 认证架构
- task-dashboard：SSO OAuth2 授权码模式，通过后端代理 SSO 流程，JWT 作为本地令牌
- bridge-dashboard：SSO + 本地登录 fallback（开发/演示）
- bridge-removal-service：三路验证（本地 token / 内部自动化 token / SSO API Token）
- bridge-dashboard 不直连 task-management-service，通过 bridge-removal-service 的 UPM 代理获取用户/部门数据
- SSO 环境变量：`SSO_BASE_URL`、`SSO_CLIENT_ID`、`SSO_CLIENT_SECRET`、`SSO_REDIRECT_URI`

### 后端约束
- 默认数据源内存 H2（`ddl-auto=update`），Flyway 在此配置下关闭；切 PostgreSQL 时需核对数据源、方言和迁移策略
- 权限判断大量依赖 `departmentId`、`userId`；修改过滤器或控制器签名时需检查部门级和全局权限
- 外部系统对接使用 `externalSystem` + `externalTaskId` 做幂等 upsert，需防止 ID 冲突
- 外部系统注册准入通过 SSO 客户端白名单实现，`supportedTaskTypes` 具独占性
- 外部系统回调只发送平台标准状态，TMS 不存储或翻译业务状态

### 任务模型核心规则
- **结构约束**：每层直接子节点必须"全同或全异"，同类型任务不能散落到多个兄弟目录
- **权重**：0.01~100，默认 1，同级不要求汇总为 1，仅作相对系数
- **进度汇聚**：同质任务按 `权重 × 工作量 × 进度`，异质任务按 `权重 × 进度`
- **深度限制**：PROJECT → PHASE → ... → OPERATION_TASK，最深 5 层（`task.tree.max-depth`）
- **状态流转**：PENDING → ASSIGNED → RECEIVED → IN_PROGRESS → SUBMITTED_FOR_QA → QA_COMPLETING → QA_COMPLETED → COMPLETED；QA_COMPLETED 为稳定态，不允许直接 FAILED，需新建返修任务
- **叶子节点进度**：由工作量驱动，不可手动编辑；非叶子节点进度由子节点推导

### 质量门禁
- 前端改动后至少运行 `npm run lint` + `npm run check`
- 后端改动后至少运行 `.\mvnw.cmd test`，成本较高时至少 `.\mvnw.cmd -DskipTests compile`
- Python 服务改动后至少执行 `python smoke_test_bridge_removal.py`

## Notes

### 配置与环境变量
- SSO：`SSO_BASE_URL`、`SSO_CLIENT_ID`、`SSO_CLIENT_SECRET`、`SSO_REDIRECT_URI`
- UPM：`UPM_BASE_URL`、`UPM_INTERNAL_API_KEY`、`UPM_SERVICE_USERNAME`、`UPM_SERVICE_PASSWORD`
- CORS：`APP_CORS_ALLOWED_ORIGINS`

### 审查优先级
- `TaskController`、`TaskServiceImpl`、`TaskScopePolicy`：决定状态流转、权限边界和外部同步
- `SecurityConfig`：公开端点、CORS、异常响应格式
- `ApiExceptionHandler` / 日志模块：JSON 错误结构和脱敏规则一致性
- Python 桥梁处理逻辑较重，无明确需求时不要改动模型文件和算法资源
