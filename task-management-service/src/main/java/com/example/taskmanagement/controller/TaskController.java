package com.example.taskmanagement.controller;

import com.example.taskmanagement.model.Task;
import com.example.taskmanagement.model.TaskCategory;
import com.example.taskmanagement.model.TaskStatus;
import com.example.taskmanagement.model.WorkflowStatus;
import com.example.taskmanagement.dto.AssignRequest;
import com.example.taskmanagement.dto.AddDependencyRequest;
import com.example.taskmanagement.dto.DecomposeRequest;
import com.example.taskmanagement.dto.SubmitCompletionRequest;
import com.example.taskmanagement.dto.TaskCreateRequest;
import com.example.taskmanagement.dto.TaskUpdateRequest;
import com.example.taskmanagement.dto.TaskResponse;
import com.example.taskmanagement.dto.TaskCompletionDataRequest;
import com.example.taskmanagement.dto.PersonnelWorkStatsRequest;
import com.example.taskmanagement.dto.PersonnelWorkStatsResponse;
import com.example.taskmanagement.dto.WorkflowStatusUpdateRequest;
import com.example.taskmanagement.service.TaskService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import jakarta.annotation.security.PermitAll;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

@RestController
@RequestMapping("/api/tasks")
@Tag(name = "Task Management", description = "APIs for managing tasks")
public class TaskController {
    private static final Logger log = LoggerFactory.getLogger(TaskController.class);

    private static UUID parseUuid(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return UUID.fromString(s);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    @Autowired
    private TaskService taskService;

    @Autowired
    private com.example.taskmanagement.security.AuthzService authzService;

    @Autowired
    private com.example.taskmanagement.service.DependencyService dependencyService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @PostMapping
    @Operation(summary = "Create a new task")
    @PreAuthorize("@authzService.canCreate(authentication)")
    public ResponseEntity<TaskResponse> createTask(@RequestBody TaskCreateRequest request,
                                                   Authentication authentication,
                                                   @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                   @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        return ResponseEntity.ok(taskService.createTask(request, authentication, departmentId, uid));
    }

    @PostMapping("/external/tasks/upsert")
    @Operation(summary = "External integration: upsert a task or project")
    @PreAuthorize("@authzService.canCreate(authentication)")
    public ResponseEntity<TaskResponse> upsertExternalTask(@RequestBody TaskCreateRequest request,
                                                           Authentication authentication,
                                                           @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                           @RequestAttribute(value = "userId", required = false) String userId) {
        if (request.getExternalSystem() == null || request.getExternalSystem().isBlank()
                || request.getExternalTaskId() == null || request.getExternalTaskId().isBlank()) {
            throw new IllegalArgumentException("externalSystem and externalTaskId are required");
        }
        UUID uid = parseUuid(userId);
        return ResponseEntity.ok(taskService.createTask(request, authentication, departmentId, uid));
    }

    @PostMapping("/external/sequences/upsert")
    @Operation(summary = "External integration: upsert a top-level project only (subtasks are created internally in TMS)")
    @PreAuthorize("@authzService.canCreate(authentication)")
    public ResponseEntity<TaskResponse> upsertExternalSequence(@RequestBody ExternalSequenceUpsertRequest request,
                                                                     Authentication authentication,
                                                                     @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                                     @RequestAttribute(value = "userId", required = false) String userId) {
        if (request == null || request.project == null) {
            throw new IllegalArgumentException("project is required");
        }
        if (request.project.getType() == null || request.project.getType().isBlank()) {
            throw new IllegalArgumentException("project type is required for external push (unregistered project type)");
        }
        UUID uid = parseUuid(userId);

        if (request.externalSystem != null && !request.externalSystem.isBlank()) {
            if (request.project.getExternalSystem() == null || request.project.getExternalSystem().isBlank()) {
                request.project.setExternalSystem(request.externalSystem);
            }
        }

        if (request.project.getCategory() == null) {
            request.project.setCategory(com.example.taskmanagement.model.TaskCategory.PROJECT);
        }
        TaskResponse project = taskService.createTask(request.project, authentication, departmentId, uid);

        return ResponseEntity.ok(project);
    }

    @PostMapping("/{id}/execute")
    @PreAuthorize("@authzService.canExecute(authentication)")
    public ResponseEntity<Void> triggerTaskExecution(@PathVariable UUID id) {
        taskService.triggerTaskExecution(id);
        return ResponseEntity.accepted().build();
    }

    @GetMapping
    @Operation(summary = "Get all tasks with pagination")
    @PreAuthorize("@authzService.canRead(authentication)")
    public ResponseEntity<Page<TaskResponse>> getAllTasks(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) TaskCategory category,
            @RequestParam(required = false) String externalSystem,
            Authentication authentication,
            @RequestAttribute(value = "departmentId", required = false) String departmentId,
            @RequestAttribute(value = "departmentName", required = false) String departmentName,
            @RequestAttribute(value = "userId", required = false) String userId) {
        Pageable pageable = PageRequest.of(page, size, parseSort(sort));
        String effectiveDepartmentId = departmentId;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            effectiveDepartmentId = null;
        }
        UUID uid = parseUuid(userId);
        return ResponseEntity.ok(taskService.getAllTasks(pageable, authentication, effectiveDepartmentId, departmentName, uid, category, externalSystem));
    }

    @GetMapping("/my-tree")
    @Operation(summary = "Get all visible nodes for current user's tree view, including ancestor chains")
    @PreAuthorize("@authzService.canRead(authentication)")
    public ResponseEntity<Page<TaskResponse>> getMyTree(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "5000") int size,
            Authentication authentication,
            @RequestAttribute(value = "departmentId", required = false) String departmentId,
            @RequestAttribute(value = "departmentName", required = false) String departmentName,
            @RequestAttribute(value = "userId", required = false) String userId) {
        Pageable pageable = PageRequest.of(page, size);
        String effectiveDepartmentId = departmentId;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            effectiveDepartmentId = null;
        }
        UUID uid = parseUuid(userId);
        return ResponseEntity.ok(taskService.getMyTree(pageable, authentication, effectiveDepartmentId, departmentName, uid));
    }

    private Sort parseSort(String sort) {
        if (sort == null || sort.isBlank()) return Sort.unsorted();
        String[] parts = sort.split(",");
        if (parts.length == 0) return Sort.unsorted();
        String property = parts[0] == null ? "" : parts[0].trim();
        if (property.isBlank()) return Sort.unsorted();
        Sort.Direction dir = Sort.Direction.ASC;
        if (parts.length >= 2) {
            String rawDir = parts[1] == null ? "" : parts[1].trim();
            if ("desc".equalsIgnoreCase(rawDir)) {
                dir = Sort.Direction.DESC;
            }
        }
        return Sort.by(dir, property);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get a task by ID")
    @PreAuthorize("@authzService.canRead(authentication)")
    public ResponseEntity<TaskResponse> getTaskById(@PathVariable UUID id,
                                            Authentication authentication,
                                            @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                            @RequestAttribute(value = "departmentName", required = false) String departmentName,
                                            @RequestAttribute(value = "userId", required = false) String userId) {
        String effectiveDepartmentId = departmentId;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            effectiveDepartmentId = null;
        }
        UUID uid = parseUuid(userId);
        return ResponseEntity.ok(taskService.getTaskById(id, authentication, effectiveDepartmentId, departmentName, uid));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a task")
    @PreAuthorize("@authzService.canUpdateOrParticipate(authentication)")
    public ResponseEntity<TaskResponse> updateTask(@PathVariable UUID id,
                                                   @RequestBody TaskUpdateRequest request,
                                                   Authentication authentication,
                                                   @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                   @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        return ResponseEntity.ok(taskService.updateTask(id, request, authentication, departmentId, uid));
    }

    @PatchMapping("/{id}/workflow-status")
    @Operation(summary = "Update workflow status for a task (stored in inputParams.workflow_status)")
    @PreAuthorize("@authzService.canUpdateWorkflowOrParticipate(authentication)")
    public ResponseEntity<TaskResponse> updateWorkflowStatus(@PathVariable UUID id,
                                                             @RequestBody WorkflowStatusUpdateRequest request,
                                                             Authentication authentication,
                                                             @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                             @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        String effectiveDepartmentId = departmentId;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            effectiveDepartmentId = null;
        }
        return ResponseEntity.ok(taskService.updateWorkflowStatus(id, request, authentication, effectiveDepartmentId, uid));
    }

    @GetMapping("/{id}/edit-permission")
    @Operation(summary = "Check edit permission for a task")
    @PreAuthorize("@authzService.canRead(authentication)")
    public ResponseEntity<Map<String, Object>> checkEditPermission(@PathVariable UUID id,
                                                                   Authentication authentication,
                                                                   @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                                   @RequestAttribute(value = "departmentName", required = false) String departmentName,
                                                                   @RequestAttribute(value = "userId", required = false) String userId) {
        boolean hasUpdate = authzService.canUpdate(authentication);
        UUID uid = parseUuid(userId);
        boolean allowed = taskService.canEditTask(id, authentication, departmentId, departmentName, uid);
        if (!allowed) {
            return ResponseEntity.ok(Map.of(
                    "allowed", false,
                    "message", "仅创建人可编辑"
            ));
        }
        return ResponseEntity.ok(Map.of("allowed", true));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a task")
    @PreAuthorize("@authzService.canDelete(authentication)")
    public ResponseEntity<Void> deleteTask(@PathVariable UUID id,
                                          Authentication authentication,
                                          @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                          @RequestAttribute(value = "departmentName", required = false) String departmentName,
                                          @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        taskService.deleteTask(id, authentication, departmentId, departmentName, uid);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/status")
    @Operation(summary = "Update task status")
    @PreAuthorize("@authzService.canUpdateStatus(authentication)")
    public ResponseEntity<TaskResponse> updateTaskStatus(@PathVariable UUID id,
                                                         @RequestParam TaskStatus status,
                                                         Authentication authentication,
                                                         @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                         @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        return ResponseEntity.ok(taskService.updateTaskStatus(id, status, authentication, departmentId, uid));
    }

    @GetMapping("/debug/me")
    @Operation(summary = "Debug: current user authorities")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> me(Authentication authentication) {
        List<String> authorities = authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority).toList();
        return ResponseEntity.ok(Map.of(
                "name", authentication.getName(),
                "authorities", authorities
        ));
    }

    @GetMapping("/debug/token")
    @Operation(summary = "Debug: parse token from Authorization header")
    @PermitAll
    public ResponseEntity<Map<String, Object>> token(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        Map<String, Object> result = new java.util.HashMap<>();
        result.put("authorizationHeaderPresent", authHeader != null);
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            result.put("error", "Missing or invalid Authorization header");
            return ResponseEntity.status(200).body(result);
        }
        String token = authHeader.substring(7);
        try {
            String username = com.example.taskmanagement.util.TokenDebugUtil.extractUsername(token);
            java.util.List<String> roles = com.example.taskmanagement.util.TokenDebugUtil.extractRoles(token);
            result.put("username", username);
            result.put("rolesClaim", roles);
            result.put("valid", true);
            return ResponseEntity.ok(result);
        } catch (Exception ex) {
            result.put("valid", false);
            result.put("error", ex.getClass().getSimpleName() + ": " + ex.getMessage());
            return ResponseEntity.status(200).body(result);
        }
    }

    @GetMapping("/{id}/subtasks")
    @Operation(summary = "Get subtasks")
    @PreAuthorize("@authzService.canRead(authentication)")
    public ResponseEntity<List<TaskResponse>> getSubTasks(@PathVariable UUID id,
                                                  Authentication authentication,
                                                 @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                 @RequestAttribute(value = "departmentName", required = false) String departmentName,
                                                 @RequestAttribute(value = "userId", required = false) String userId) {
        String effectiveDepartmentId = departmentId;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            effectiveDepartmentId = null;
        }
        UUID uid = parseUuid(userId);
        return ResponseEntity.ok(taskService.getSubTasks(id, authentication, effectiveDepartmentId, departmentName, uid));
    }

    @PostMapping("/{id}/dependencies")
    @Operation(summary = "Add task dependency with optional unlock status")
    @PreAuthorize("@authzService.canUpdate(authentication) || @authzService.canCreate(authentication)")
    public ResponseEntity<Void> addDependency(@PathVariable UUID id, @RequestBody AddDependencyRequest request, Authentication authentication) {
        UUID dependencyTaskId = UUID.fromString(request.getDependencyTaskId());
        String unlockStatus = request.getUnlockStatus();
        if (unlockStatus != null && !hasAny(authentication, "department:manager", "DEPARTMENT:MANAGER")) {
            throw new org.springframework.security.access.AccessDeniedException("设置解锁状态需要 department:manager 权限");
        }
        taskService.addDependency(id, dependencyTaskId, unlockStatus);
        return ResponseEntity.ok().build();
    }

    @PatchMapping("/{id}/status-workloads")
    @Operation(summary = "Update status workloads for a leaf task (waterfall flow)")
    @PreAuthorize("@authzService.canUpdateOrParticipate(authentication)")
    public ResponseEntity<TaskResponse> updateStatusWorkloads(@PathVariable UUID id,
                                                              @RequestBody Map<String, Double> statusWorkloads,
                                                              Authentication authentication,
                                                              @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                              @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        String effectiveDepartmentId = departmentId;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            effectiveDepartmentId = null;
        }
        return ResponseEntity.ok(taskService.updateStatusWorkload(id, statusWorkloads, authentication, effectiveDepartmentId, uid));
    }

    @DeleteMapping("/{id}/dependencies")
    @Operation(summary = "Clear dependencies of a task")
    @PreAuthorize("@authzService.canUpdate(authentication) || @authzService.canCreate(authentication)")
    public ResponseEntity<Void> clearDependencies(@PathVariable UUID id) {
        dependencyService.clearDependencies(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/count/completed")
    @Operation(summary = "Count completed tasks by assignee")
    @PreAuthorize("@authzService.canRead(authentication)")
    public ResponseEntity<Long> countCompletedTasksByAssignee(@RequestParam UUID assigneeId,
                                                              @RequestAttribute(value = "departmentId", required = false) String departmentId) {
        return ResponseEntity.ok(taskService.countCompletedTasksByAssignee(assigneeId, departmentId));
    }

    @PostMapping("/{id}/receive")
    @Operation(summary = "Leaf node: receive task (PENDING/ASSIGNED → RECEIVED)")
    @PreAuthorize("@authzService.canCreate(authentication)")
    public ResponseEntity<TaskResponse> receiveTask(@PathVariable UUID id,
                                                    Authentication authentication,
                                                    @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                    @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        String effectiveDepartmentId = departmentId;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            effectiveDepartmentId = null;
        }
        return ResponseEntity.ok(taskService.receiveTask(id, authentication, effectiveDepartmentId, uid));
    }

    @PostMapping("/{id}/assign")
    @Operation(summary = "Leaf node: assign task with department/qa info (PENDING → ASSIGNED)")
    @PreAuthorize("@authzService.canUpdate(authentication)")
    public ResponseEntity<TaskResponse> assignTaskWithDetails(@PathVariable UUID id,
                                                              @RequestBody AssignRequest request,
                                                              Authentication authentication,
                                                              @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                              @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        String effectiveDepartmentId = departmentId;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            effectiveDepartmentId = null;
        }
        return ResponseEntity.ok(taskService.assignTask(id, request, authentication, effectiveDepartmentId, uid));
    }

    @PostMapping("/{id}/decompose")
    @Operation(summary = "Leaf node: decompose task into homogeneous sub-tasks")
    @PreAuthorize("@authzService.canUpdate(authentication)")
    public ResponseEntity<TaskResponse> decomposeTask(@PathVariable UUID id,
                                                      @RequestBody DecomposeRequest request,
                                                      Authentication authentication,
                                                      @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                      @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        String effectiveDepartmentId = departmentId;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            effectiveDepartmentId = null;
        }
        return ResponseEntity.ok(taskService.decomposeTask(id, request, authentication, effectiveDepartmentId, uid));
    }

    @PostMapping("/{id}/revoke-assignment")
    @Operation(summary = "Leaf node: revoke assignment (ASSIGNED → PENDING)")
    @PreAuthorize("@authzService.canUpdate(authentication)")
    public ResponseEntity<TaskResponse> revokeAssignment(@PathVariable UUID id,
                                                         Authentication authentication,
                                                         @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                         @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        String effectiveDepartmentId = departmentId;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            effectiveDepartmentId = null;
        }
        return ResponseEntity.ok(taskService.revokeAssignment(id, authentication, effectiveDepartmentId, uid));
    }

    @PostMapping("/{id}/request-undo-receive")
    @Operation(summary = "Leaf node: request undo receive after 5 minutes")
    @PreAuthorize("@authzService.canExecute(authentication)")
    public ResponseEntity<TaskResponse> requestUndoReceive(@PathVariable UUID id,
                                                            Authentication authentication,
                                                            @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                            @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        String effectiveDepartmentId = departmentId;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            effectiveDepartmentId = null;
        }
        return ResponseEntity.ok(taskService.requestUndoReceive(id, authentication, effectiveDepartmentId, uid));
    }

    @PostMapping("/{id}/approve-undo-receive")
    @Operation(summary = "Approve undo receive request (RECEIVED → ASSIGNED/PENDING)")
    @PreAuthorize("@authzService.canUpdate(authentication)")
    public ResponseEntity<TaskResponse> approveUndoReceive(@PathVariable UUID id,
                                                            Authentication authentication,
                                                            @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                            @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        String effectiveDepartmentId = departmentId;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            effectiveDepartmentId = null;
        }
        return ResponseEntity.ok(taskService.approveUndoReceive(id, authentication, effectiveDepartmentId, uid));
    }

    @PostMapping("/{id}/cancel-undo-receive")
    @Operation(summary = "Cancel undo receive request (clears undoRequestedAt)")
    @PreAuthorize("@authzService.canExecute(authentication)")
    public ResponseEntity<TaskResponse> cancelUndoReceive(@PathVariable UUID id,
                                                           Authentication authentication,
                                                           @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                           @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        String effectiveDepartmentId = departmentId;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            effectiveDepartmentId = null;
        }
        return ResponseEntity.ok(taskService.cancelUndoReceive(id, authentication, effectiveDepartmentId, uid));
    }

    @PostMapping("/{id}/start-progress")
    @Operation(summary = "Leaf node: start progress (RECEIVED → IN_PROGRESS)")
    @PreAuthorize("@authzService.canExecute(authentication)")
    public ResponseEntity<TaskResponse> startProgress(@PathVariable UUID id,
                                                      Authentication authentication,
                                                      @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                      @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        String effectiveDepartmentId = departmentId;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            effectiveDepartmentId = null;
        }
        return ResponseEntity.ok(taskService.startProgress(id, authentication, effectiveDepartmentId, uid));
    }

    @PostMapping("/{id}/submit-completion")
    @Operation(summary = "Leaf node: submit completion workload (accumulate in IN_PROGRESS)")
    @PreAuthorize("@authzService.canExecute(authentication)")
    public ResponseEntity<TaskResponse> submitCompletion(@PathVariable UUID id,
                                                         @RequestBody SubmitCompletionRequest request,
                                                         Authentication authentication,
                                                         @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                         @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        String effectiveDepartmentId = departmentId;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            effectiveDepartmentId = null;
        }
        return ResponseEntity.ok(taskService.submitCompletion(id, request, authentication, effectiveDepartmentId, uid));
    }

    @PostMapping("/{id}/submit-qa")
    @Operation(summary = "Leaf node: submit for QA (IN_PROGRESS → SUBMITTED_FOR_QA, requires completed = total workload)")
    @PreAuthorize("@authzService.canExecute(authentication)")
    public ResponseEntity<TaskResponse> submitQa(@PathVariable UUID id,
                                                  Authentication authentication,
                                                  @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                  @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        String effectiveDepartmentId = departmentId;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            effectiveDepartmentId = null;
        }
        return ResponseEntity.ok(taskService.submitQa(id, authentication, effectiveDepartmentId, uid));
    }

    @PostMapping("/{id}/accept-qa")
    @Operation(summary = "QA accept (SUBMITTED_FOR_QA → QA_COMPLETING)")
    @PreAuthorize("@authzService.canQualityCheck(authentication)")
    public ResponseEntity<TaskResponse> acceptQa(@PathVariable UUID id,
                                                  Authentication authentication,
                                                  @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                  @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        return ResponseEntity.ok(taskService.acceptQa(id, authentication, departmentId, uid));
    }

    @PostMapping("/{id}/qa-approve")
    @Operation(summary = "QA approve (QA_COMPLETING → QA_COMPLETED)")
    @PreAuthorize("@authzService.canQualityCheck(authentication)")
    public ResponseEntity<TaskResponse> qaApprove(@PathVariable UUID id,
                                                   Authentication authentication,
                                                   @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                   @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        return ResponseEntity.ok(taskService.qaApprove(id, authentication, departmentId, uid));
    }

    @PostMapping("/{id}/qa-reject")
    @Operation(summary = "QA reject (QA_COMPLETING → IN_PROGRESS, preserve completed workload)")
    @PreAuthorize("@authzService.canQualityCheck(authentication)")
    public ResponseEntity<TaskResponse> qaReject(@PathVariable UUID id,
                                                  Authentication authentication,
                                                  @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                  @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        return ResponseEntity.ok(taskService.qaReject(id, authentication, departmentId, uid));
    }

    @PostMapping("/{id}/revoke-qa")
    @Operation(summary = "Revoke QA submission (SUBMITTED_FOR_QA → IN_PROGRESS, preserve completed workload)")
    @PreAuthorize("@authzService.canExecute(authentication)")
    public ResponseEntity<TaskResponse> revokeQa(@PathVariable UUID id,
                                                  Authentication authentication,
                                                  @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                  @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        String effectiveDepartmentId = departmentId;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            effectiveDepartmentId = null;
        }
        return ResponseEntity.ok(taskService.revokeQa(id, authentication, effectiveDepartmentId, uid));
    }

    @GetMapping("/{id}/handoff-records")
    @Operation(summary = "Get handoff records for a task")
    @PreAuthorize("@authzService.canRead(authentication)")
    public ResponseEntity<List<com.example.taskmanagement.dto.HandoffRecordResponse>> getHandoffRecords(@PathVariable UUID id,
                                                                                                        Authentication authentication,
                                                                                                        @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                                                                        @RequestAttribute(value = "departmentName", required = false) String departmentName,
                                                                                                        @RequestAttribute(value = "userId", required = false) String userId) {
        UUID uid = parseUuid(userId);
        return ResponseEntity.ok(taskService.getHandoffRecords(id, authentication, departmentId, departmentName, uid));
    }

    @GetMapping("/{id}/dependencies")
    @Operation(summary = "Get task dependencies")
    @PreAuthorize("@authzService.canRead(authentication)")
    public ResponseEntity<Map<String, Object>> getTaskDependencies(@PathVariable UUID id,
                                                                       Authentication authentication,
                                                                       @RequestAttribute(value = "departmentId", required = false) String departmentId) {
        String effectiveDepartmentId = departmentId;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            effectiveDepartmentId = null;
        }
        List<Task> predecessors = dependencyService.getPredecessors(id, effectiveDepartmentId);
        List<Task> successors = dependencyService.getSuccessors(id, effectiveDepartmentId);
        List<Map<String, Object>> depDetails = dependencyService.getDependencyDetails(id, effectiveDepartmentId);
        Map<String, Object> result = new HashMap<>();
        result.put("predecessors", predecessors);
        result.put("successors", successors);
        result.put("dependencyDetails", depDetails);
        return ResponseEntity.ok(result);
    }

    static boolean hasAny(Authentication authentication, String... authorities) {
        if (authentication == null || authentication.getAuthorities() == null) return false;
        for (GrantedAuthority ga : authentication.getAuthorities()) {
            String actual = ga.getAuthority();
            if (actual == null || actual.isBlank()) continue;
            for (String expected : authorities) {
                if (expected == null || expected.isBlank()) continue;
                if (actual.equals(expected) || actual.equalsIgnoreCase(expected)) return true;
            }
        }
        return false;
    }

    private Map<String, Object> parseJsonObject(String json) {
        if (json == null || json.isBlank()) return new HashMap<>();
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception ex) {
            return new HashMap<>();
        }
    }

    private String writeJsonObject(Map<String, Object> obj) {
        if (obj == null) return "{}";
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception ex) {
            return "{}";
        }
    }

    public static class ExternalSequenceUpsertRequest {
        public String externalSystem;
        public TaskCreateRequest project;
    }

    @PostMapping("/{id}/completion-data")
    @Operation(summary = "Submit task completion data from external system")
    @PreAuthorize("@authzService.canUpdateWorkflowOrParticipate(authentication)")
    public ResponseEntity<TaskResponse> submitCompletionData(@PathVariable UUID id,
                                                              @RequestBody TaskCompletionDataRequest request,
                                                              Authentication authentication,
                                                              @RequestAttribute(value = "departmentId", required = false) String departmentId,
                                                              @RequestAttribute(value = "userId", required = false) String userId) {
        if (request.getTaskId() != null && !id.equals(request.getTaskId())) {
            throw new IllegalArgumentException("taskId in body must match path id");
        }
        UUID uid = parseUuid(userId);
        String effectiveDepartmentId = departmentId;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            effectiveDepartmentId = null;
        }

        WorkflowStatusUpdateRequest wsRequest = new WorkflowStatusUpdateRequest();
        if (request.getWorkflowStatus() != null && !request.getWorkflowStatus().isBlank()) {
            wsRequest.setWorkflowStatus(WorkflowStatus.valueOf(request.getWorkflowStatus()));
        }
        wsRequest.setProgress(request.getProgress());
        wsRequest.setResults(request.getResults());
        wsRequest.setSystemId(request.getSystemId());
        wsRequest.setTaskId(id);
        wsRequest.setCompletedWorkload(request.getCompletedWorkload());
        wsRequest.setWorkloadUnit(request.getWorkloadUnit());
        if (request.getStageResponsibles() != null) {
            java.util.List<WorkflowStatusUpdateRequest.StageResponsible> mapped = request.getStageResponsibles().stream()
                    .map(item -> {
                        WorkflowStatusUpdateRequest.StageResponsible r = new WorkflowStatusUpdateRequest.StageResponsible();
                        r.setStage(item.getStage());
                        r.setUserId(item.getUserId());
                        r.setUsername(item.getUsername());
                        r.setCompletedAt(item.getCompletedAt());
                        return r;
                    })
                    .toList();
            wsRequest.setStageResponsibles(mapped);
        }

        return ResponseEntity.ok(taskService.updateWorkflowStatus(id, wsRequest, authentication, effectiveDepartmentId, uid));
    }

    @GetMapping("/{id}/personnel-stats")
    @Operation(summary = "Query personnel work statistics for a task/project")
    @PreAuthorize("@authzService.canRead(authentication)")
    public ResponseEntity<PersonnelWorkStatsResponse> getPersonnelStats(@PathVariable UUID id,
                                                                        @RequestParam(required = false) UUID userId,
                                                                        @RequestParam(required = false) String startDate,
                                                                        @RequestParam(required = false) String endDate,
                                                                        @RequestParam(required = false, defaultValue = "day") String interval,
                                                                        Authentication authentication,
                                                                        @RequestAttribute(value = "departmentId", required = false) String departmentId) {
        String effectiveDepartmentId = departmentId;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            effectiveDepartmentId = null;
        }
        return ResponseEntity.ok(taskService.getPersonnelWorkStats(id, userId, startDate, endDate, interval, effectiveDepartmentId));
    }
}
