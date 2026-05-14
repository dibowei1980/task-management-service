package com.example.taskmanagement.service;

import com.example.taskmanagement.dto.AssignRequest;
import com.example.taskmanagement.dto.DecomposeRequest;
import com.example.taskmanagement.dto.SubmitCompletionRequest;
import com.example.taskmanagement.dto.TaskCreateRequest;
import com.example.taskmanagement.dto.TaskUpdateRequest;
import com.example.taskmanagement.dto.TaskResponse;
import com.example.taskmanagement.dto.PersonnelWorkStatsResponse;
import com.example.taskmanagement.dto.WorkflowStatusUpdateRequest;
import com.example.taskmanagement.model.TaskCategory;
import com.example.taskmanagement.model.TaskStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.Authentication;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public interface TaskService {
    TaskResponse createTask(TaskCreateRequest request, Authentication authentication, String departmentId, UUID userId);
    TaskResponse getTaskById(UUID id, Authentication authentication, String departmentId, String departmentName, UUID userId);
    Page<TaskResponse> getAllTasks(Pageable pageable, Authentication authentication, String departmentId, String departmentName, UUID userId, TaskCategory category, String externalSystem);
    Page<TaskResponse> getMyTree(Pageable pageable, Authentication authentication, String departmentId, String departmentName, UUID userId);
    TaskResponse updateTask(UUID id, TaskUpdateRequest request, Authentication authentication, String departmentId, UUID userId);
    TaskResponse updateWorkflowStatus(UUID id, WorkflowStatusUpdateRequest request, Authentication authentication, String departmentId, UUID userId);
    boolean canEditTask(UUID id, Authentication authentication, String departmentId, String departmentName, UUID userId);
    void deleteTask(UUID id, Authentication authentication, String departmentId, String departmentName, UUID userId);
    TaskResponse updateTaskStatus(UUID id, TaskStatus status, Authentication authentication, String departmentId, UUID userId);
    List<TaskResponse> getSubTasks(UUID parentId, Authentication authentication, String departmentId, String departmentName, UUID userId);
    void addDependency(UUID taskId, UUID dependencyTaskId);
    void addDependency(UUID taskId, UUID dependencyTaskId, String unlockStatus);

    long countCompletedTasksByAssignee(UUID assigneeId, String departmentId);

    void triggerTaskExecution(UUID id);

    PersonnelWorkStatsResponse getPersonnelWorkStats(UUID taskId, UUID userId, String startDate, String endDate, String interval, String departmentId);

    TaskResponse updateStatusWorkload(UUID id, Map<String, Double> statusWorkloads, Authentication authentication, String departmentId, UUID userId);

    TaskResponse receiveTask(UUID id, Authentication authentication, String departmentId, UUID userId);

    TaskResponse assignTask(UUID id, AssignRequest request, Authentication authentication, String departmentId, UUID userId);

    TaskResponse decomposeTask(UUID id, DecomposeRequest request, Authentication authentication, String departmentId, UUID userId);

    TaskResponse revokeAssignment(UUID id, Authentication authentication, String departmentId, UUID userId);

    TaskResponse requestUndoReceive(UUID id, Authentication authentication, String departmentId, UUID userId);
    TaskResponse approveUndoReceive(UUID id, Authentication authentication, String departmentId, UUID userId);
    TaskResponse cancelUndoReceive(UUID id, Authentication authentication, String departmentId, UUID userId);

    TaskResponse startProgress(UUID id, Authentication authentication, String departmentId, UUID userId);

    TaskResponse submitCompletion(UUID id, SubmitCompletionRequest request, Authentication authentication, String departmentId, UUID userId);
    TaskResponse submitQa(UUID id, Authentication authentication, String departmentId, UUID userId);
    TaskResponse acceptQa(UUID id, Authentication authentication, String departmentId, UUID userId);
    TaskResponse qaApprove(UUID id, Authentication authentication, String departmentId, UUID userId);
    TaskResponse qaReject(UUID id, Authentication authentication, String departmentId, UUID userId);
    TaskResponse revokeQa(UUID id, Authentication authentication, String departmentId, UUID userId);

    List<com.example.taskmanagement.dto.HandoffRecordResponse> getHandoffRecords(UUID taskId, Authentication authentication, String departmentId, String departmentName, UUID userId);
}
