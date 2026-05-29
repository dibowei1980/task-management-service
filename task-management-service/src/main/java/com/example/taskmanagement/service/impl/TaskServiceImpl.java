package com.example.taskmanagement.service.impl;

import com.example.taskmanagement.dto.AssignRequest;
import com.example.taskmanagement.dto.DecomposeRequest;
import com.example.taskmanagement.dto.SubTaskItem;
import com.example.taskmanagement.dto.SubmitCompletionRequest;
import com.example.taskmanagement.dto.TaskCreateRequest;
import com.example.taskmanagement.dto.TaskResponse;
import com.example.taskmanagement.dto.TaskUpdateRequest;
import com.example.taskmanagement.dto.PersonnelWorkStatsResponse;
import com.example.taskmanagement.dto.ProgressFormula;
import com.example.taskmanagement.dto.WorkflowStatusUpdateRequest;
import com.example.taskmanagement.model.CompositionMode;
import com.example.taskmanagement.model.Task;
import com.example.taskmanagement.model.TaskAssignment;
import com.example.taskmanagement.model.TaskAssignmentRole;
import com.example.taskmanagement.model.TaskCategory;
import com.example.taskmanagement.model.TaskStatus;
import com.example.taskmanagement.model.WorkflowStages;
import com.example.taskmanagement.model.WorkflowStatus;

import com.example.taskmanagement.repository.TaskAssignmentRepository;
import com.example.taskmanagement.repository.TaskAttachmentRepository;
import com.example.taskmanagement.repository.TaskRepository;
import com.example.taskmanagement.security.TaskScopePolicy;
import com.example.taskmanagement.service.ProjectTypeService;
import com.example.taskmanagement.service.TaskTypeService;
import com.example.taskmanagement.service.TaskExecutor;
import com.example.taskmanagement.service.TaskExecutorRegistry;
import com.example.taskmanagement.service.TaskService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.time.ZonedDateTime;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.Map;

@Service
public class TaskServiceImpl implements TaskService {

    private static final Logger logger = LoggerFactory.getLogger(TaskServiceImpl.class);

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private TaskAssignmentRepository taskAssignmentRepository;

    @Autowired
    private com.example.taskmanagement.service.DependencyService dependencyService;

    @Autowired
    private TaskScopePolicy taskScopePolicy;

    @Autowired
    private TaskExecutorRegistry executorRegistry;

    @Autowired
    private com.example.taskmanagement.upm.UpmClient upmClient;

    @Autowired
    private ProjectTypeService projectTypeService;

    @Autowired
    private TaskTypeService taskTypeService;

    @Autowired
    private com.example.taskmanagement.repository.MeasurementUnitDefinitionRepository measurementUnitRepository;

    @Autowired
    private com.example.taskmanagement.service.UnitConversionService unitConversionService;

    @Autowired
    private com.example.taskmanagement.service.QaPushService qaPushService;

    @Autowired
    private com.example.taskmanagement.service.SseNotificationService sseNotificationService;

    @Autowired
    private TaskAttachmentRepository taskAttachmentRepository;

    @Autowired
    private ProgressCalculationHelper progressCalculationHelper;

    @Autowired
    private StatusWorkloadHelper statusWorkloadHelper;

    @Autowired
    private TaskPermissionHelper taskPermissionHelper;

    @Autowired
    private TaskValidationHelper taskValidationHelper;

    @Autowired
    private com.example.taskmanagement.repository.TaskHandoffRecordRepository handoffRecordRepository;

    @Autowired
    private com.example.taskmanagement.repository.TaskActionAttachmentRepository actionAttachmentRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${task.tree.max-depth:5}")
    private int maxTreeDepth;

    @Override
    @Transactional
    public TaskResponse createTask(TaskCreateRequest request, Authentication authentication, String departmentId, UUID userId) {
        if (request.getParentTaskId() != null && request.getName() != null && !request.getName().isBlank()) {
            if (taskRepository.existsByParentTaskIdAndName(request.getParentTaskId(), request.getName().trim())) {
                throw new IllegalArgumentException("同一父任务下已存在同名子项：「" + request.getName().trim() + "」");
            }
        }

        String externalSystem = request.getExternalSystem();
        String externalTaskId = request.getExternalTaskId();
        boolean isExternal = externalSystem != null && !externalSystem.isBlank()
                && externalTaskId != null && !externalTaskId.isBlank();

        TaskCategory category = request.getCategory() == null ? TaskCategory.OPERATION_TASK : request.getCategory();
        if (category == TaskCategory.PROJECT) {
            if (!taskPermissionHelper.hasAny(authentication, "project:create", "PROJECT:CREATE")) {
                throw new AccessDeniedException("Forbidden");
            }
            boolean canGlobal = taskPermissionHelper.hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL");
            boolean canDepartment = taskPermissionHelper.hasAny(authentication,
                    "project:read_department",
                    "project:update_department"
            );
            if (!canGlobal && !canDepartment) {
                throw new AccessDeniedException("Forbidden");
            }
            String projectDepartmentId = request.getDepartmentId();
            if (projectDepartmentId != null && projectDepartmentId.isBlank()) {
                projectDepartmentId = null;
            }
            if (projectDepartmentId == null) {
                projectDepartmentId = departmentId;
            }
            if (!canGlobal && projectDepartmentId != null && request.getDepartmentId() != null
                    && !request.getDepartmentId().isBlank()
                    && !request.getDepartmentId().equals(projectDepartmentId)) {
                throw new IllegalArgumentException("departmentId must match your department");
            }
            if (projectDepartmentId == null && request.getProjectLeaderId() != null) {
                throw new IllegalArgumentException("责任部门为空时不能指定项目负责人");
            }
            String createdByName = request.getCreatedByName();
            if ((createdByName == null || createdByName.isBlank()) && authentication != null) {
                createdByName = authentication.getName();
            }
            String createdDepartmentId = departmentId;
            if (createdDepartmentId == null || createdDepartmentId.isBlank()) {
                createdDepartmentId = request.getCreatedDepartmentId();
            }
            if (createdDepartmentId == null || createdDepartmentId.isBlank()) {
                createdDepartmentId = projectDepartmentId;
            }
            String createdDepartmentName = request.getCreatedDepartmentName();

            if (isExternal) {
                Task existing = taskRepository.findByExternalSystemAndExternalTaskId(externalSystem, externalTaskId).orElse(null);
                if (existing != null) {
                    if (existing.getCategory() != TaskCategory.PROJECT) {
                        throw new IllegalArgumentException("external task id already used by non-project task");
                    }
                    if (!taskPermissionHelper.hasAny(authentication, "project:update_global", "PROJECT:UPDATE_GLOBAL")) {
                        throw new AccessDeniedException("Forbidden");
                    }
                    if (!canGlobal) {
                        taskPermissionHelper.enforceDepartmentAccess(existing, departmentId);
                    }
                    if (request.getName() != null && !request.getName().isBlank()) {
                        existing.setName(request.getName());
                    }
                    if (request.getType() != null) {
                        projectTypeService.validateTypeCodeUsable(request.getType());
                        existing.setType(request.getType());
                        if (request.getWorkloadUnit() != null && !request.getWorkloadUnit().isBlank()) {
                            existing.setWorkloadUnit(request.getWorkloadUnit());
                        }
                    }
                    if (request.getStatus() != null) {
                        existing.setStatus(request.getStatus());
                    }
                    if (request.getPriority() != null) {
                        existing.setPriority(request.getPriority());
                    }
                    if (request.getProjectLeaderId() != null) {
                        taskPermissionHelper.validateProjectLeader(request.getProjectLeaderId(), existing.getDepartmentId(), authentication);
                        existing.setAssigneeId(request.getProjectLeaderId());
                    }
                    if (request.getPlannedDueAt() != null) {
                        existing.setPlannedDueAt(request.getPlannedDueAt());
                    }
                    if (request.getInputParams() != null) {
                        existing.setInputParams(request.getInputParams());
                    }
                    if (request.getOutputResults() != null) {
                        existing.setOutputResults(request.getOutputResults());
                    }
                    if (canGlobal) {
                        String newDepartmentId = request.getDepartmentId();
                        if (newDepartmentId != null && newDepartmentId.isBlank()) {
                            newDepartmentId = null;
                        }
                        if (newDepartmentId != null) {
                            existing.setDepartmentId(newDepartmentId);
                        }
                    }
                    if (existing.getCreatedByName() == null || existing.getCreatedByName().isBlank()) {
                        existing.setCreatedByName(createdByName);
                    }
                    if (existing.getCreatedById() == null && userId != null) {
                        existing.setCreatedById(userId);
                    }
                    if (existing.getCreatedDepartmentId() == null || existing.getCreatedDepartmentId().isBlank()) {
                        existing.setCreatedDepartmentId(createdDepartmentId);
                    }
                    if (existing.getCreatedDepartmentName() == null || existing.getCreatedDepartmentName().isBlank()) {
                        existing.setCreatedDepartmentName(createdDepartmentName);
                    }
                    existing.setExternalSystem(externalSystem);
                    existing.setExternalTaskId(externalTaskId);
                    if (request.getExternalUrl() != null) {
                        existing.setExternalUrl(request.getExternalUrl());
                    }
                    Task saved = taskRepository.save(existing);
                    if (request.getOperatorIds() != null) {
                        createOrReplaceAssignments(saved.getId(), request.getOperatorIds(), TaskAssignmentRole.OPERATOR);
                    }
                    return notifyAndReturn(saved, "create");
                }
            }

            Task project = new Task();
            project.setName(request.getName());
            String defaultProjectType = request.getType() != null ? request.getType() : executorRegistry.resolveDefaultType(TaskCategory.PROJECT);
            if (defaultProjectType != null) {
                projectTypeService.validateTypeCodeUsable(defaultProjectType);
                project.setType(defaultProjectType);
                if (request.getWorkloadUnit() != null && !request.getWorkloadUnit().isBlank()) {
                    project.setWorkloadUnit(request.getWorkloadUnit());
                }
            }
            project.setCategory(TaskCategory.PROJECT);
            if (projectDepartmentId != null) {
                project.setStatus(TaskStatus.ASSIGNED);
            } else {
                project.setStatus(request.getStatus() == null ? TaskStatus.PENDING : request.getStatus());
            }
            if (project.getStatus() == TaskStatus.ASSIGNED && userId != null) {
                project.setAssignerId(userId);
            }
            project.setPriority(request.getPriority());
            project.setDepartmentId(projectDepartmentId);
            project.setCreatedByName(createdByName);
            project.setCreatedById(userId);
            project.setCreatedDepartmentId(createdDepartmentId);
            project.setCreatedDepartmentName(createdDepartmentName);
            project.setExternalSystem(isExternal ? externalSystem : null);
            project.setExternalTaskId(isExternal ? externalTaskId : null);
            project.setExternalUrl(request.getExternalUrl());
            taskPermissionHelper.validateProjectLeader(request.getProjectLeaderId(), projectDepartmentId, authentication);
            project.setAssigneeId(request.getProjectLeaderId());
            project.setControllerId(userId);
            project.setPlannedDueAt(request.getPlannedDueAt());
            project.setInputParams(request.getInputParams());
            project.setOutputResults(request.getOutputResults());
            project.setQaDepartmentId(request.getQaDepartmentId());
            project.setQaAssigneeId(request.getQaAssigneeId());
            if (request.getWorkload() == null || request.getWorkload() <= 0) {
                throw new IllegalArgumentException("项目下达时 workload 为必填项，且必须大于 0");
            }
            project.setWorkload(request.getWorkload());
            if (project.getWorkloadUnit() == null) {
                project.setWorkloadUnit(request.getWorkloadUnit());
            }
            project.setRemarks(request.getRemarks());
            if (project.getWorkload() != null && project.getWorkload() > 0) {
                statusWorkloadHelper.ensureStatusWorkloads(project);
            }
            if (request.getParentTaskId() != null) {
                Task parentProject = getTaskEntityById(request.getParentTaskId());
                if (parentProject.getCategory() != TaskCategory.PROJECT) {
                    throw new IllegalArgumentException("子项目的父任务必须是项目类型");
                }
                project.setParentTaskId(request.getParentTaskId());
                project.setProjectId(parentProject.getProjectId() == null ? parentProject.getId() : parentProject.getProjectId());
            }
            executorRegistry.findExecutor(project).ifPresent(ex -> ex.normalizeInputParams(project));
            Task saved = taskRepository.save(project);
            if (request.getOperatorIds() != null) {
                createOrReplaceAssignments(saved.getId(), request.getOperatorIds(), TaskAssignmentRole.OPERATOR);
            }
            if (saved.getParentTaskId() != null) {
                progressCalculationHelper.updateParentCompositionMode(saved.getParentTaskId());
                progressCalculationHelper.recalculateAncestorProgressAndStatus(saved.getParentTaskId());
            }
            recordHandoff(saved, "CREATE", null, userId, null, saved.getDepartmentId(),
                    null, saved.getAssigneeId(), null, saved.getAssignerId(),
                    null, saved.getStatus().name(), userId);
            return notifyAndReturn(saved, "create");
        }

        if (!taskPermissionHelper.hasAny(authentication, "task:create", "TASK:CREATE")) {
            throw new AccessDeniedException("Forbidden");
        }

        if (category == TaskCategory.SELF_CHECK_TASK) {
            throw new IllegalArgumentException("SELF_CHECK_TASK 已废弃，不再支持创建");
        }

        UUID projectId = request.getProjectId();
        UUID parentTaskId = request.getParentTaskId();

        if (projectId == null) {
            if (parentTaskId == null) {
                throw new IllegalArgumentException("projectId is required");
            }
            Task parent = getTaskEntityById(parentTaskId);
            projectId = parent.getProjectId() == null ? parent.getId() : parent.getProjectId();
        }

        Task project = getTaskEntityById(projectId);
        if (project.getCategory() != TaskCategory.PROJECT) {
            throw new IllegalArgumentException("projectId must reference a PROJECT");
        }

        if (!taskPermissionHelper.canReadTask(project, authentication, departmentId, null, userId)) {
            throw new AccessDeniedException("Forbidden");
        }
        List<TaskAssignment> parentAssignments = parentTaskId == null ? List.of() : taskAssignmentRepository.findByIdTaskId(parentTaskId);
        Task parentTask = parentTaskId == null ? null : getTaskEntityById(parentTaskId);
        taskScopePolicy.assertCanCreate(authentication, userId, departmentId, project, parentTaskId, parentTask, parentAssignments);

        String createdByName = request.getCreatedByName();
        if ((createdByName == null || createdByName.isBlank()) && authentication != null) {
            createdByName = authentication.getName();
        }
        String createdDepartmentId = departmentId;
        if (createdDepartmentId == null || createdDepartmentId.isBlank()) {
            createdDepartmentId = request.getCreatedDepartmentId();
        }
        if (createdDepartmentId == null || createdDepartmentId.isBlank()) {
            createdDepartmentId = project.getDepartmentId();
        }
        String createdDepartmentName = request.getCreatedDepartmentName();

        if (isExternal) {
            Task existing = taskRepository.findByExternalSystemAndExternalTaskId(externalSystem, externalTaskId).orElse(null);
            if (existing != null) {
                if (existing.getCategory() == TaskCategory.PROJECT) {
                    throw new IllegalArgumentException("external task id already used by project");
                }
                if (!taskPermissionHelper.hasAny(authentication,
                        "task:update_global",
                        "task:update_department",
                        "task:update_project",
                        "TASK:UPDATE_GLOBAL",
                        "TASK:UPDATE_DEPARTMENT",
                        "TASK:UPDATE_PROJECT")) {
                    throw new AccessDeniedException("Forbidden");
                }
                if (request.getProjectId() != null && existing.getProjectId() != null && !request.getProjectId().equals(existing.getProjectId())) {
                    throw new IllegalArgumentException("projectId mismatch for existing external task");
                }
                Task existingProject = existing.getProjectId() == null ? null : getTaskEntityById(existing.getProjectId());
                if (existingProject != null) {
                    if (!taskPermissionHelper.canReadTask(existingProject, authentication, departmentId, null, userId)) {
                        throw new AccessDeniedException("Forbidden");
                    }
                }
                if (request.getName() != null && !request.getName().isBlank()) {
                    existing.setName(request.getName());
                }
                if (request.getType() != null) {
                    projectTypeService.validateTypeCodeUsable(request.getType());
                    existing.setType(request.getType());
                    if (request.getWorkloadUnit() != null && !request.getWorkloadUnit().isBlank()) {
                        existing.setWorkloadUnit(request.getWorkloadUnit());
                    }
                }
                if (request.getStatus() != null) {
                    existing.setStatus(request.getStatus());
                }
                if (request.getPriority() != null) {
                    existing.setPriority(request.getPriority());
                }
                if (request.getPlannedDueAt() != null) {
                    existing.setPlannedDueAt(request.getPlannedDueAt());
                }
                if (request.getInputParams() != null) {
                    existing.setInputParams(request.getInputParams());
                }
                if (request.getOutputResults() != null) {
                    existing.setOutputResults(request.getOutputResults());
                }
                if (existing.getCreatedByName() == null || existing.getCreatedByName().isBlank()) {
                    existing.setCreatedByName(createdByName);
                }
                if (existing.getCreatedById() == null && userId != null) {
                    existing.setCreatedById(userId);
                }
                if (existing.getCreatedDepartmentId() == null || existing.getCreatedDepartmentId().isBlank()) {
                    existing.setCreatedDepartmentId(createdDepartmentId);
                }
                if (existing.getCreatedDepartmentName() == null || existing.getCreatedDepartmentName().isBlank()) {
                    existing.setCreatedDepartmentName(createdDepartmentName);
                }
                existing.setExternalSystem(externalSystem);
                existing.setExternalTaskId(externalTaskId);
                if (request.getExternalUrl() != null) {
                    existing.setExternalUrl(request.getExternalUrl());
                }
                Task saved = taskRepository.save(existing);

                if (saved.getCategory() == TaskCategory.OPERATION_TASK && request.getOperatorIds() != null) {
                    createOrReplaceAssignments(saved.getId(), request.getOperatorIds(), TaskAssignmentRole.OPERATOR);
                }

                return notifyAndReturn(saved, "create");
            }
        }

        Task task = new Task();
        task.setName(request.getName());
        String defaultTaskType = request.getType() != null ? request.getType() : executorRegistry.resolveDefaultType(category);
        if (defaultTaskType != null) {
            taskValidationHelper.validateTypeCodeByCategory(defaultTaskType, category);
            task.setType(defaultTaskType);
            if ((request.getWorkloadUnit() == null || request.getWorkloadUnit().isBlank())) {
                task.setWorkloadUnit(taskValidationHelper.resolveWorkloadUnit(defaultTaskType, null, category));
            }
        }
        if (task.getType() == null && category != TaskCategory.PROJECT && category != TaskCategory.PHASE) {
            throw new IllegalArgumentException("type is required for " + category + " tasks");
        }
        task.setCategory(category);
        TaskStatus defaultStatus = (request.getOperatorIds() != null && !request.getOperatorIds().isEmpty())
                ? TaskStatus.ASSIGNED : TaskStatus.PENDING;
        task.setStatus(request.getStatus() == null ? defaultStatus : request.getStatus());
        if (task.getStatus() == TaskStatus.ASSIGNED && userId != null) {
            task.setAssignerId(userId);
            if (task.getAssigneeId() == null && request.getOperatorIds() != null && !request.getOperatorIds().isEmpty()) {
                task.setAssigneeId(request.getOperatorIds().get(0));
            }
        }
        task.setPriority(request.getPriority());
        task.setDepartmentId(project.getDepartmentId());
        task.setCreatedByName(createdByName);
        task.setCreatedById(userId);
        task.setCreatedDepartmentId(createdDepartmentId);
        task.setCreatedDepartmentName(createdDepartmentName);
        task.setExternalSystem(isExternal ? externalSystem : null);
        task.setExternalTaskId(isExternal ? externalTaskId : null);
        task.setExternalUrl(request.getExternalUrl());
        task.setProjectId(project.getId());

        UUID effectiveParentId = parentTaskId == null ? project.getId() : parentTaskId;
        int parentDepth = progressCalculationHelper.calculateTaskDepth(effectiveParentId);
        if (parentDepth >= maxTreeDepth) {
            throw new IllegalArgumentException("任务树深度已达上限（" + maxTreeDepth + "层），不可再创建子任务");
        }
        task.setParentTaskId(effectiveParentId);
        task.setPlannedDueAt(request.getPlannedDueAt());
        task.setInputParams(request.getInputParams());
        task.setOutputResults(request.getOutputResults());
        task.setWorkload(request.getWorkload());
        task.setWorkloadUnit(taskValidationHelper.resolveWorkloadUnit(task.getType(), request.getWorkloadUnit(), task.getCategory()));
        task.setWeight(taskValidationHelper.defaultWeight(request.getWeight()));
        task.setRemarks(request.getRemarks());
        task.setInProgressWeight(request.getInProgressWeight() != null ? request.getInProgressWeight() : 0.95);
        task.setQaDepartmentId(request.getQaDepartmentId());
        task.setQaAssigneeId(request.getQaAssigneeId());

        taskValidationHelper.validateWorkload(task.getWorkload());
        taskValidationHelper.validateWeightRange(task.getWeight());
        if (task.getParentTaskId() != null && task.getType() != null && !task.getType().isBlank()) {
            taskValidationHelper.validateParentChildTypeConstraint(task.getParentTaskId(), task.getType(), null);
            taskValidationHelper.validateHomogeneousChildWorkloadRequired(task.getParentTaskId(), task.getType(), task.getWorkload());
            taskValidationHelper.validateHomogeneousParentWorkload(task.getParentTaskId(), task.getType(), task.getWorkload(), task.getWorkloadUnit(), null);
        }

        task.setControllerId(userId);
        Task saved = taskRepository.save(task);
        if (statusWorkloadHelper.isLeafTask(saved) && saved.getStatusWorkloads() == null && saved.getWorkload() != null) {
            statusWorkloadHelper.ensureStatusWorkloads(saved);
            taskRepository.save(saved);
        }
        boolean needsSelfCheck = executorRegistry.findExecutor(saved).map(ex -> ex.onTaskCreated(saved)).orElse(false);

        if (saved.getParentTaskId() != null) {
            progressCalculationHelper.updateParentCompositionMode(saved.getParentTaskId());
            progressCalculationHelper.recalculateAncestorProgressAndStatus(saved.getParentTaskId());
        }

        if (category == TaskCategory.OPERATION_TASK) {
            createOrReplaceAssignments(saved.getId(), request.getOperatorIds(), TaskAssignmentRole.OPERATOR);
        }

        recordHandoff(saved, "CREATE", null, userId, null, saved.getDepartmentId(),
                null, saved.getAssigneeId(), null, saved.getAssignerId(),
                null, saved.getStatus().name(), userId);
        return notifyAndReturn(saved, "create");
    }

    @Override
    public TaskResponse getTaskById(UUID id, Authentication authentication, String departmentId, String departmentName, UUID userId) {
        Task task = getTaskEntityById(id);
        if (!taskPermissionHelper.canReadTask(task, authentication, departmentId, departmentName, userId)) {
            throw new AccessDeniedException("Forbidden");
        }
        return toResponse(task);
    }


    @Override
    public Page<TaskResponse> getAllTasks(Pageable pageable, Authentication authentication, String departmentId, String departmentName, UUID userId, TaskCategory category, String externalSystem) {
        Page<Task> page;
        if (externalSystem != null && !externalSystem.isBlank()) {
            page = category == null
                    ? taskRepository.findAllByExternalSystem(externalSystem, pageable)
                    : taskRepository.findAllByExternalSystemAndCategory(externalSystem, category, pageable);
            return page.map(this::toResponse);
        }
        if (taskPermissionHelper.hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            page = category == null ? taskRepository.findAll(pageable) : taskRepository.findAllByCategory(category, pageable);
        } else if (taskPermissionHelper.hasAny(authentication, "project:read_department", "PROJECT:READ_DEPARTMENT", "task:read_department", "TASK:READ_DEPARTMENT") && (departmentId != null || (departmentName != null && !departmentName.isBlank()))) {
            page = category == null
                    ? taskRepository.findAllForDepartmentScope(departmentId, departmentName, pageable)
                    : taskRepository.findAllForDepartmentScopeWithCategory(departmentId, departmentName, category, pageable);
        } else if (taskPermissionHelper.hasAny(authentication, "project:read_own", "PROJECT:READ_OWN", "task:read_project", "TASK:READ_PROJECT") && userId != null) {
            TaskCategory effectiveCategory = category == null ? TaskCategory.PROJECT : category;
            page = taskRepository.findAllForProjectLeader(effectiveCategory, userId, departmentId, pageable);
        } else if (departmentId != null) {
            page = category == null
                    ? taskRepository.findAllByDepartmentId(departmentId, pageable)
                    : taskRepository.findAllByDepartmentIdAndCategory(departmentId, category, pageable);
        } else {
            page = category == null ? taskRepository.findAll(pageable) : taskRepository.findAllByCategory(category, pageable);
        }
        return page.map(this::toResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<TaskResponse> getMyTree(Pageable pageable, Authentication authentication, String departmentId, String departmentName, UUID userId) {
        if (taskPermissionHelper.hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            Page<Task> page = taskRepository.findAll(pageable);
            return page.map(t -> toResponseWithCanUpdate(t, authentication, departmentId, departmentName, userId));
        }

        Set<UUID> directNodeIds = new LinkedHashSet<>();

        if (taskPermissionHelper.hasAny(authentication, "project:read_department", "PROJECT:READ_DEPARTMENT", "task:read_department", "TASK:READ_DEPARTMENT")
                && (departmentId != null || (departmentName != null && !departmentName.isBlank()))) {
            taskRepository.findAllForDepartmentScope(departmentId, departmentName, org.springframework.data.domain.Pageable.unpaged())
                    .forEach(t -> directNodeIds.add(t.getId()));
        }

        if (taskPermissionHelper.hasAny(authentication, "department:manager") && departmentId != null && !departmentId.isBlank()) {
            taskRepository.findAllForDepartmentScope(departmentId, null, org.springframework.data.domain.Pageable.unpaged())
                    .forEach(t -> directNodeIds.add(t.getId()));
        }

        if (taskPermissionHelper.hasAny(authentication, "project:read_own", "PROJECT:READ_OWN", "task:read_project", "TASK:READ_PROJECT") && userId != null) {
            taskRepository.findAllForProjectLeader(TaskCategory.PROJECT, userId, departmentId, org.springframework.data.domain.Pageable.unpaged())
                    .forEach(t -> directNodeIds.add(t.getId()));
        }

        if (taskPermissionHelper.hasAny(authentication, "task:execute", "TASK:EXECUTE") && userId != null) {
            List<UUID> operatorTaskIds = taskAssignmentRepository.findOperatorTaskIdsByUserId(userId);
            directNodeIds.addAll(operatorTaskIds);
        }

        if (userId != null) {
            taskRepository.findByAssigneeId(userId).forEach(t -> directNodeIds.add(t.getId()));
        }

        if (directNodeIds.isEmpty()) {
            return org.springframework.data.domain.Page.empty(pageable);
        }

        List<Task> directNodes = taskRepository.findAllById(directNodeIds);
        Map<UUID, Task> taskMap = new HashMap<>();
        directNodes.forEach(t -> taskMap.put(t.getId(), t));

        Set<UUID> projectIds = directNodes.stream()
                .map(Task::getProjectId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Set<UUID> rootIds = directNodes.stream()
                .filter(t -> t.getParentTaskId() == null)
                .map(Task::getId)
                .collect(Collectors.toSet());

        if (!projectIds.isEmpty()) {
            taskRepository.findByProjectIdIn(projectIds).forEach(t -> taskMap.put(t.getId(), t));
        }
        if (!rootIds.isEmpty()) {
            taskRepository.findAllById(rootIds).forEach(t -> taskMap.put(t.getId(), t));
        }

        Set<UUID> visibleIds = new LinkedHashSet<>();
        Set<UUID> subtreeRootIds = new LinkedHashSet<>();
        if (userId != null) {
            directNodes.stream()
                    .filter(t -> userId.equals(t.getAssigneeId()))
                    .forEach(t -> subtreeRootIds.add(t.getId()));
            List<UUID> operatorTaskIds = taskAssignmentRepository.findOperatorTaskIdsByUserId(userId);
            subtreeRootIds.addAll(operatorTaskIds);
        }

        for (UUID directId : directNodeIds) {
            UUID currentId = directId;
            int depth = 0;
            while (currentId != null && !visibleIds.contains(currentId) && depth < 10) {
                visibleIds.add(currentId);
                Task task = taskMap.get(currentId);
                if (task == null) {
                    task = taskRepository.findById(currentId).orElse(null);
                    if (task != null) {
                        taskMap.put(currentId, task);
                        if (task.getProjectId() != null && !taskMap.containsKey(task.getProjectId())) {
                            Task project = taskRepository.findById(task.getProjectId()).orElse(null);
                            if (project != null) taskMap.put(project.getId(), project);
                        }
                    }
                }
                if (task == null) break;
                currentId = task.getParentTaskId();
                depth++;
            }
        }

        for (UUID subtreeRootId : subtreeRootIds) {
            collectDescendants(subtreeRootId, visibleIds, taskMap, 0);
        }

        Set<UUID> parentIdsInScope = visibleIds.stream()
                .map(taskMap::get)
                .filter(Objects::nonNull)
                .map(Task::getParentTaskId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        boolean isDeptManager = taskPermissionHelper.hasAny(authentication, "department:manager");

        List<Task> visibleTasks = visibleIds.stream()
                .map(taskMap::get)
                .filter(Objects::nonNull)
                .filter(t -> {
                    if (t.getCategory() == TaskCategory.PROJECT
                            && t.getAssigneeId() == null
                            && !parentIdsInScope.contains(t.getId())
                            && (userId == null || !userId.equals(t.getCreatedById()))
                            && !(isDeptManager && departmentId != null && departmentId.equals(t.getDepartmentId()))) {
                        return false;
                    }
                    return true;
                })
                .collect(Collectors.toList());

        List<TaskResponse> responses = visibleTasks.stream()
                .map(t -> toResponseWithCanUpdate(t, authentication, departmentId, departmentName, userId))
                .collect(Collectors.toList());

        int start = (int) pageable.getOffset();
        int end = Math.min(start + pageable.getPageSize(), responses.size());
        if (start >= responses.size()) {
            return new org.springframework.data.domain.PageImpl<>(List.of(), pageable, responses.size());
        }
        return new org.springframework.data.domain.PageImpl<>(responses.subList(start, end), pageable, responses.size());
    }

    @Override
    @Transactional
    public TaskResponse updateTask(UUID id, TaskUpdateRequest request, Authentication authentication, String departmentId, UUID userId) {
        Task task = getTaskEntityById(id);
        boolean executeOutputOnly = taskPermissionHelper.hasAny(authentication, "task:execute", "TASK:EXECUTE")
                && isOutputResultsOnly(request)
                && taskPermissionHelper.canReadTask(task, authentication, departmentId, null, userId);
        boolean participantClaim = isParticipantClaimRequest(request) && taskPermissionHelper.canParticipantClaim(task, authentication, userId);
        if (participantClaim && request.getAssigneeId() != null && userId != null && !request.getAssigneeId().equals(userId)) {
            throw new AccessDeniedException("Forbidden");
        }
        if (!executeOutputOnly && !participantClaim && !taskPermissionHelper.canUpdateTask(task, authentication, departmentId, null, userId)) {
            throw new AccessDeniedException("仅创建人可以编辑节点信息");
        }
        List<UUID> operatorIdsForUpdate = request == null ? null : request.getOperatorIds();
        if (participantClaim && userId != null) {
            if (operatorIdsForUpdate == null || operatorIdsForUpdate.isEmpty()) {
                operatorIdsForUpdate = java.util.List.of(userId);
            } else if (!operatorIdsForUpdate.contains(userId)) {
                java.util.ArrayList<UUID> next = new java.util.ArrayList<>(operatorIdsForUpdate);
                next.add(userId);
                operatorIdsForUpdate = next;
            }
        }

        if (request.getName() != null) {
            String newName = request.getName().trim();
            if (task.getParentTaskId() != null && !newName.equals(task.getName())) {
                if (taskRepository.existsByParentTaskIdAndName(task.getParentTaskId(), newName)) {
                    throw new IllegalArgumentException("同一父任务下已存在同名子项：「" + newName + "」");
                }
            }
            task.setName(newName);
        }
        if (request.getType() != null) {
            if (task.getParentTaskId() != null) {
                taskValidationHelper.validateParentChildTypeConstraint(task.getParentTaskId(), request.getType(), task.getId());
                taskValidationHelper.validateHomogeneousChildWorkloadRequired(task.getParentTaskId(), request.getType(), request.getWorkload() != null ? request.getWorkload() : task.getWorkload());
                taskValidationHelper.validateHomogeneousParentWorkload(task.getParentTaskId(), request.getType(), request.getWorkload() != null ? request.getWorkload() : task.getWorkload(), request.getWorkloadUnit() != null ? request.getWorkloadUnit() : task.getWorkloadUnit(), task.getId());
            }
            taskValidationHelper.validateTypeCodeByCategory(request.getType(), task.getCategory());
            task.setType(request.getType());
            if (request.getWorkloadUnit() == null || request.getWorkloadUnit().isBlank()) {
                task.setWorkloadUnit(taskValidationHelper.resolveWorkloadUnit(request.getType(), null, task.getCategory()));
            }
        }
        if (request.getCategory() != null) {
            task.setCategory(request.getCategory());
        }
        if (request.getStatus() != null) {
            task.setStatus(request.getStatus());
        }
        if (request.getPriority() != null) {
            task.setPriority(request.getPriority());
        }
        if (request.getPlannedDueAt() != null) {
            task.setPlannedDueAt(request.getPlannedDueAt());
        }
        if (request.getAssigneeId() != null) {
            task.setAssigneeId(request.getAssigneeId());
        } else if (participantClaim && userId != null) {
            task.setAssigneeId(userId);
        }
        if (request.getInputParams() != null) {
            if (!executorRegistry.findExecutor(task).map(ex -> ex.canUpdateInputParams(task)).orElse(true)) {
                throw new IllegalArgumentException("项目已分解，参数不可修改");
            }
            String enriched = executorRegistry.findExecutor(task)
                    .map(ex -> ex.enrichInputParams(task, request.getInputParams()))
                    .orElse(request.getInputParams());
            task.setInputParams(enriched);
            executorRegistry.findExecutor(task).ifPresent(ex -> ex.normalizeInputParams(task));
        }
        if (request.getOutputResults() != null) {
            task.setOutputResults(request.getOutputResults());
        }
        if (request.getWorkload() != null) {
            taskValidationHelper.validateWorkload(request.getWorkload());
            if (task.getParentTaskId() != null) {
                taskValidationHelper.validateHomogeneousParentWorkload(task.getParentTaskId(), task.getType(), request.getWorkload(), request.getWorkloadUnit() != null ? request.getWorkloadUnit() : task.getWorkloadUnit(), task.getId());
            }
            task.setWorkload(request.getWorkload());
        }
        if (request.getWorkloadUnit() != null) {
            task.setWorkloadUnit(taskValidationHelper.resolveWorkloadUnit(task.getType(), request.getWorkloadUnit(), task.getCategory()));
        }
        if (request.getWeight() != null) {
            taskValidationHelper.validateWeightRange(request.getWeight());
            task.setWeight(request.getWeight());
        }
        if (request.getDepartmentId() != null) {
            String newDepartmentId = request.getDepartmentId();
            if (newDepartmentId != null && newDepartmentId.isBlank()) {
                newDepartmentId = null;
            }
            String oldDepartmentId = task.getDepartmentId();
            if ((oldDepartmentId == null && newDepartmentId != null) || (oldDepartmentId != null && !oldDepartmentId.equals(newDepartmentId))) {
                logger.info("责任部门变更: taskId={}, old={}, new={}, operator={}, operatorDepartment={}",
                        task.getId(),
                        oldDepartmentId,
                        newDepartmentId,
                        authentication == null ? null : authentication.getName(),
                        departmentId);
            }
            task.setDepartmentId(newDepartmentId);
            if (newDepartmentId == null) {
                task.setAssigneeId(null);
                task.setAssignerId(null);
            }
        }

        if (task.getCategory() == TaskCategory.PROJECT && request.getProjectLeaderId() != null) {
            task.setAssigneeId(request.getProjectLeaderId());
        }
        if (request.getRemarks() != null) {
            task.setRemarks(request.getRemarks());
        }
        if (request.getInProgressWeight() != null) {
            task.setInProgressWeight(request.getInProgressWeight());
        }
        if (request.getQaDepartmentId() != null) {
            task.setQaDepartmentId(request.getQaDepartmentId());
        }
        if (request.getQaAssigneeId() != null) {
            task.setQaAssigneeId(request.getQaAssigneeId());
        }
        if (request.getWorkflowStatus() != null) {
            task.setWorkflowStatus(request.getWorkflowStatus());
        }
        if (request.getProgress() != null) {
            task.setProgress(request.getProgress());
            if (statusWorkloadHelper.isLeafTask(task) && task.getWorkload() != null && task.getWorkload() > 0
                    && task.getExternalSystem() != null && !task.getExternalSystem().isBlank()) {
                double totalWorkload = task.getWorkload();
                double submittedForQaWorkload = totalWorkload * request.getProgress() / 100.0;
                double receivedWorkload = totalWorkload - submittedForQaWorkload;
                Map<String, Double> sw = statusWorkloadHelper.emptyStatusWorkloads();
                sw.put(WorkflowStages.RECEIVED, receivedWorkload);
                sw.put(WorkflowStages.SUBMITTED_FOR_QA, submittedForQaWorkload);
                task.setStatusWorkloads(statusWorkloadHelper.serializeStatusWorkloads(sw));
                task.setInProgressCompletedWorkload(0.0);
                TaskStatus derivedStatus = statusWorkloadHelper.deriveLeafTaskStatus(sw);
                if (derivedStatus != null) {
                    task.setStatus(derivedStatus);
                }
                int recalculatedProgress = progressCalculationHelper.calculateLeafProgress(task, sw);
                task.setProgress(recalculatedProgress);
            }
        }
        if (request.getWorkload() != null) {
            taskValidationHelper.validateParentWorkloadIfHomogeneous(task, request.getWorkload());
        }

        if (request.getStatusWorkloads() != null && statusWorkloadHelper.isLeafTask(task)) {
            Map<String, Double> current = statusWorkloadHelper.parseStatusWorkloads(task.getStatusWorkloads());
            double totalWorkload = request.getWorkload() != null ? request.getWorkload() : (task.getWorkload() != null ? task.getWorkload() : 0.0);
            Map<String, Double> updated = statusWorkloadHelper.applyWaterfallFlow(current, request.getStatusWorkloads(), totalWorkload);
            task.setStatusWorkloads(statusWorkloadHelper.serializeStatusWorkloads(updated));
            TaskStatus derivedStatus = statusWorkloadHelper.deriveLeafTaskStatus(updated);
            if (derivedStatus != null) {
                task.setStatus(derivedStatus);
            }
            task.setProgress(progressCalculationHelper.calculateLeafProgress(task, updated));
        }

        if (task.getStatus() == TaskStatus.PENDING && task.getDepartmentId() != null && statusWorkloadHelper.isLeafTask(task)) {
            Map<String, Double> sw = statusWorkloadHelper.parseStatusWorkloads(task.getStatusWorkloads());
            double pendingWl = sw.getOrDefault(WorkflowStages.PENDING, 0.0);
            sw.put(WorkflowStages.PENDING, 0.0);
            sw.put(WorkflowStages.ASSIGNED, pendingWl);
            task.setStatusWorkloads(statusWorkloadHelper.serializeStatusWorkloads(sw));
            task.setStatus(TaskStatus.ASSIGNED);
            task.setAssignerId(userId);
            task.setProgress(progressCalculationHelper.calculateLeafProgress(task, sw));
        }

        Task saved = taskRepository.save(task);
        if (request.getStatus() != null) {
            dependencyService.recomputeSuccessorStatuses(saved.getId());
        }
        if (saved.getParentTaskId() != null) {
            if (request.getType() != null) {
                progressCalculationHelper.updateParentCompositionMode(saved.getParentTaskId());
            }
            if (request.getStatus() != null || request.getWeight() != null || request.getWorkload() != null || request.getType() != null) {
                progressCalculationHelper.recalculateAncestorProgressAndStatus(saved.getParentTaskId());
            }
        }

        if (saved.getCategory() == TaskCategory.OPERATION_TASK && request.getOperatorIds() != null) {
            createOrReplaceAssignments(saved.getId(), operatorIdsForUpdate, TaskAssignmentRole.OPERATOR);
        }
        if (saved.getCategory() == TaskCategory.PROJECT && request.getOperatorIds() != null) {
            createOrReplaceAssignments(saved.getId(), operatorIdsForUpdate, TaskAssignmentRole.OPERATOR);
        }

        return notifyAndReturn(saved, "update");
    }

    private boolean isOutputResultsOnly(TaskUpdateRequest request) {
        if (request == null || request.getOutputResults() == null) return false;
        return request.getName() == null
                && request.getType() == null
                && request.getCategory() == null
                && request.getStatus() == null
                && request.getPriority() == null
                && request.getPlannedDueAt() == null
                && request.getInputParams() == null
                && request.getDepartmentId() == null
                && request.getProjectLeaderId() == null
                && request.getAssigneeId() == null
                && (request.getOperatorIds() == null || request.getOperatorIds().isEmpty())
                && (request.getInspectorIds() == null || request.getInspectorIds().isEmpty());
    }

    private boolean isParticipantClaimRequest(TaskUpdateRequest request) {
        if (request == null) return false;
        boolean hasAssignee = request.getAssigneeId() != null;
        boolean hasOperators = request.getOperatorIds() != null && !request.getOperatorIds().isEmpty();
        if (!hasAssignee && !hasOperators) return false;
        return request.getName() == null
                && request.getType() == null
                && request.getCategory() == null
                && request.getStatus() == null
                && request.getPriority() == null
                && request.getPlannedDueAt() == null
                && request.getInputParams() == null
                && request.getOutputResults() == null
                && request.getDepartmentId() == null
                && request.getProjectLeaderId() == null
                && (request.getInspectorIds() == null || request.getInspectorIds().isEmpty());
    }


    @Override
    @Transactional
    public TaskResponse updateWorkflowStatus(UUID id, WorkflowStatusUpdateRequest request, Authentication authentication, String departmentId, UUID userId) {
        if (request == null || request.getWorkflowStatus() == null) {
            throw new IllegalArgumentException("workflowStatus is required");
        }
        Task task = getTaskEntityById(id);
        boolean canUpdateWorkflow = taskPermissionHelper.hasAny(authentication,
                "task:update_global",
                "task:update_department",
                "task:update_project",
                "task:execute",
                "task:claim",
                "task:update_progress",
                "task:submit_for_qa",
                "task:write_back",
                "task:approve",
                "task:reject",
                "task:approve_final",
                "task:reject_final",
                "task:update_status_internal",
                "quality:check",
                "quality:approve",
                "TASK:UPDATE_GLOBAL",
                "TASK:EXECUTE");
        boolean participantClaim = taskPermissionHelper.canParticipantClaim(task, authentication, userId);
        if (!canUpdateWorkflow) {
            if (!participantClaim) {
                throw new AccessDeniedException("Forbidden");
            }
            if (request.getWorkflowStatus() != WorkflowStatus.ACCEPTANCE_COMPLETED) {
                throw new AccessDeniedException("Forbidden");
            }
        } else {
            taskPermissionHelper.enforceDepartmentAccess(task, departmentId);
        }

        WorkflowStatus oldWorkflowStatus = task.getWorkflowStatus();
        WorkflowStatus newWorkflowStatus = request.getWorkflowStatus();

        if (newWorkflowStatus == WorkflowStatus.ACCEPTANCE_COMPLETED) {
            if (!isRootProject(task)) {
                throw new IllegalArgumentException("ACCEPTANCE_COMPLETED 仅限根项目");
            }
            if (task.getStatus() != TaskStatus.QA_COMPLETED) {
                throw new IllegalArgumentException("当前状态不是质检完成，无法确认验收");
            }
            String currentUserName = authentication != null ? authentication.getName() : null;
            boolean isCreator = currentUserName != null && currentUserName.equals(task.getCreatedByName());
            boolean hasProjectCreate = taskPermissionHelper.hasAny(authentication, "project:create", "PROJECT:CREATE");
            if (!isCreator || !hasProjectCreate) {
                throw new AccessDeniedException("仅项目创建人可确认验收");
            }
        }

        if (newWorkflowStatus == WorkflowStatus.ARCHIVED) {
            if (!isRootProject(task)) {
                throw new IllegalArgumentException("ARCHIVED 仅限根项目");
            }
            if (task.getWorkflowStatus() != WorkflowStatus.ACCEPTANCE_COMPLETED) {
                throw new IllegalArgumentException("当前状态不是验收完成，无法归档");
            }
            if (!taskPermissionHelper.hasAny(authentication, "resource:project_archives_save", "RESOURCE:PROJECT_ARCHIVES_SAVE")) {
                throw new AccessDeniedException("需要 resource:project_archives_save 权限才能归档");
            }
        }

        if ((task.getCategory() == TaskCategory.PROJECT || task.getCategory() == TaskCategory.PHASE)
                && WorkflowStages.isProjectStage(newWorkflowStatus.name())) {
            if (!WorkflowStages.canTransitionTo(
                    oldWorkflowStatus != null ? oldWorkflowStatus.name() : null,
                    newWorkflowStatus.name())) {
                throw new IllegalArgumentException(
                    "阶段不可回退: " + oldWorkflowStatus + " -> " + newWorkflowStatus);
            }
        }

        task.setWorkflowStatus(newWorkflowStatus);

        java.util.Map<String, Object> inputParams = parseJsonObject(task.getInputParams());
        inputParams.put("workflowStatus", newWorkflowStatus.name());
        inputParams.put("workflow_status", newWorkflowStatus.name());

        if (request.getTaskId() != null && !id.equals(request.getTaskId())) {
            throw new IllegalArgumentException("taskId in body must match path id");
        }
        if (request.getSystemId() != null && !request.getSystemId().isBlank()) {
            if (task.getExternalSystem() != null
                    && !task.getExternalSystem().isBlank()
                    && !task.getExternalSystem().equals(request.getSystemId())) {
                throw new IllegalArgumentException("systemId does not match task externalSystem");
            }
        }
        if (request.getCompletedWorkload() != null) {
            if (request.getCompletedWorkload() < 0) {
                throw new IllegalArgumentException("completedWorkload must be >= 0");
            }
            task.setWorkload(request.getCompletedWorkload());
        }
        if (request.getTotalSubTaskCount() != null) {
            if (request.getTotalSubTaskCount() < 0) {
                throw new IllegalArgumentException("totalSubTaskCount must be >= 0");
            }
            task.setWorkload(Double.valueOf(request.getTotalSubTaskCount()));
        }
        if (request.getWorkloadUnit() != null) {
            String unit = request.getWorkloadUnit().trim();
            if (unit.isEmpty()) {
                throw new IllegalArgumentException("workloadUnit must not be blank");
            }
            if (unit.length() > 32) {
                throw new IllegalArgumentException("workloadUnit length must be <= 32");
            }
            task.setWorkloadUnit(unit);
        }

        java.util.List<java.util.Map<String, Object>> normalizedStageResponsibles = null;
        if (request.getStageResponsibles() != null) {
            normalizedStageResponsibles = new java.util.ArrayList<>();
            for (WorkflowStatusUpdateRequest.StageResponsible item : request.getStageResponsibles()) {
                if (item == null) continue;
                if (item.getStage() == null || item.getStage().isBlank()) {
                    throw new IllegalArgumentException("stageResponsibles.stage is required");
                }
                if ((item.getUserId() == null) && (item.getUsername() == null || item.getUsername().isBlank())) {
                    throw new IllegalArgumentException("stageResponsibles userId or username is required");
                }
                java.util.Map<String, Object> row = new java.util.HashMap<>();
                row.put("stage", item.getStage().trim());
                if (item.getUserId() != null) {
                    row.put("userId", item.getUserId().toString());
                }
                if (item.getUsername() != null && !item.getUsername().isBlank()) {
                    row.put("username", item.getUsername().trim());
                }
                if (item.getCompletedAt() != null && !item.getCompletedAt().isBlank()) {
                    try {
                        java.time.ZonedDateTime.parse(item.getCompletedAt());
                    } catch (Exception ex) {
                        throw new IllegalArgumentException("stageResponsibles.completedAt must be ISO-8601 datetime");
                    }
                    row.put("completedAt", item.getCompletedAt().trim());
                }
                normalizedStageResponsibles.add(row);
            }
        }

        if (request.getSystemId() != null
                || request.getTaskId() != null
                || request.getCompletedWorkload() != null
                || request.getWorkloadUnit() != null
                || request.getTotalSubTaskCount() != null
                || normalizedStageResponsibles != null) {
            java.util.Map<String, Object> completionData = new java.util.HashMap<>();
            completionData.put("receivedAt", java.time.ZonedDateTime.now().toString());
            if (request.getSystemId() != null && !request.getSystemId().isBlank()) {
                completionData.put("systemId", request.getSystemId().trim());
            }
            completionData.put("taskId", id.toString());
            if (request.getCompletedWorkload() != null) {
                completionData.put("completedWorkload", request.getCompletedWorkload());
            }
            if (request.getWorkloadUnit() != null) {
                completionData.put("workloadUnit", request.getWorkloadUnit().trim());
            }
            if (request.getTotalSubTaskCount() != null) {
                completionData.put("totalSubTaskCount", request.getTotalSubTaskCount());
            }
            if (normalizedStageResponsibles != null) {
                completionData.put("stageResponsibles", normalizedStageResponsibles);
            }
            inputParams.put("completion_data", completionData);
        }

        if (request.getIntermediatePath() != null && !request.getIntermediatePath().isBlank()) {
            inputParams.put("intermediate_path", request.getIntermediatePath());
        }

        if (request.getCommentMessage() != null && !request.getCommentMessage().isBlank()) {
            Object raw = inputParams.get("qa_feedback");
            java.util.List<java.util.Map<String, Object>> feedback;
            if (raw instanceof java.util.List) {
                feedback = (java.util.List<java.util.Map<String, Object>>) raw;
            } else {
                feedback = new java.util.ArrayList<>();
            }
            java.util.Map<String, Object> item = new java.util.HashMap<>();
            if (request.getCommentStage() != null && !request.getCommentStage().isBlank()) {
                item.put("stage", request.getCommentStage());
            }
            if (request.getCommentResult() != null && !request.getCommentResult().isBlank()) {
                item.put("result", request.getCommentResult());
            }
            item.put("message", request.getCommentMessage());
            item.put("at", java.time.ZonedDateTime.now().toString());
            item.put("by", authentication == null ? null : authentication.getName());
            feedback.add(item);
            inputParams.put("qa_feedback", feedback);
        }

        task.setInputParams(writeJsonObject(inputParams));

        TaskStatus mappedStatus = executorRegistry.findExecutor(task)
                .map(ex -> ex.resolveTaskStatus(task))
                .orElse(null);
        if (mappedStatus != null && mappedStatus != task.getStatus()) {
            task.setStatus(mappedStatus);
        }
        if (newWorkflowStatus == WorkflowStatus.ARCHIVED && isRootProject(task)) {
            task.setStatus(TaskStatus.COMPLETED);
            task.setCompletedAt(java.time.ZonedDateTime.now());
            task.setProgress(100);
            logger.info("根项目 {} 归档后自动流转至完成", task.getId());
        }
        if (mappedStatus == TaskStatus.COMPLETED) {
            task.setCompletedAt(java.time.ZonedDateTime.now());
            task.setProgress(100);
        }
        if (request.getProgress() != null) {
            task.setProgress(request.getProgress());
        }
        if (request.getResults() != null && (task.getOutputResults() == null || task.getOutputResults().isBlank())) {
            task.setOutputResults(request.getResults());
        }

        Task saved = taskRepository.save(task);

        executorRegistry.findExecutor(saved).ifPresent(ex ->
                ex.onWorkflowStatusChanged(saved, oldWorkflowStatus != null ? oldWorkflowStatus.name() : null, newWorkflowStatus.name()));

        if (newWorkflowStatus == WorkflowStatus.ACCEPTANCE_COMPLETED) {
            dependencyService.recomputeSuccessorStatuses(saved.getId());
        }

        if (saved.getParentTaskId() != null) {
            progressCalculationHelper.recalculateAncestorProgressAndStatus(saved.getParentTaskId());
        }

        return notifyAndReturn(saved, "update-status");
    }

    private java.util.Map<String, Object> parseJsonObject(String json) {
        if (json == null || json.isBlank()) return new java.util.HashMap<>();
        try {
            return objectMapper.readValue(json, new TypeReference<java.util.Map<String, Object>>() {});
        } catch (Exception ex) {
            return new java.util.HashMap<>();
        }
    }

    private String writeJsonObject(java.util.Map<String, Object> map) {
        try {
            return objectMapper.writeValueAsString(map == null ? java.util.Map.of() : map);
        } catch (Exception ex) {
            return "{}";
        }
    }

    @Override
    public boolean canEditTask(UUID id, Authentication authentication, String departmentId, String departmentName, UUID userId) {
        Task task = getTaskEntityById(id);
        return taskPermissionHelper.canUpdateTask(task, authentication, departmentId, departmentName, userId);
    }

    @Override
    @Transactional
    public void deleteTask(UUID id, Authentication authentication, String departmentId, String departmentName, UUID userId) {
        Task task = getTaskEntityById(id);
        if (!taskPermissionHelper.canDeleteTask(task, authentication, departmentId, departmentName, userId)) {
            throw new AccessDeniedException("Forbidden");
        }
        UUID parentTaskId = task.getParentTaskId();

        java.util.List<UUID> descendantIds = new java.util.ArrayList<>();
        collectDescendantIds(id, descendantIds);

        java.util.Set<UUID> allTaskIds = new java.util.LinkedHashSet<>();
        allTaskIds.add(id);
        allTaskIds.addAll(descendantIds);

        java.util.Set<UUID> affectedSuccessors = new java.util.HashSet<>();
        for (UUID tid : allTaskIds) {
            java.util.List<Task> successors = dependencyService.getSuccessors(tid);
            dependencyService.clearDependencies(tid);
            for (Task s : successors) {
                affectedSuccessors.add(s.getId());
            }
            taskAttachmentRepository.deleteAllByTaskId(tid);
            taskAssignmentRepository.deleteByIdTaskId(tid);
        }

        java.util.List<UUID> deleteOrder = new java.util.ArrayList<>(allTaskIds);
        java.util.Collections.reverse(deleteOrder);
        for (UUID tid : deleteOrder) {
            taskRepository.deleteById(tid);
        }

        for (UUID successorId : affectedSuccessors) {
            if (!allTaskIds.contains(successorId)) {
                dependencyService.recomputeTaskStatusByDependencies(successorId);
            }
        }

        if (parentTaskId != null && !allTaskIds.contains(parentTaskId)) {
            progressCalculationHelper.updateParentCompositionMode(parentTaskId);
            progressCalculationHelper.recalculateAncestorProgressAndStatus(parentTaskId);
            boolean stillHasChildren = taskRepository.existsByParentTaskId(parentTaskId);
            if (!stillHasChildren) {
                Task parent = getTaskEntityById(parentTaskId);
                if (parent.getControllerId() == null) {
                    UUID restoreTo = parent.getAssigneeId() != null ? parent.getAssigneeId() : parent.getCreatedById();
                    parent.setControllerId(restoreTo);
                    taskRepository.save(parent);
                }
            }
        }
        sseNotificationService.notifyTaskChange("delete", id);
    }

    private void collectDescendantIds(UUID parentId, java.util.List<UUID> result) {
        java.util.List<Task> children = taskRepository.findByParentTaskId(parentId);
        for (Task child : children) {
            result.add(child.getId());
            collectDescendantIds(child.getId(), result);
        }
    }

    @Override
    @Transactional
    public TaskResponse updateTaskStatus(UUID id, TaskStatus status, Authentication authentication, String departmentId, UUID userId) {
        if (!taskPermissionHelper.hasAny(authentication,
                "task:update_global",
                "task:update_department",
                "task:update_project",
                "task:execute",
                "TASK:UPDATE_GLOBAL",
                "TASK:UPDATE_DEPARTMENT",
                "TASK:UPDATE_PROJECT",
                "TASK:EXECUTE")) {
            throw new AccessDeniedException("Forbidden");
        }
        Task task = getTaskEntityById(id);
        taskPermissionHelper.enforceDepartmentAccess(task, departmentId);
        TaskStatus oldStatus = task.getStatus();
        TaskStatus effectiveStatus = status;
        if (isRootProject(task) && status == TaskStatus.COMPLETED) {
            effectiveStatus = TaskStatus.QA_COMPLETED;
        }
        task.setStatus(effectiveStatus);
        if (effectiveStatus == TaskStatus.COMPLETED) {
            task.setCompletedAt(java.time.ZonedDateTime.now());
            task.setProgress(100);
        }
        if (effectiveStatus == TaskStatus.PAUSED && statusWorkloadHelper.isLeafTask(task)) {
        } else if (effectiveStatus == TaskStatus.FAILED && statusWorkloadHelper.isLeafTask(task)) {
            if (oldStatus == TaskStatus.QA_COMPLETED || oldStatus == TaskStatus.COMPLETED) {
                throw new IllegalArgumentException("QA_COMPLETED 是稳定完成态，不允许直接置为 FAILED；发现问题请新建返修任务并关联原任务");
            }
            statusWorkloadHelper.handleFailedWorkloadRollback(task);
        } else {
            statusWorkloadHelper.autoTransferWorkloadOnStatusChange(task, oldStatus, effectiveStatus);
        }
        if (statusWorkloadHelper.isLeafTask(task) && task.getStatusWorkloads() != null) {
            int newProgress = progressCalculationHelper.calculateLeafProgress(task, statusWorkloadHelper.parseStatusWorkloads(task.getStatusWorkloads()));
            task.setProgress(newProgress);
        }
        Task saved = taskRepository.save(task);
        dependencyService.recomputeSuccessorStatuses(saved.getId());
        if (saved.getParentTaskId() != null) {
            progressCalculationHelper.recalculateAncestorProgressAndStatus(saved.getParentTaskId());
        }
        progressCalculationHelper.checkRootProjectAutoTransition(saved);
        Task refreshed = taskRepository.findById(saved.getId()).orElse(saved);
        return notifyAndReturn(refreshed, "update-status");
    }

    @Override
    @Transactional
    public TaskResponse receiveTask(UUID id, Authentication authentication, String departmentId, UUID userId) {
        Task task = getTaskEntityById(id);
        taskPermissionHelper.enforceDepartmentAccess(task, departmentId);

        if (task.getCategory() == TaskCategory.PROJECT) {
            if (!taskPermissionHelper.hasAny(authentication, "project:create", "PROJECT:CREATE")) {
                throw new AccessDeniedException("PROJECT 类型接收需要 project:create 权限");
            }
        } else {
            if (!taskPermissionHelper.hasAny(authentication, "project:create", "PROJECT:CREATE")
                    && !taskPermissionHelper.hasAny(authentication, "task:create", "TASK:CREATE")) {
                throw new AccessDeniedException("TASK 类型接收需要 project:create 或 task:create 权限");
            }
        }

        statusWorkloadHelper.ensureStatusWorkloads(task);
        if (!statusWorkloadHelper.isLeafTask(task)) {
            throw new IllegalArgumentException("只有叶子节点可以接收");
        }
        if (task.getStatus() != TaskStatus.ASSIGNED) {
            throw new IllegalArgumentException("只有 ASSIGNED 状态的任务可以接收");
        }
        if (task.getWorkload() == null || task.getWorkload() <= 0) {
            throw new IllegalArgumentException("任务工作量无效，无法接收");
        }

        boolean hasAssignee = task.getAssigneeId() != null;
        List<UUID> operatorIds = taskAssignmentRepository.findByIdTaskId(id).stream()
                .filter(a -> "OPERATOR".equalsIgnoreCase(a.getId().getAssignmentRole()))
                .map(a -> a.getId().getUserId())
                .collect(java.util.stream.Collectors.toList());
        boolean hasOperators = !operatorIds.isEmpty();
        boolean isAssignee = userId != null && userId.equals(task.getAssigneeId());
        boolean isOperator = userId != null && operatorIds.contains(userId);

        if (task.getCategory() == TaskCategory.PROJECT) {
            if (hasAssignee) {
                if (!isAssignee) {
                    throw new AccessDeniedException("PROJECT 类型任务只有负责人可以接收");
                }
            } else {
                boolean canReceive = taskPermissionHelper.hasAny(authentication, "department:manager", "DEPARTMENT:MANAGER")
                        || taskPermissionHelper.hasAny(authentication, "project:create", "PROJECT:CREATE");
                if (!canReceive || departmentId == null || task.getDepartmentId() == null
                        || !departmentId.equals(task.getDepartmentId())) {
                    throw new AccessDeniedException("未指定负责人的 PROJECT 类型任务，只有本部门具有 project:create 或 department:manager 权限的用户可以接收");
                }
            }
        } else {
            if (hasAssignee) {
                if (!isAssignee) {
                    throw new AccessDeniedException("只有负责人可以接收此任务");
                }
            } else if (hasOperators) {
                if (!isOperator) {
                    throw new AccessDeniedException("只有操作员可以接收此任务");
                }
            } else {
                if (departmentId == null || task.getDepartmentId() == null
                        || !departmentId.equals(task.getDepartmentId())) {
                    throw new AccessDeniedException("未指定执行人的任务，只有同部门用户可以接收");
                }
            }
        }

        UUID prevControllerId = task.getControllerId();
        String prevDepartmentId = task.getDepartmentId();
        UUID prevAssigneeId = task.getAssigneeId();
        UUID prevAssignerId = task.getAssignerId();
        String prevStatus = task.getStatus().name();

        Map<String, Double> sw = statusWorkloadHelper.parseStatusWorkloads(task.getStatusWorkloads());
        double assignedWorkload = sw.getOrDefault(WorkflowStages.ASSIGNED, 0.0);
        sw.put(WorkflowStages.ASSIGNED, 0.0);
        sw.put(WorkflowStages.RECEIVED, assignedWorkload);
        task.setStatusWorkloads(statusWorkloadHelper.serializeStatusWorkloads(sw));
        task.setStatus(TaskStatus.RECEIVED);
        task.setAssigneeId(userId);
        task.setControllerId(userId);
        task.setReceivedAt(ZonedDateTime.now());
        task.setUndoRequestedAt(null);
        task.setProgress(progressCalculationHelper.calculateLeafProgress(task, sw));

        Task saved = taskRepository.save(task);
        if (saved.getParentTaskId() != null) {
            progressCalculationHelper.recalculateAncestorProgressAndStatus(saved.getParentTaskId());
        }
        recordHandoff(saved, "RECEIVE", prevControllerId, saved.getControllerId(),
                prevDepartmentId, saved.getDepartmentId(),
                prevAssigneeId, saved.getAssigneeId(),
                prevAssignerId, saved.getAssignerId(),
                prevStatus, saved.getStatus().name(), userId);
        return notifyAndReturn(saved, "receive");
    }

    @Override
    @Transactional
    public TaskResponse cancelUndoReceive(UUID id, Authentication authentication, String departmentId, UUID userId) {
        Task task = getTaskEntityById(id);
        taskPermissionHelper.enforceDepartmentAccess(task, departmentId);
        if (!statusWorkloadHelper.isLeafTask(task)) {
            throw new IllegalArgumentException("只有叶子节点可以取消撤销接收");
        }
        if (task.getStatus() != TaskStatus.RECEIVED) {
            throw new IllegalArgumentException("只有 RECEIVED 状态的任务可以取消撤销接收");
        }
        boolean isAssignee = userId != null && userId.equals(task.getAssigneeId());
        if (!isAssignee) {
            throw new AccessDeniedException("只有接收人可以取消撤销接收");
        }
        if (task.getUndoRequestedAt() == null) {
            throw new IllegalArgumentException("该任务未提交撤销接收申请");
        }

        task.setUndoRequestedAt(null);
        Task saved = taskRepository.save(task);
        return notifyAndReturn(saved, "cancel-undo-receive");
    }

    @Override
    @Transactional
    public TaskResponse assignTask(UUID id, AssignRequest request, Authentication authentication, String departmentId, UUID userId) {
        boolean hasProjectUpdateGlobal = taskPermissionHelper.hasAny(authentication, "project:update_global", "PROJECT:UPDATE_GLOBAL");
        Task task = getTaskEntityById(id);

        boolean isController = userId != null && userId.equals(task.getControllerId());
        if (!isController) {
            throw new AccessDeniedException("只有接力棒持有者可以指派");
        }

        taskPermissionHelper.enforceDepartmentAccess(task, departmentId);
        statusWorkloadHelper.ensureStatusWorkloads(task);
        if (!statusWorkloadHelper.isLeafTask(task)) {
            throw new IllegalArgumentException("只有叶子节点可以指派");
        }
        if (task.getStatus() != TaskStatus.PENDING && task.getStatus() != TaskStatus.ASSIGNED && task.getStatus() != TaskStatus.RECEIVED) {
            throw new IllegalArgumentException("只有 PENDING、ASSIGNED 或 RECEIVED 状态的任务可以指派");
        }

        UUID prevControllerId = task.getControllerId();
        String prevDepartmentId = task.getDepartmentId();
        UUID prevAssigneeId = task.getAssigneeId();
        UUID prevAssignerId = task.getAssignerId();
        String prevStatus = task.getStatus().name();

        String assignDepartmentId = request.getDepartmentId();
        if (assignDepartmentId != null && assignDepartmentId.isBlank()) {
            assignDepartmentId = null;
        }
        if (assignDepartmentId == null && request.getAssigneeId() != null) {
            throw new IllegalArgumentException("责任部门为空时不能指定负责人");
        }

        if (assignDepartmentId != null) {
            if (hasProjectUpdateGlobal) {
                // can assign to any department
            } else {
                if (departmentId != null && !departmentId.isBlank() && !departmentId.equals(assignDepartmentId)) {
                    throw new AccessDeniedException("只能指派到本部门");
                }
            }
        }

        if (request.getAssigneeId() != null) {
            taskPermissionHelper.validateAssigneeByHierarchy(request.getAssigneeId(), assignDepartmentId, authentication);
        }

        boolean canReadAllDepts = hasProjectUpdateGlobal || taskPermissionHelper.hasAny(authentication, "department:read", "DEPARTMENT:READ");
        if (!canReadAllDepts && departmentId != null && !departmentId.isBlank()) {
            if (request.getQaDepartmentId() != null && !request.getQaDepartmentId().isBlank()
                    && !departmentId.equals(request.getQaDepartmentId())) {
                throw new AccessDeniedException("不具备跨部门权限，质检部门只能为本部门");
            }
        }

        task.setDepartmentId(assignDepartmentId);
        task.setAssigneeId(assignDepartmentId != null ? request.getAssigneeId() : null);
        task.setAssignerId(assignDepartmentId != null ? userId : null);
        if (request.getAssigneeId() != null && userId != null && request.getAssigneeId().equals(userId)) {
            throw new IllegalArgumentException("指派人和被指派人不能相同");
        }
        task.setQaDepartmentId(request.getQaDepartmentId());
        task.setQaAssigneeId(request.getQaAssigneeId());

        boolean isReassign = task.getStatus() == TaskStatus.RECEIVED;
        String previousAssigneeId = task.getAssigneeId() != null ? task.getAssigneeId().toString() : "null";

        Map<String, Double> sw = statusWorkloadHelper.parseStatusWorkloads(task.getStatusWorkloads());
        double sourceWorkload = sw.getOrDefault(WorkflowStages.PENDING, 0.0)
                + sw.getOrDefault(WorkflowStages.ASSIGNED, 0.0)
                + sw.getOrDefault(WorkflowStages.RECEIVED, 0.0);
        sw.put(WorkflowStages.PENDING, 0.0);
        sw.put(WorkflowStages.ASSIGNED, 0.0);
        sw.put(WorkflowStages.RECEIVED, 0.0);
        if (assignDepartmentId != null) {
            sw.put(WorkflowStages.ASSIGNED, sourceWorkload);
            task.setStatus(TaskStatus.ASSIGNED);
        } else {
            sw.put(WorkflowStages.PENDING, sourceWorkload);
            task.setStatus(TaskStatus.PENDING);
        }
        task.setStatusWorkloads(statusWorkloadHelper.serializeStatusWorkloads(sw));
        task.setReceivedAt(null);
        task.setUndoRequestedAt(null);
        task.setProgress(progressCalculationHelper.calculateLeafProgress(task, sw));

        Task saved = taskRepository.save(task);
        if (isReassign) {
            logger.info("REASSIGN: taskId={} previousAssignee={} newAssignee={} assignerId={}",
                    saved.getId(), previousAssigneeId,
                    request.getAssigneeId() != null ? request.getAssigneeId() : "null",
                    userId);
        }
        if (saved.getParentTaskId() != null) {
            progressCalculationHelper.recalculateAncestorProgressAndStatus(saved.getParentTaskId());
        }
        String handoffAction = isReassign ? "REASSIGN" : "ASSIGN";
        recordHandoff(saved, handoffAction, prevControllerId, saved.getControllerId(),
                prevDepartmentId, saved.getDepartmentId(),
                prevAssigneeId, saved.getAssigneeId(),
                prevAssignerId, saved.getAssignerId(),
                prevStatus, saved.getStatus().name(), userId);
        return notifyAndReturn(saved, "assign");
    }

    @Override
    @Transactional
    public TaskResponse decomposeTask(UUID id, DecomposeRequest request, Authentication authentication, String departmentId, UUID userId) {

        Task task = getTaskEntityById(id);

        boolean isController = userId != null && userId.equals(task.getControllerId());
        if (!isController) {
            throw new AccessDeniedException("只有接力棒持有者可以分解");
        }

        boolean canSpecifyDept = isController;

        String childCategory = request.getCategory();
        if (childCategory == null || childCategory.isBlank()) {
            childCategory = task.getCategory().name();
        }
        boolean childIsProject = TaskCategory.PROJECT.name().equals(childCategory);

        taskPermissionHelper.enforceDepartmentAccess(task, departmentId);
        statusWorkloadHelper.ensureStatusWorkloads(task);
        if (!statusWorkloadHelper.isLeafTask(task)) {
            throw new IllegalArgumentException("只有叶子节点可以分解");
        }
        if (task.getStatus() != TaskStatus.PENDING && task.getStatus() != TaskStatus.ASSIGNED && task.getStatus() != TaskStatus.RECEIVED) {
            throw new IllegalArgumentException("只有 PENDING、ASSIGNED 或 RECEIVED 状态的任务可以分解");
        }
        if (task.getWorkload() == null || task.getWorkload() <= 0) {
            throw new IllegalArgumentException("任务工作量无效，无法分解");
        }
        if (request.getSubTasks() == null || request.getSubTasks().isEmpty()) {
            throw new IllegalArgumentException("子任务列表不能为空");
        }

        double totalChildWorkload = 0.0;
        java.util.Map<String, Double> workloadByType = new java.util.LinkedHashMap<>();
        for (var item : request.getSubTasks()) {
            if (item.getWorkload() == null || item.getWorkload() <= 0) {
                throw new IllegalArgumentException("子任务工作量必须大于 0");
            }
            String childUnit = item.getWorkloadUnit();
            if (childUnit != null && !childUnit.isBlank() && task.getWorkloadUnit() != null
                    && !childUnit.equals(task.getWorkloadUnit())) {
                throw new IllegalArgumentException("子任务计量单位必须与父任务相同（" + task.getWorkloadUnit() + "）");
            }
            String childDeptId;
            String childQaDeptId;
            if (canSpecifyDept) {
                childDeptId = item.getDepartmentId();
                if (childDeptId == null || childDeptId.isBlank()) {
                    throw new IllegalArgumentException("有 project:create 或 task:create 权限时执行部门为必填项");
                }
                childQaDeptId = item.getQaDepartmentId();
                if (childQaDeptId == null || childQaDeptId.isBlank()) {
                    childQaDeptId = childDeptId;
                }
            } else {
                childDeptId = departmentId;
                if (childDeptId == null || childDeptId.isBlank()) {
                    throw new IllegalArgumentException("无法确定当前用户所属部门");
                }
                childQaDeptId = departmentId;
            }
            totalChildWorkload += item.getWorkload();
            String typeKey = item.getType() != null && !item.getType().isBlank() ? item.getType() : task.getType();
            workloadByType.merge(typeKey, item.getWorkload(), Double::sum);
        }
        if (workloadByType.size() > 1) {
            for (var entry : workloadByType.entrySet()) {
                if (Math.abs(entry.getValue() - task.getWorkload()) > 0.01) {
                    throw new IllegalArgumentException("类型「" + entry.getKey() + "」子任务工作量之和(" + entry.getValue() + ")必须等于父任务工作量(" + task.getWorkload() + ")");
                }
            }
        } else {
            if (Math.abs(totalChildWorkload - task.getWorkload()) > 0.01) {
                throw new IllegalArgumentException("子任务工作量之和(" + totalChildWorkload + ")必须等于父任务工作量(" + task.getWorkload() + ")");
            }
        }

        List<String> childNames = request.getSubTasks().stream()
                .map(SubTaskItem::getName)
                .filter(n -> n != null && !n.isBlank())
                .map(String::trim)
                .toList();
        Set<String> uniqueNames = new HashSet<>(childNames);
        if (uniqueNames.size() < childNames.size()) {
            throw new IllegalArgumentException("子任务名称不能重复");
        }
        List<Task> existingChildren = taskRepository.findByParentTaskId(id);
        Set<String> existingNames = existingChildren.stream()
                .map(Task::getName)
                .filter(n -> n != null && !n.isBlank())
                .map(String::trim)
                .collect(Collectors.toSet());
        for (String name : childNames) {
            if (existingNames.contains(name)) {
                throw new IllegalArgumentException("子任务名称\"" + name + "\"与已有兄弟任务重复");
            }
        }

        task.setStatusWorkloads(null);
        task.setProgress(0);
        taskRepository.save(task);

        for (var item : request.getSubTasks()) {
            Task child = new Task();
            child.setName(item.getName());
            child.setType(item.getType() != null && !item.getType().isBlank() ? item.getType() : task.getType());
            child.setCategory(TaskCategory.valueOf(childCategory));
            String childDeptId;
            String childQaDeptId;
            if (canSpecifyDept) {
                childDeptId = item.getDepartmentId();
                childQaDeptId = item.getQaDepartmentId();
                if (childQaDeptId == null || childQaDeptId.isBlank()) {
                    childQaDeptId = childDeptId;
                }
            } else {
                childDeptId = departmentId;
                childQaDeptId = departmentId;
            }
            child.setStatus(childDeptId != null ? TaskStatus.ASSIGNED : TaskStatus.PENDING);
            if (child.getStatus() == TaskStatus.ASSIGNED && userId != null) {
                child.setAssignerId(userId);
            }
            child.setCreatedById(userId);
            child.setControllerId(userId);
            if (authentication != null) {
                child.setCreatedByName(authentication.getName());
            }
            child.setCreatedDepartmentId(departmentId);
            child.setPriority(task.getPriority());
            child.setDepartmentId(childDeptId);
            child.setProjectId(task.getProjectId() != null ? task.getProjectId() : task.getId());
            child.setParentTaskId(task.getId());
            child.setWorkload(item.getWorkload());
            child.setWorkloadUnit(task.getWorkloadUnit());
            child.setWeight(taskValidationHelper.defaultWeight(task.getWeight()));
            child.setQaDepartmentId(childQaDeptId);
            child.setQaAssigneeId(item.getQaAssigneeId());
            child.setInProgressWeight(task.getInProgressWeight() != null ? task.getInProgressWeight() : 0.95);
            if (item.getAssigneeId() != null) {
                child.setAssigneeId(item.getAssigneeId());
                if (userId != null && item.getAssigneeId().equals(userId)) {
                    throw new IllegalArgumentException("子任务「" + item.getName() + "」的指派人和被指派人不能相同");
                }
            }
            if (statusWorkloadHelper.isLeafTask(child) && child.getWorkload() != null) {
                statusWorkloadHelper.ensureStatusWorkloads(child);
            }
            taskRepository.save(child);
        }

        progressCalculationHelper.updateParentCompositionMode(task.getId());
        progressCalculationHelper.recalculateAncestorProgressAndStatus(task.getId());

        Task refreshed = taskRepository.findById(id).orElse(task);
        return notifyAndReturn(refreshed, "decompose");
    }

    @Override
    @Transactional
    public TaskResponse revokeAssignment(UUID id, Authentication authentication, String departmentId, UUID userId) {
        Task task = getTaskEntityById(id);
        taskPermissionHelper.enforceDepartmentAccess(task, departmentId);
        statusWorkloadHelper.ensureStatusWorkloads(task);
        if (!statusWorkloadHelper.isLeafTask(task)) {
            throw new IllegalArgumentException("只有叶子节点可以撤销指派");
        }
        if (task.getStatus() != TaskStatus.ASSIGNED) {
            throw new IllegalArgumentException("只有 ASSIGNED 状态的任务可以撤销指派");
        }
        boolean isAssigner = userId != null && userId.equals(task.getAssignerId());
        if (!isAssigner) {
            throw new AccessDeniedException("仅指派人可以撤销指派");
        }

        UUID prevControllerId = task.getControllerId();
        String prevDepartmentId = task.getDepartmentId();
        UUID prevAssigneeId = task.getAssigneeId();
        UUID prevAssignerId = task.getAssignerId();
        String prevStatus = task.getStatus().name();

        com.example.taskmanagement.model.TaskHandoffRecord lastAssignRecord =
                handoffRecordRepository.findTopByTaskIdAndActionInOrderByOperatedAtDesc(id, java.util.List.of("ASSIGN", "REASSIGN"));

        String restoreDepartmentId = null;
        UUID restoreAssigneeId = null;
        UUID restoreAssignerId = null;
        UUID restoreControllerId = task.getCreatedById();
        TaskStatus restoreStatus = TaskStatus.PENDING;

        if (lastAssignRecord != null) {
            restoreDepartmentId = lastAssignRecord.getFromDepartmentId();
            restoreAssigneeId = lastAssignRecord.getFromAssigneeId();
            restoreAssignerId = lastAssignRecord.getFromAssignerId();
            restoreControllerId = lastAssignRecord.getFromControllerId() != null
                    ? lastAssignRecord.getFromControllerId() : task.getCreatedById();
            if (lastAssignRecord.getFromStatus() != null) {
                try {
                    restoreStatus = TaskStatus.valueOf(lastAssignRecord.getFromStatus());
                } catch (IllegalArgumentException ignored) {
                    if (restoreDepartmentId != null) {
                        restoreStatus = TaskStatus.ASSIGNED;
                    }
                }
            } else if (restoreDepartmentId != null) {
                restoreStatus = TaskStatus.ASSIGNED;
            }
        }

        Map<String, Double> sw = statusWorkloadHelper.parseStatusWorkloads(task.getStatusWorkloads());
        double assignedWorkload = sw.getOrDefault(WorkflowStages.ASSIGNED, 0.0);
        sw.put(WorkflowStages.ASSIGNED, 0.0);
        sw.put(restoreStatus.name(), assignedWorkload);
        task.setStatusWorkloads(statusWorkloadHelper.serializeStatusWorkloads(sw));
        task.setStatus(restoreStatus);
        task.setDepartmentId(restoreDepartmentId);
        task.setAssignerId(restoreAssignerId);
        task.setAssigneeId(restoreAssigneeId);
        task.setControllerId(restoreControllerId);
        task.setProgress(progressCalculationHelper.calculateLeafProgress(task, sw));

        Task saved = taskRepository.save(task);
        if (saved.getParentTaskId() != null) {
            progressCalculationHelper.recalculateAncestorProgressAndStatus(saved.getParentTaskId());
        }
        recordHandoff(saved, "REVOKE_ASSIGNMENT", prevControllerId, saved.getControllerId(),
                prevDepartmentId, saved.getDepartmentId(),
                prevAssigneeId, saved.getAssigneeId(),
                prevAssignerId, saved.getAssignerId(),
                prevStatus, saved.getStatus().name(), userId);
        return notifyAndReturn(saved, "revoke-assignment");
    }

    @Override
    @Transactional
    public TaskResponse requestUndoReceive(UUID id, Authentication authentication, String departmentId, UUID userId) {
        Task task = getTaskEntityById(id);
        taskPermissionHelper.enforceDepartmentAccess(task, departmentId);
        if (task.getCategory() == TaskCategory.PROJECT) {
            if (!taskPermissionHelper.hasAny(authentication, "project:create", "PROJECT:CREATE")) {
                throw new AccessDeniedException("PROJECT 类型撤销接收需要 project:create 权限");
            }
        } else {
            if (!taskPermissionHelper.hasAny(authentication, "project:create", "PROJECT:CREATE")
                    && !taskPermissionHelper.hasAny(authentication, "task:create", "TASK:CREATE")) {
                throw new AccessDeniedException("TASK 类型撤销接收需要 project:create 或 task:create 权限");
            }
        }
        if (!statusWorkloadHelper.isLeafTask(task)) {
            throw new IllegalArgumentException("只有叶子节点可以申请撤销接收");
        }
        if (task.getStatus() != TaskStatus.RECEIVED) {
            throw new IllegalArgumentException("只有 RECEIVED 状态的任务可以申请撤销接收");
        }
        boolean isAssignee = userId != null && userId.equals(task.getAssigneeId());
        boolean isAssigner = userId != null && userId.equals(task.getAssignerId());

        if (!isAssignee && !isAssigner) {
            throw new AccessDeniedException("只有接收人或指派人可以撤销接收");
        }

        if (isAssigner) {
            UUID prevControllerId = task.getControllerId();
            String prevDepartmentId = task.getDepartmentId();
            UUID prevAssigneeId = task.getAssigneeId();
            UUID prevAssignerId = task.getAssignerId();
            String prevStatus = task.getStatus().name();

            com.example.taskmanagement.model.TaskHandoffRecord lastReceiveRecord =
                    handoffRecordRepository.findTopByTaskIdAndActionInOrderByOperatedAtDesc(id, java.util.List.of("RECEIVE"));

            String restoreDepartmentId = task.getDepartmentId();
            UUID restoreAssigneeId = task.getAssigneeId();
            UUID restoreAssignerId = task.getAssignerId();
            UUID restoreControllerId = task.getCreatedById();
            TaskStatus restoreStatus = TaskStatus.ASSIGNED;

            if (lastReceiveRecord != null) {
                restoreDepartmentId = lastReceiveRecord.getFromDepartmentId();
                restoreAssigneeId = lastReceiveRecord.getFromAssigneeId();
                restoreAssignerId = lastReceiveRecord.getFromAssignerId();
                restoreControllerId = lastReceiveRecord.getFromControllerId() != null
                        ? lastReceiveRecord.getFromControllerId() : task.getCreatedById();
                if (lastReceiveRecord.getFromStatus() != null) {
                    try {
                        restoreStatus = TaskStatus.valueOf(lastReceiveRecord.getFromStatus());
                    } catch (IllegalArgumentException ignored) {}
                }
            }

            statusWorkloadHelper.ensureStatusWorkloads(task);
            Map<String, Double> sw = statusWorkloadHelper.parseStatusWorkloads(task.getStatusWorkloads());
            double receivedWorkload = sw.getOrDefault(WorkflowStages.RECEIVED, 0.0);
            sw.put(WorkflowStages.RECEIVED, 0.0);
            sw.put(restoreStatus.name(), receivedWorkload);
            task.setStatusWorkloads(statusWorkloadHelper.serializeStatusWorkloads(sw));
            task.setStatus(restoreStatus);
            task.setReceivedAt(null);
            task.setUndoRequestedAt(null);
            task.setControllerId(restoreControllerId);
            task.setDepartmentId(restoreDepartmentId);
            task.setAssigneeId(restoreAssigneeId);
            task.setAssignerId(restoreAssignerId);
            task.setProgress(progressCalculationHelper.calculateLeafProgress(task, sw));
            Task saved = taskRepository.save(task);
            if (saved.getParentTaskId() != null) {
                progressCalculationHelper.recalculateAncestorProgressAndStatus(saved.getParentTaskId());
            }
            recordHandoff(saved, "UNDO_RECEIVE", prevControllerId, saved.getControllerId(),
                    prevDepartmentId, saved.getDepartmentId(),
                    prevAssigneeId, saved.getAssigneeId(),
                    prevAssignerId, saved.getAssignerId(),
                    prevStatus, saved.getStatus().name(), userId);
            return notifyAndReturn(saved, "direct-undo-receive");
        }

        if (task.getUndoRequestedAt() != null) {
            throw new IllegalArgumentException("已提交撤销申请，请等待指派人审批");
        }

        task.setUndoRequestedAt(ZonedDateTime.now());
        Task saved = taskRepository.save(task);
        return notifyAndReturn(saved, "request-undo-receive");
    }

    @Override
    @Transactional
    public TaskResponse approveUndoReceive(UUID id, Authentication authentication, String departmentId, UUID userId) {
        Task task = getTaskEntityById(id);
        taskPermissionHelper.enforceDepartmentAccess(task, departmentId);
        boolean isAssigner = userId != null && userId.equals(task.getAssignerId());
        if (!isAssigner) {
            throw new AccessDeniedException("只有指派人可以审批撤销接收");
        }
        statusWorkloadHelper.ensureStatusWorkloads(task);
        if (!statusWorkloadHelper.isLeafTask(task)) {
            throw new IllegalArgumentException("只有叶子节点可以审批撤销接收");
        }
        if (task.getStatus() != TaskStatus.RECEIVED) {
            throw new IllegalArgumentException("只有 RECEIVED 状态的任务可以审批撤销接收");
        }
        if (task.getUndoRequestedAt() == null) {
            throw new IllegalArgumentException("该任务未提交撤销接收申请");
        }

        UUID prevControllerId = task.getControllerId();
        String prevDepartmentId = task.getDepartmentId();
        UUID prevAssigneeId = task.getAssigneeId();
        UUID prevAssignerId = task.getAssignerId();
        String prevStatus = task.getStatus().name();

        com.example.taskmanagement.model.TaskHandoffRecord lastReceiveRecord =
                handoffRecordRepository.findTopByTaskIdAndActionInOrderByOperatedAtDesc(id, java.util.List.of("RECEIVE"));

        String restoreDepartmentId = task.getDepartmentId();
        UUID restoreAssigneeId = task.getAssigneeId();
        UUID restoreAssignerId = task.getAssignerId();
        UUID restoreControllerId = task.getCreatedById();
        TaskStatus restoreStatus = TaskStatus.ASSIGNED;

        if (lastReceiveRecord != null) {
            restoreDepartmentId = lastReceiveRecord.getFromDepartmentId();
            restoreAssigneeId = lastReceiveRecord.getFromAssigneeId();
            restoreAssignerId = lastReceiveRecord.getFromAssignerId();
            restoreControllerId = lastReceiveRecord.getFromControllerId() != null
                    ? lastReceiveRecord.getFromControllerId() : task.getCreatedById();
            if (lastReceiveRecord.getFromStatus() != null) {
                try {
                    restoreStatus = TaskStatus.valueOf(lastReceiveRecord.getFromStatus());
                } catch (IllegalArgumentException ignored) {}
            }
        }

        Map<String, Double> sw = statusWorkloadHelper.parseStatusWorkloads(task.getStatusWorkloads());
        double receivedWorkload = sw.getOrDefault(WorkflowStages.RECEIVED, 0.0);
        sw.put(WorkflowStages.RECEIVED, 0.0);
        sw.put(restoreStatus.name(), receivedWorkload);
        task.setStatusWorkloads(statusWorkloadHelper.serializeStatusWorkloads(sw));
        task.setStatus(restoreStatus);
        task.setReceivedAt(null);
        task.setUndoRequestedAt(null);
        task.setControllerId(restoreControllerId);
        task.setDepartmentId(restoreDepartmentId);
        task.setAssigneeId(restoreAssigneeId);
        task.setAssignerId(restoreAssignerId);
        task.setProgress(progressCalculationHelper.calculateLeafProgress(task, sw));

        Task saved = taskRepository.save(task);
        if (saved.getParentTaskId() != null) {
            progressCalculationHelper.recalculateAncestorProgressAndStatus(saved.getParentTaskId());
        }
        recordHandoff(saved, "UNDO_RECEIVE", prevControllerId, saved.getControllerId(),
                prevDepartmentId, saved.getDepartmentId(),
                prevAssigneeId, saved.getAssigneeId(),
                prevAssignerId, saved.getAssignerId(),
                prevStatus, saved.getStatus().name(), userId);
        return notifyAndReturn(saved, "approve-undo-receive");
    }

    @Override
    @Transactional
    public TaskResponse startProgress(UUID id, Authentication authentication, String departmentId, UUID userId) {
        if (!taskPermissionHelper.hasAny(authentication, "task:execute", "TASK:EXECUTE")) {
            throw new AccessDeniedException("需要 task:execute 权限");
        }
        Task task = getTaskEntityById(id);
        taskPermissionHelper.enforceDepartmentAccess(task, departmentId);
        statusWorkloadHelper.ensureStatusWorkloads(task);
        if (!statusWorkloadHelper.isLeafTask(task)) {
            throw new IllegalArgumentException("只有叶子节点可以开始处理");
        }
        if (task.getStatus() != TaskStatus.RECEIVED) {
            throw new IllegalArgumentException("只有 RECEIVED 状态的任务可以开始处理");
        }

        Map<String, Double> sw = statusWorkloadHelper.parseStatusWorkloads(task.getStatusWorkloads());
        double receivedWorkload = sw.getOrDefault(WorkflowStages.RECEIVED, 0.0);
        sw.put(WorkflowStages.RECEIVED, 0.0);
        sw.put(WorkflowStages.IN_PROGRESS, receivedWorkload);
        task.setStatusWorkloads(statusWorkloadHelper.serializeStatusWorkloads(sw));
        task.setStatus(TaskStatus.IN_PROGRESS);
        task.setInProgressCompletedWorkload(0.0);
        task.setStartedAt(ZonedDateTime.now());
        task.setProgress(progressCalculationHelper.calculateLeafProgress(task, sw));

        Task saved = taskRepository.save(task);
        if (saved.getParentTaskId() != null) {
            progressCalculationHelper.recalculateAncestorProgressAndStatus(saved.getParentTaskId());
        }
        return notifyAndReturn(saved, "start-progress");
    }

    @Override
    @Transactional
    public TaskResponse submitCompletion(UUID id, SubmitCompletionRequest request, Authentication authentication, String departmentId, UUID userId) {
        if (!taskPermissionHelper.hasAny(authentication, "task:execute", "TASK:EXECUTE")) {
            throw new AccessDeniedException("需要 task:execute 权限");
        }
        Task task = getTaskEntityById(id);
        taskPermissionHelper.enforceDepartmentAccess(task, departmentId);
        statusWorkloadHelper.ensureStatusWorkloads(task);
        if (!statusWorkloadHelper.isLeafTask(task)) {
            throw new IllegalArgumentException("只有叶子节点可以提交完成量");
        }
        if (task.getStatus() != TaskStatus.IN_PROGRESS) {
            throw new IllegalArgumentException("任务必须为进行中状态才能输入完成量");
        }
        if (request.getCompletedWorkload() == null || request.getCompletedWorkload() <= 0) {
            throw new IllegalArgumentException("完成工作量必须大于 0");
        }

        Map<String, Double> sw = statusWorkloadHelper.parseStatusWorkloads(task.getStatusWorkloads());
        double inProgressWorkload = sw.getOrDefault(WorkflowStages.IN_PROGRESS, 0.0);
        double totalWorkload = task.getWorkload() != null ? task.getWorkload() : 0.0;
        double currentCompleted = task.getInProgressCompletedWorkload() != null ? task.getInProgressCompletedWorkload() : 0.0;

        if (currentCompleted + request.getCompletedWorkload() > inProgressWorkload + 0.01) {
            throw new IllegalArgumentException("累计完成量(" + (currentCompleted + request.getCompletedWorkload()) + ")不能超过进行中工作量(" + inProgressWorkload + ")");
        }

        double newCompleted = currentCompleted + request.getCompletedWorkload();
        task.setInProgressCompletedWorkload(newCompleted);
        task.setProgress(progressCalculationHelper.calculateLeafProgress(task, sw));

        Task saved = taskRepository.save(task);
        if (saved.getParentTaskId() != null) {
            progressCalculationHelper.recalculateAncestorProgressAndStatus(saved.getParentTaskId());
        }

        Task refreshed = taskRepository.findById(saved.getId()).orElse(saved);
        return notifyAndReturn(refreshed, "submit-completion");
    }

    @Transactional
    public TaskResponse submitQa(UUID id, Authentication authentication, String departmentId, UUID userId) {
        if (!taskPermissionHelper.hasAny(authentication, "task:execute", "TASK:EXECUTE")) {
            throw new AccessDeniedException("需要 task:execute 权限");
        }
        Task task = getTaskEntityById(id);
        taskPermissionHelper.enforceDepartmentAccess(task, departmentId);
        statusWorkloadHelper.ensureStatusWorkloads(task);
        if (!statusWorkloadHelper.isLeafTask(task)) {
            throw new IllegalArgumentException("只有叶子节点可以提交质检");
        }
        if (task.getStatus() != TaskStatus.IN_PROGRESS) {
            throw new IllegalArgumentException("任务必须为进行中状态才能提交质检");
        }

        Map<String, Double> sw = statusWorkloadHelper.parseStatusWorkloads(task.getStatusWorkloads());
        double inProgressWorkload = sw.getOrDefault(WorkflowStages.IN_PROGRESS, 0.0);
        double ipCompleted = task.getInProgressCompletedWorkload() != null ? task.getInProgressCompletedWorkload() : 0.0;

        if (Math.abs(ipCompleted - inProgressWorkload) > 0.01) {
            throw new IllegalArgumentException("完成量必须等于进行中工作量才能提交质检，当前完成量: " + ipCompleted + "，进行中工作量: " + inProgressWorkload);
        }

        sw.put(WorkflowStages.IN_PROGRESS, 0.0);
        sw.put(WorkflowStages.SUBMITTED_FOR_QA, inProgressWorkload);
        task.setStatusWorkloads(statusWorkloadHelper.serializeStatusWorkloads(sw));
        task.setInProgressCompletedWorkload(0.0);

        TaskStatus derivedStatus = statusWorkloadHelper.deriveLeafTaskStatus(sw);
        if (derivedStatus != null) {
            task.setStatus(derivedStatus);
        }
        task.setProgress(progressCalculationHelper.calculateLeafProgress(task, sw));

        Task saved = taskRepository.save(task);
        if (saved.getParentTaskId() != null) {
            progressCalculationHelper.recalculateAncestorProgressAndStatus(saved.getParentTaskId());
        }
        progressCalculationHelper.checkRootProjectAutoTransition(saved);

        qaPushService.pushToQa(saved.getId(), saved.getQaDepartmentId(), saved.getQaAssigneeId());

        Task refreshed = taskRepository.findById(saved.getId()).orElse(saved);
        return notifyAndReturn(refreshed, "submit-qa");
    }

    @Override
    public TaskResponse qaApprove(UUID id, Authentication authentication, String departmentId, UUID userId) {
        if (!taskPermissionHelper.hasAny(authentication, "quality:check", "quality:approve", "QUALITY:CHECK", "QUALITY:APPROVE")) {
            throw new AccessDeniedException("需要 quality:check 权限");
        }
        Task task = getTaskEntityById(id);
        statusWorkloadHelper.ensureStatusWorkloads(task);
        if (task.getStatus() != TaskStatus.QA_COMPLETING) {
            throw new IllegalArgumentException("任务必须为质检中状态才能通过");
        }

        Map<String, Double> sw = statusWorkloadHelper.parseStatusWorkloads(task.getStatusWorkloads());
        double qaCompleting = sw.getOrDefault(WorkflowStages.QA_COMPLETING, 0.0);

        sw.put(WorkflowStages.QA_COMPLETING, 0.0);
        sw.put(WorkflowStages.QA_COMPLETED, qaCompleting);
        task.setStatusWorkloads(statusWorkloadHelper.serializeStatusWorkloads(sw));
        task.setStatus(TaskStatus.QA_COMPLETED);
        task.setProgress(100);
        task.setAssigneeId(userId);
        task.setPreviousAssigneeId(null);
        Task saved = taskRepository.save(task);

        if (saved.getParentTaskId() != null) {
            progressCalculationHelper.recalculateAncestorProgressAndStatus(saved.getParentTaskId());
        }
        progressCalculationHelper.checkRootProjectAutoTransition(saved);

        Task refreshed = taskRepository.findById(id).orElse(saved);
        return notifyAndReturn(refreshed, "qa-approve");
    }

    @Override
    public TaskResponse acceptQa(UUID id, Authentication authentication, String departmentId, UUID userId) {
        if (!taskPermissionHelper.hasAny(authentication, "quality:check", "QUALITY:CHECK")) {
            throw new AccessDeniedException("需要 quality:check 权限");
        }
        Task task = getTaskEntityById(id);
        statusWorkloadHelper.ensureStatusWorkloads(task);
        if (task.getStatus() != TaskStatus.SUBMITTED_FOR_QA) {
            throw new IllegalArgumentException("任务必须为待质检状态才能接收");
        }

        Map<String, Double> sw = statusWorkloadHelper.parseStatusWorkloads(task.getStatusWorkloads());
        double submittedForQa = sw.getOrDefault(WorkflowStages.SUBMITTED_FOR_QA, 0.0);

        sw.put(WorkflowStages.SUBMITTED_FOR_QA, 0.0);
        sw.put(WorkflowStages.QA_COMPLETING, submittedForQa);
        task.setStatusWorkloads(statusWorkloadHelper.serializeStatusWorkloads(sw));
        task.setStatus(TaskStatus.QA_COMPLETING);
        task.setProgress(progressCalculationHelper.calculateLeafProgress(task, sw));
        task.setPreviousAssigneeId(task.getAssigneeId());
        task.setAssigneeId(userId);
        Task saved = taskRepository.save(task);

        if (saved.getParentTaskId() != null) {
            progressCalculationHelper.recalculateAncestorProgressAndStatus(saved.getParentTaskId());
        }

        Task refreshed = taskRepository.findById(id).orElse(saved);
        return notifyAndReturn(refreshed, "accept-qa");
    }

    @Override
    public TaskResponse qaReject(UUID id, Authentication authentication, String departmentId, UUID userId) {
        if (!taskPermissionHelper.hasAny(authentication, "quality:check", "quality:approve", "QUALITY:CHECK", "QUALITY:APPROVE")) {
            throw new AccessDeniedException("需要 quality:check 权限");
        }
        Task task = getTaskEntityById(id);
        statusWorkloadHelper.ensureStatusWorkloads(task);
        if (task.getStatus() != TaskStatus.QA_COMPLETING) {
            throw new IllegalArgumentException("任务必须为质检中状态才能不通过");
        }

        Map<String, Double> sw = statusWorkloadHelper.parseStatusWorkloads(task.getStatusWorkloads());
        double qaCompleting = sw.getOrDefault(WorkflowStages.QA_COMPLETING, 0.0);

        sw.put(WorkflowStages.QA_COMPLETING, 0.0);
        sw.put(WorkflowStages.IN_PROGRESS, qaCompleting);
        task.setStatusWorkloads(statusWorkloadHelper.serializeStatusWorkloads(sw));
        task.setStatus(TaskStatus.IN_PROGRESS);
        task.setInProgressCompletedWorkload(0.0);
        task.setProgress(progressCalculationHelper.calculateLeafProgress(task, sw));
        task.setAssigneeId(task.getPreviousAssigneeId());
        task.setPreviousAssigneeId(null);
        Task saved = taskRepository.save(task);

        if (saved.getParentTaskId() != null) {
            progressCalculationHelper.recalculateAncestorProgressAndStatus(saved.getParentTaskId());
        }

        Task refreshed = taskRepository.findById(id).orElse(saved);
        return notifyAndReturn(refreshed, "qa-reject");
    }

    @Override
    @Transactional
    public TaskResponse revokeQa(UUID id, Authentication authentication, String departmentId, UUID userId) {
        if (!taskPermissionHelper.hasAny(authentication, "task:execute", "TASK:EXECUTE")) {
            throw new AccessDeniedException("需要 task:execute 权限");
        }
        Task task = getTaskEntityById(id);
        taskPermissionHelper.enforceDepartmentAccess(task, departmentId);
        if (userId != null && !userId.equals(task.getAssigneeId())) {
            throw new AccessDeniedException("只有操作员（assigneeId）可以撤销质检");
        }
        statusWorkloadHelper.ensureStatusWorkloads(task);
        if (!statusWorkloadHelper.isLeafTask(task)) {
            throw new IllegalArgumentException("只有叶子节点可以撤销质检");
        }
        if (task.getStatus() != TaskStatus.SUBMITTED_FOR_QA) {
            throw new IllegalArgumentException("只有待质检状态可以撤销，质检中及之后不可撤销");
        }

        Map<String, Double> sw = statusWorkloadHelper.parseStatusWorkloads(task.getStatusWorkloads());
        double submittedForQa = sw.getOrDefault(WorkflowStages.SUBMITTED_FOR_QA, 0.0);

        sw.put(WorkflowStages.SUBMITTED_FOR_QA, 0.0);
        sw.put(WorkflowStages.IN_PROGRESS, submittedForQa);
        task.setStatusWorkloads(statusWorkloadHelper.serializeStatusWorkloads(sw));
        task.setStatus(TaskStatus.IN_PROGRESS);
        task.setInProgressCompletedWorkload(submittedForQa);
        task.setProgress(progressCalculationHelper.calculateLeafProgress(task, sw));

        Task saved = taskRepository.save(task);
        if (saved.getParentTaskId() != null) {
            progressCalculationHelper.recalculateAncestorProgressAndStatus(saved.getParentTaskId());
        }

        Task refreshed = taskRepository.findById(saved.getId()).orElse(saved);
        return notifyAndReturn(refreshed, "revoke-qa");
    }

    @Override
    public List<com.example.taskmanagement.dto.HandoffRecordResponse> getHandoffRecords(UUID taskId, Authentication authentication, String departmentId, String departmentName, UUID userId) {
        Task task = getTaskEntityById(taskId);
        if (!taskPermissionHelper.canReadTask(task, authentication, departmentId, departmentName, userId)) {
            throw new AccessDeniedException("Forbidden");
        }
        List<com.example.taskmanagement.model.TaskHandoffRecord> records = handoffRecordRepository.findByTaskIdOrderByOperatedAtAsc(taskId);
        return records.stream().map(r -> {
            com.example.taskmanagement.dto.HandoffRecordResponse resp = new com.example.taskmanagement.dto.HandoffRecordResponse();
            resp.setId(r.getId());
            resp.setTaskId(r.getTaskId());
            resp.setAction(r.getAction());
            resp.setFromControllerId(r.getFromControllerId());
            resp.setToControllerId(r.getToControllerId());
            resp.setFromDepartmentId(r.getFromDepartmentId());
            resp.setToDepartmentId(r.getToDepartmentId());
            resp.setFromAssigneeId(r.getFromAssigneeId());
            resp.setToAssigneeId(r.getToAssigneeId());
            resp.setFromAssignerId(r.getFromAssignerId());
            resp.setToAssignerId(r.getToAssignerId());
            resp.setOperatedBy(r.getOperatedBy());
            resp.setOperatedAt(r.getOperatedAt());
            resp.setFromStatus(r.getFromStatus());
            resp.setToStatus(r.getToStatus());
            return resp;
        }).toList();
    }

    @Override
    public List<TaskResponse> getSubTasks(UUID parentId, Authentication authentication, String departmentId, String departmentName, UUID userId) {
        Task parent = getTaskEntityById(parentId);
        if (!taskPermissionHelper.canReadTask(parent, authentication, departmentId, departmentName, userId)) {
            throw new AccessDeniedException("Forbidden");
        }
        List<Task> tasks = taskRepository.findByParentTaskId(parentId);
        tasks = tasks.stream().filter(t -> taskPermissionHelper.canReadTask(t, authentication, departmentId, departmentName, userId)).toList();
        return tasks.stream().map(this::toResponse).toList();
    }

    @Override
    public long countCompletedTasksByAssignee(UUID assigneeId, String departmentId) {
        if (departmentId == null) {
            return taskRepository.countByAssigneeIdAndStatus(assigneeId, TaskStatus.COMPLETED);
        }
        return taskRepository.countByAssigneeIdAndStatusAndDepartmentId(assigneeId, TaskStatus.COMPLETED, departmentId);
    }

    @Override
    @Transactional
    public void addDependency(UUID taskId, UUID dependencyTaskId) {
        addDependency(taskId, dependencyTaskId, null);
    }

    @Override
    @Transactional
    public void addDependency(UUID taskId, UUID dependencyTaskId, String unlockStatus) {
        dependencyService.addDependency(dependencyTaskId, taskId, unlockStatus);
    }

    @Autowired
    private TaskExecutorRegistry taskExecutorRegistry;

    @Override
    public void triggerTaskExecution(UUID id) {
        Task task = getTaskEntityById(id);
        if (task.getType() == null || task.getType().isBlank()) {
            throw new IllegalArgumentException("Cannot execute task without a valid type");
        }
        logger.info("Triggering execution for task {} with type {}", id, task.getType());

        java.util.Optional<TaskExecutor> executorOpt = taskExecutorRegistry.findExecutor(task.getType());

        try {
            executorOpt.ifPresent(executor -> {
                java.util.Map<String, Object> params = parseJsonObject(task.getInputParams());
                if (params.containsKey("qa_feedback")) {
                    params.put("qa_feedback", new java.util.ArrayList<>());
                    task.setInputParams(writeJsonObject(params));
                }
                executor.normalizeInputParams(task);
            });

            task.setStatus(TaskStatus.ASSIGNED);
            java.util.Map<String, Object> dispatchParams = parseJsonObject(task.getInputParams());
            dispatchParams.put("workflowStatus", WorkflowStages.ASSIGNED);
            dispatchParams.put("workflow_status", WorkflowStages.ASSIGNED);
            task.setInputParams(writeJsonObject(dispatchParams));
            task.setStartedAt(ZonedDateTime.now());
            taskRepository.save(task);

            if (executorOpt.isPresent()) {
                TaskExecutor executor = executorOpt.get();
                new Thread(() -> {
                    executor.execute(task);
                }).start();
                return;
            }

            logger.warn("No executor found for task type: {}", task.getType());
            task.setStatus(TaskStatus.FAILED);
            task.setOutputResults("{\"error\": \"Unsupported task type\"}");
            taskRepository.save(task);
        } catch (RuntimeException ex) {
            try {
                task.setStatus(TaskStatus.FAILED);
                task.setOutputResults(writeJsonObject(java.util.Map.of("error", ex.getMessage() == null ? "execute_failed" : ex.getMessage())));
                taskRepository.save(task);
            } catch (Exception ignored) {
            }
            throw ex;
        }
    }

    private Task getTaskEntityById(UUID id) {
        return taskRepository.findById(id).orElseThrow(() -> new com.example.taskmanagement.exception.NotFoundException("Task not found with id: " + id));
    }












    private void collectDescendants(UUID parentId, Set<UUID> visibleIds, Map<UUID, Task> taskMap, int depth) {
        if (depth >= maxTreeDepth) return;
        List<Task> children = taskRepository.findByParentTaskId(parentId);
        for (Task child : children) {
            if (visibleIds.add(child.getId())) {
                taskMap.put(child.getId(), child);
                collectDescendants(child.getId(), visibleIds, taskMap, depth + 1);
            }
        }
    }

    private TaskResponse toResponseWithCanUpdate(Task task, Authentication authentication, String departmentId, String departmentName, UUID userId) {
        TaskResponse response = toResponse(task);
        response.setCanUpdate(taskPermissionHelper.canUpdateTask(task, authentication, departmentId, departmentName, userId));
        return response;
    }

    private void createSelfCheckTask(Task operationTask) {
        Task selfCheck = new Task();
        selfCheck.setName(operationTask.getName() + " 自检");
        selfCheck.setType(operationTask.getType());
        TaskCategory selfCheckCategory = operationTask.getCategory() == TaskCategory.SYSTEM_TASK
                ? TaskCategory.SYSTEM_TASK
                : TaskCategory.SELF_CHECK_TASK;
        selfCheck.setCategory(selfCheckCategory);
        selfCheck.setStatus(TaskStatus.PENDING);
        selfCheck.setPriority(operationTask.getPriority());
        selfCheck.setDepartmentId(operationTask.getDepartmentId());
        selfCheck.setProjectId(operationTask.getProjectId());
        UUID selfCheckParentTaskId = operationTask.getId();
        if (selfCheckCategory == TaskCategory.SYSTEM_TASK && operationTask.getProjectId() != null) {
            selfCheckParentTaskId = operationTask.getProjectId();
        }
        selfCheck.setParentTaskId(selfCheckParentTaskId);
        selfCheck.setSelfCheckForTaskId(operationTask.getId());
        selfCheck.setPlannedDueAt(operationTask.getPlannedDueAt());
        taskRepository.save(selfCheck);
    }

    private void createOrReplaceAssignments(UUID taskId, List<UUID> userIds, TaskAssignmentRole role) {
        if (userIds == null) return;
        taskAssignmentRepository.findByIdTaskId(taskId).stream()
                .filter(a -> role.name().equalsIgnoreCase(a.getId().getAssignmentRole()))
                .forEach(taskAssignmentRepository::delete);
        for (UUID uid : userIds) {
            if (uid == null) continue;
            taskAssignmentRepository.save(new TaskAssignment(taskId, uid, role));
        }
    }

    private TaskResponse toResponse(Task task) {
        TaskResponse r = new TaskResponse();
        r.setId(task.getId());
        r.setName(task.getName());
        r.setType(task.getType());
        r.setCategory(task.getCategory());
        r.setStatus(task.getStatus());
        r.setPriority(task.getPriority());
        r.setAssigneeId(task.getAssigneeId());
        r.setPreviousAssigneeId(task.getPreviousAssigneeId());
        r.setAssignerId(task.getAssignerId());
        r.setProjectId(task.getProjectId());
        r.setParentTaskId(task.getParentTaskId());
        r.setDepartmentId(task.getDepartmentId());
        r.setCreatedByName(task.getCreatedByName());
        r.setCreatedById(task.getCreatedById());
        r.setCreatedDepartmentId(task.getCreatedDepartmentId());
        r.setCreatedDepartmentName(task.getCreatedDepartmentName());
        r.setExternalSystem(task.getExternalSystem());
        r.setExternalTaskId(task.getExternalTaskId());
        r.setExternalUrl(task.getExternalUrl());
        r.setProjectLeaderId((task.getCategory() == TaskCategory.PROJECT || task.getCategory() == TaskCategory.PHASE) ? task.getAssigneeId() : null);
        r.setProgress(task.getProgress());
        r.setInputParams(task.getInputParams());
        r.setOutputResults(task.getOutputResults());
        r.setPlannedDueAt(task.getPlannedDueAt());
        r.setCreatedAt(task.getCreatedAt());
        r.setStartedAt(task.getStartedAt());
        r.setReceivedAt(task.getReceivedAt());
        r.setUndoRequestedAt(task.getUndoRequestedAt());
        r.setCompletedAt(task.getCompletedAt());
        r.setWorkload(task.getWorkload());
        r.setWorkloadUnit(task.getWorkloadUnit());
        r.setWeight(task.getWeight());
        r.setCompositionMode(task.getCompositionMode());
        r.setDepthLevel(progressCalculationHelper.calculateTaskDepth(task.getId()));
        r.setWorkflowStatus(task.getWorkflowStatus());
        r.setRemarks(task.getRemarks());
        r.setAttachmentCount(task.getAttachmentCount());
        r.setAssignAttachmentCount((int) actionAttachmentRepository.countByTaskIdAndAction(task.getId(), "ASSIGN"));
        r.setSubmitQaAttachmentCount((int) actionAttachmentRepository.countByTaskIdAndAction(task.getId(), "SUBMIT_QA"));
        if (task.getWorkload() != null && task.getWorkload() > 0) {
            Map<String, Double> sw = statusWorkloadHelper.parseStatusWorkloads(task.getStatusWorkloads());
            double swTotal = sw.values().stream().mapToDouble(Double::doubleValue).sum();
            if (swTotal < 0.001 && (task.getStatusWorkloads() == null || task.getStatusWorkloads().isBlank())) {
                sw = statusWorkloadHelper.emptyStatusWorkloads();
                String stage = statusWorkloadHelper.mapTaskStatusToWorkflowStage(task.getStatus());
                if (stage != null) {
                    sw.put(stage, task.getWorkload());
                } else {
                    sw.put(WorkflowStages.PENDING, task.getWorkload());
                }
            }
            r.setStatusWorkloads(statusWorkloadHelper.serializeStatusWorkloads(sw));
        } else {
            r.setStatusWorkloads(task.getStatusWorkloads());
        }
        r.setInProgressWeight(task.getInProgressWeight());
        r.setInProgressCompletedWorkload(task.getInProgressCompletedWorkload());
        r.setQaDepartmentId(task.getQaDepartmentId());
        r.setQaAssigneeId(task.getQaAssigneeId());
        r.setHasChildren(taskRepository.existsByParentTaskId(task.getId()));
        r.setDirectChildCount((int) taskRepository.countByParentTaskId(task.getId()));
        r.setControllerId(task.getControllerId());

        boolean isLeaf = !taskRepository.existsByParentTaskId(task.getId());
        if (isLeaf && task.getStatus() == TaskStatus.ASSIGNED) {
            r.setCanRevokeAssignment(
                    handoffRecordRepository.findTopByTaskIdAndActionInOrderByOperatedAtDesc(
                            task.getId(), java.util.List.of("ASSIGN", "REASSIGN")) != null);
        }
        if (isLeaf && task.getStatus() == TaskStatus.RECEIVED) {
            r.setCanUndoReceive(
                    handoffRecordRepository.findTopByTaskIdAndActionInOrderByOperatedAtDesc(
                            task.getId(), java.util.List.of("RECEIVE")) != null);
        }

        r.setProgressFormula(progressCalculationHelper.buildProgressFormula(task));

        List<TaskAssignment> assignments = taskAssignmentRepository.findByIdTaskId(task.getId());
        r.setOperatorIds(assignments.stream()
                .filter(a -> TaskAssignmentRole.OPERATOR.name().equalsIgnoreCase(a.getId().getAssignmentRole()))
                .map(a -> a.getId().getUserId())
                .distinct()
                .collect(Collectors.toList()));
        r.setInspectorIds(assignments.stream()
                .filter(a -> TaskAssignmentRole.INSPECTOR.name().equalsIgnoreCase(a.getId().getAssignmentRole()))
                .map(a -> a.getId().getUserId())
                .distinct()
                .collect(Collectors.toList()));
        return r;
    }

    private TaskResponse notifyAndReturn(Task task, String action) {
        sseNotificationService.notifyTaskChange(action, task.getId());
        return toResponse(task);
    }

    private void recordHandoff(Task task, String action, UUID fromControllerId, UUID toControllerId,
                               String fromDepartmentId, String toDepartmentId,
                               UUID fromAssigneeId, UUID toAssigneeId,
                               UUID fromAssignerId, UUID toAssignerId,
                               String fromStatus, String toStatus,
                               UUID operatedBy) {
        com.example.taskmanagement.model.TaskHandoffRecord record = new com.example.taskmanagement.model.TaskHandoffRecord();
        record.setTaskId(task.getId());
        record.setAction(action);
        record.setFromControllerId(fromControllerId);
        record.setToControllerId(toControllerId);
        record.setFromDepartmentId(fromDepartmentId);
        record.setToDepartmentId(toDepartmentId);
        record.setFromAssigneeId(fromAssigneeId);
        record.setToAssigneeId(toAssigneeId);
        record.setFromAssignerId(fromAssignerId);
        record.setToAssignerId(toAssignerId);
        record.setFromStatus(fromStatus);
        record.setToStatus(toStatus);
        record.setOperatedBy(operatedBy);
        handoffRecordRepository.save(record);
    }
























    @Override
    public PersonnelWorkStatsResponse getPersonnelWorkStats(UUID taskId, UUID userId, String startDate, String endDate, String interval, String departmentId) {
        Task root = getTaskEntityById(taskId);
        List<Task> targetTasks;
        if (root.getCategory() == TaskCategory.PROJECT) {
            targetTasks = taskRepository.findByProjectIdAndCategory(root.getId(), TaskCategory.OPERATION_TASK);
        } else {
            targetTasks = List.of(root);
        }

        PersonnelWorkStatsResponse response = new PersonnelWorkStatsResponse();
        response.setUserId(userId);

        long total = 0;
        long completed = 0;
        double totalWorkload = 0.0;
        String unit = null;

        for (Task t : targetTasks) {
            if (userId != null && !userId.equals(t.getAssigneeId())) continue;
            if (departmentId != null && !departmentId.equals(t.getDepartmentId())) continue;
            total++;
            if (t.getStatus() == TaskStatus.COMPLETED) completed++;
            if (t.getWorkload() != null) totalWorkload += t.getWorkload();
            if (unit == null && t.getWorkloadUnit() != null) unit = t.getWorkloadUnit();
        }

        response.setTotalTasks(total);
        response.setCompletedTasks(completed);
        response.setTotalWorkload(totalWorkload);
        response.setWorkloadUnit(unit);

        java.util.List<PersonnelWorkStatsResponse.IntervalStats> breakdown = new java.util.ArrayList<>();
        breakdown.add(new PersonnelWorkStatsResponse.IntervalStats());
        breakdown.get(0).setPeriod(startDate != null ? startDate : "all");
        breakdown.get(0).setTaskCount(total);
        breakdown.get(0).setWorkload(totalWorkload);
        response.setIntervalBreakdown(breakdown);

        java.util.List<PersonnelWorkStatsResponse.StageResponsibleInfo> stageInfo = new java.util.ArrayList<>();
        for (Task t : targetTasks) {
            if (userId != null && !userId.equals(t.getAssigneeId())) continue;
            java.util.Map<String, Object> inputParams = parseJsonObject(t.getInputParams());
            Object feedback = inputParams.get("qa_feedback");
            if (feedback instanceof java.util.List<?> list) {
                for (Object item : list) {
                    if (item instanceof java.util.Map<?, ?> map) {
                        PersonnelWorkStatsResponse.StageResponsibleInfo info = new PersonnelWorkStatsResponse.StageResponsibleInfo();
                        info.setStage(map.get("stage") != null ? map.get("stage").toString() : null);
                        info.setUsername(map.get("by") != null ? map.get("by").toString() : null);
                        info.setCompletedAt(map.get("at") != null ? map.get("at").toString() : null);
                        stageInfo.add(info);
                    }
                }
            }
        }
        response.setStageResponsibleInfo(stageInfo);

        return response;
    }




    @Override
    @Transactional
    public TaskResponse updateStatusWorkload(UUID id, Map<String, Double> newStatusWorkloads, Authentication authentication, String departmentId, UUID userId) {
        if (!taskPermissionHelper.hasAny(authentication,
                "task:update_global", "task:update_department", "task:update_project",
                "task:execute", "quality:check",
                "TASK:UPDATE_GLOBAL", "TASK:UPDATE_DEPARTMENT", "TASK:UPDATE_PROJECT", "TASK:EXECUTE")) {
            throw new AccessDeniedException("Forbidden");
        }
        Task task = getTaskEntityById(id);
        taskPermissionHelper.enforceDepartmentAccess(task, departmentId);
        statusWorkloadHelper.ensureStatusWorkloads(task);

        if (!statusWorkloadHelper.isLeafTask(task)) {
            throw new IllegalArgumentException("只有叶子节点可以设置状态工作量");
        }

        Map<String, Double> current = statusWorkloadHelper.parseStatusWorkloads(task.getStatusWorkloads());
        double totalWorkload = task.getWorkload() != null ? task.getWorkload() : 0.0;

        Map<String, Double> updated = statusWorkloadHelper.applyWaterfallFlow(current, newStatusWorkloads, totalWorkload);

        double sum = updated.values().stream().mapToDouble(Double::doubleValue).sum();
        if (Math.abs(sum - totalWorkload) > 0.01) {
            throw new IllegalArgumentException("状态工作量之和(" + sum + ")必须等于总工作量(" + totalWorkload + ")");
        }

        task.setStatusWorkloads(writeJsonObject(updated.entrySet().stream()
                .collect(java.util.stream.Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue))));

        TaskStatus derivedStatus = statusWorkloadHelper.deriveLeafTaskStatus(updated);
        if (derivedStatus == null && task.getStatus() != null) {
            task.setStatus(null);
        } else if (derivedStatus != null && derivedStatus != task.getStatus()) {
            if (isRootProject(task) && derivedStatus == TaskStatus.COMPLETED) {
                task.setStatus(TaskStatus.QA_COMPLETED);
            } else {
                task.setStatus(derivedStatus);
            }
        }

        int newProgress = progressCalculationHelper.calculateLeafProgress(task, updated);
        task.setProgress(newProgress);

        Task saved = taskRepository.save(task);

        if (saved.getParentTaskId() != null) {
            progressCalculationHelper.recalculateAncestorProgressAndStatus(saved.getParentTaskId());
        }

        progressCalculationHelper.checkRootProjectAutoTransition(saved);

        Task refreshed = taskRepository.findById(saved.getId()).orElse(saved);
        return notifyAndReturn(refreshed, "external-progress");
    }















    private boolean isRootProject(Task task) {
        if (task.getCategory() != TaskCategory.PROJECT) return false;
        return task.getParentTaskId() == null;
    }








}
