package com.example.taskmanagement.model;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.util.UUID;

@Entity
@Table(name = "task_assignments")
public class TaskAssignment {
    @EmbeddedId
    private TaskAssignmentId id;

    public TaskAssignment() {
    }

    public TaskAssignment(UUID taskId, UUID userId, TaskAssignmentRole role) {
        this.id = new TaskAssignmentId(taskId, userId, role.name());
    }

    public TaskAssignmentId getId() {
        return id;
    }

    public void setId(TaskAssignmentId id) {
        this.id = id;
    }
}
