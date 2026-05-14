package com.example.taskmanagement.service;

import com.example.taskmanagement.model.Task;
import com.example.taskmanagement.model.TaskCategory;
import com.example.taskmanagement.model.TaskStatus;

public interface TaskExecutor {
    boolean supports(String type);

    void execute(Task task);

    default String getDefaultType(TaskCategory category) {
        return null;
    }

    default boolean onTaskCreated(Task task) { return false; }

    default void onTaskUpdated(Task task) {}

    default void normalizeInputParams(Task task) {}

    default String enrichInputParams(Task task, String inputParams) {
        return inputParams;
    }

    default boolean canUpdateInputParams(Task task) {
        return true;
    }

    default void onWorkflowStatusChanged(Task task, String oldStatus, String newStatus) {}

    default boolean isPredecessorSatisfied(Task task) {
        return false;
    }

    default TaskStatus resolveTaskStatus(Task task) {
        return null;
    }
}
