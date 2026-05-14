package com.example.taskmanagement.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class TaskAssignmentId implements Serializable {
    @Column(name = "task_id", nullable = false)
    private UUID taskId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "assignment_role", nullable = false)
    private String assignmentRole;

    public TaskAssignmentId() {
    }

    public TaskAssignmentId(UUID taskId, UUID userId, String assignmentRole) {
        this.taskId = taskId;
        this.userId = userId;
        this.assignmentRole = assignmentRole;
    }

    public UUID getTaskId() {
        return taskId;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getAssignmentRole() {
        return assignmentRole;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        TaskAssignmentId that = (TaskAssignmentId) o;
        return Objects.equals(taskId, that.taskId) && Objects.equals(userId, that.userId) && Objects.equals(assignmentRole, that.assignmentRole);
    }

    @Override
    public int hashCode() {
        return Objects.hash(taskId, userId, assignmentRole);
    }
}
