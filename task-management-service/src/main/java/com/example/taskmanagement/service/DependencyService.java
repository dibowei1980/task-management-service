package com.example.taskmanagement.service;

import com.example.taskmanagement.model.Task;
import com.example.taskmanagement.model.TaskDependency;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public interface DependencyService {
    TaskDependency addDependency(UUID predecessorId, UUID successorId);
    TaskDependency addDependency(UUID predecessorId, UUID successorId, String unlockStatus);
    void removeDependency(UUID predecessorId, UUID successorId);
    void clearDependencies(UUID taskId);
    List<Task> getPredecessors(UUID taskId);
    List<Task> getPredecessors(UUID taskId, String departmentId);
    List<Task> getSuccessors(UUID taskId);
    List<Task> getSuccessors(UUID taskId, String departmentId);
    boolean areAllPredecessorsCompleted(UUID taskId);
    void checkAndUnlockSuccessors(UUID completedTaskId);
    void recomputeSuccessorStatuses(UUID changedTaskId);
    void recomputeTaskStatusByDependencies(UUID taskId);
    List<Map<String, Object>> getDependencyDetails(UUID taskId, String departmentId);
}
