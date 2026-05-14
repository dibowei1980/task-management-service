package com.example.taskmanagement.service.impl;

import com.example.taskmanagement.model.Task;
import com.example.taskmanagement.model.TaskDependency;
import com.example.taskmanagement.model.TaskStatus;
import com.example.taskmanagement.repository.TaskDependencyRepository;
import com.example.taskmanagement.repository.TaskRepository;
import com.example.taskmanagement.service.DependencyService;
import com.example.taskmanagement.service.TaskExecutorRegistry;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.UUID;
import java.util.stream.Collectors;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class DependencyServiceImpl implements DependencyService {

    private static final List<TaskStatus> STATUS_ORDER = List.of(
            TaskStatus.PENDING,
            TaskStatus.ASSIGNED,
            TaskStatus.RECEIVED,
            TaskStatus.IN_PROGRESS,
            TaskStatus.PAUSED,
            TaskStatus.SUBMITTED_FOR_QA,
            TaskStatus.QA_COMPLETING,
            TaskStatus.QA_COMPLETED,
            TaskStatus.COMPLETED,
            TaskStatus.FAILED
    );

    @Autowired
    private TaskDependencyRepository dependencyRepository;

    @Autowired
    private TaskRepository taskRepository;

    @Lazy
    @Autowired
    private TaskExecutorRegistry executorRegistry;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    @Transactional
    public TaskDependency addDependency(UUID predecessorId, UUID successorId) {
        return addDependency(predecessorId, successorId, null);
    }

    @Override
    @Transactional
    public TaskDependency addDependency(UUID predecessorId, UUID successorId, String unlockStatus) {
        if (predecessorId.equals(successorId)) {
            throw new IllegalArgumentException("A task cannot depend on itself");
        }
        if (!taskRepository.existsById(predecessorId)) {
            throw new EntityNotFoundException("Predecessor task not found: " + predecessorId);
        }
        if (!taskRepository.existsById(successorId)) {
            throw new EntityNotFoundException("Successor task not found: " + successorId);
        }
        if (dependencyRepository.existsByPredecessorIdAndSuccessorId(predecessorId, successorId)) {
            throw new IllegalStateException("Dependency already exists");
        }

        TaskDependency dependency = new TaskDependency(predecessorId, successorId, unlockStatus);
        return dependencyRepository.save(dependency);
    }

    @Override
    @Transactional
    public void removeDependency(UUID predecessorId, UUID successorId) {
    }

    @Override
    @Transactional
    public void clearDependencies(UUID taskId) {
        if (taskId == null) return;
        dependencyRepository.deleteByPredecessorId(taskId);
        dependencyRepository.deleteBySuccessorId(taskId);
    }

    @Override
    public List<Task> getPredecessors(UUID taskId) {
        List<UUID> predecessorIds = dependencyRepository.findBySuccessorId(taskId).stream()
                .map(TaskDependency::getPredecessorId)
                .collect(Collectors.toList());
        return taskRepository.findAllById(predecessorIds);
    }

    @Override
    public List<Task> getPredecessors(UUID taskId, String departmentId) {
        if (departmentId == null) return getPredecessors(taskId);
        Task base = taskRepository.findById(taskId).orElseThrow(() -> new EntityNotFoundException("Task not found: " + taskId));
        String baseDept = base.getDepartmentId();
        if (baseDept == null || !baseDept.equals(departmentId)) {
            throw new AccessDeniedException("Forbidden");
        }
        return getPredecessors(taskId).stream().filter(t -> departmentId.equals(t.getDepartmentId())).toList();
    }

    @Override
    public List<Task> getSuccessors(UUID taskId) {
        List<UUID> successorIds = dependencyRepository.findByPredecessorId(taskId).stream()
                .map(TaskDependency::getSuccessorId)
                .collect(Collectors.toList());
        return taskRepository.findAllById(successorIds);
    }

    @Override
    public List<Task> getSuccessors(UUID taskId, String departmentId) {
        if (departmentId == null) return getSuccessors(taskId);
        Task base = taskRepository.findById(taskId).orElseThrow(() -> new EntityNotFoundException("Task not found: " + taskId));
        String baseDept = base.getDepartmentId();
        if (baseDept == null || !baseDept.equals(departmentId)) {
            throw new AccessDeniedException("Forbidden");
        }
        return getSuccessors(taskId).stream().filter(t -> departmentId.equals(t.getDepartmentId())).toList();
    }

    @Override
    public boolean areAllPredecessorsCompleted(UUID taskId) {
        List<TaskDependency> deps = dependencyRepository.findBySuccessorId(taskId);
        for (TaskDependency dep : deps) {
            Task predecessor = taskRepository.findById(dep.getPredecessorId()).orElse(null);
            if (!isPredecessorSatisfied(predecessor, dep.getUnlockStatus())) {
                return false;
            }
        }
        return deps.isEmpty() || true;
    }

    private boolean isPredecessorSatisfied(Task task, String unlockStatus) {
        if (task == null) return false;
        String requiredStatus = unlockStatus != null ? unlockStatus : "QA_COMPLETED";
        if (hasReachedStatus(task.getStatus(), requiredStatus)) {
            return true;
        }
        return executorRegistry.findExecutor(task)
                .map(ex -> ex.isPredecessorSatisfied(task))
                .orElse(false);
    }

    private boolean hasReachedStatus(TaskStatus current, String requiredStatusStr) {
        if (current == null) return false;
        try {
            TaskStatus required = TaskStatus.valueOf(requiredStatusStr);
            int currentIdx = STATUS_ORDER.indexOf(current);
            int requiredIdx = STATUS_ORDER.indexOf(required);
            if (currentIdx < 0 || requiredIdx < 0) return false;
            return currentIdx >= requiredIdx;
        } catch (IllegalArgumentException e) {
            return current == TaskStatus.COMPLETED;
        }
    }

    private String extractWorkflowStatus(String inputParamsJson) {
        if (inputParamsJson == null || inputParamsJson.isBlank()) return null;
        try {
            java.util.Map<String, Object> map = objectMapper.readValue(inputParamsJson, new TypeReference<java.util.Map<String, Object>>() {});
            Object v = map.get("workflowStatus");
            if (v == null) v = map.get("workflow_status");
            if (v instanceof String s) return s;
            return null;
        } catch (Exception ex) {
            return null;
        }
    }

    private Map<String, Object> parseJsonObject(String json) {
        if (json == null || json.isBlank()) return new HashMap<>();
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception ex) {
            return new HashMap<>();
        }
    }

    private String writeJsonObject(Map<String, Object> map) {
        try {
            return objectMapper.writeValueAsString(map == null ? new HashMap<>() : map);
        } catch (Exception ex) {
            return "{}";
        }
    }

    private void setWorkflowStatus(Task task, String workflowStatus) {
        Map<String, Object> input = parseJsonObject(task.getInputParams());
        input.put("workflowStatus", workflowStatus);
        input.put("workflow_status", workflowStatus);
        task.setInputParams(writeJsonObject(input));
    }

    private boolean isLockableUnitTask(Task task) {
        if (task == null) return false;
        if (task.getStatus() == TaskStatus.IN_PROGRESS) return false;
        if (task.getStatus() == TaskStatus.COMPLETED) return false;
        String ws = extractWorkflowStatus(task.getInputParams());
        if (ws == null || ws.isBlank()) return true;
        return "PENDING".equals(ws) || "PAUSED".equals(ws);
    }

    private void lockUnitTask(Task task) {
        task.setStatus(TaskStatus.PAUSED);
        setWorkflowStatus(task, "PAUSED");
    }

    private void unlockUnitTask(Task task) {
        task.setStatus(TaskStatus.PENDING);
        setWorkflowStatus(task, "PENDING");
    }

    private boolean isUnitTaskLocked(Task task) {
        if (task == null) return false;
        if (task.getStatus() == TaskStatus.PAUSED) return true;
        String ws = extractWorkflowStatus(task.getInputParams());
        return "PAUSED".equals(ws);
    }

    private boolean isUnitTaskReady(Task task) {
        if (task == null) return false;
        if (task.getStatus() != TaskStatus.PENDING) return false;
        String ws = extractWorkflowStatus(task.getInputParams());
        if (ws == null || ws.isBlank()) return true;
        return "PENDING".equals(ws);
    }

    @Override
    @Transactional
    public void checkAndUnlockSuccessors(UUID completedTaskId) {
        recomputeSuccessorStatuses(completedTaskId);
    }

    @Override
    @Transactional
    public void recomputeSuccessorStatuses(UUID changedTaskId) {
        if (changedTaskId == null) return;
        List<Task> successors = getSuccessors(changedTaskId);
        for (Task successor : successors) {
            recomputeTaskStatusByDependencies(successor.getId());
        }
    }

    @Override
    @Transactional
    public void recomputeTaskStatusByDependencies(UUID taskId) {
        if (taskId == null) return;
        Task task = taskRepository.findById(taskId).orElse(null);
        if (task == null) return;
        if (!isLockableUnitTask(task)) return;

        boolean satisfied = areAllPredecessorsCompleted(taskId);
        if (satisfied) {
            if (isUnitTaskLocked(task)) {
                unlockUnitTask(task);
                taskRepository.save(task);
            }
            return;
        }
        if (isUnitTaskReady(task)) {
            lockUnitTask(task);
            taskRepository.save(task);
        }
    }

    @Override
    public List<Map<String, Object>> getDependencyDetails(UUID taskId, String departmentId) {
        List<TaskDependency> deps = dependencyRepository.findBySuccessorId(taskId);
        return deps.stream().map(dep -> {
            Map<String, Object> detail = new HashMap<>();
            detail.put("predecessorId", dep.getPredecessorId());
            detail.put("successorId", dep.getSuccessorId());
            detail.put("unlockStatus", dep.getUnlockStatus());
            detail.put("dependencyType", dep.getDependencyType() != null ? dep.getDependencyType().name() : "FINISH_TO_START");
            return detail;
        }).collect(Collectors.toList());
    }
}
