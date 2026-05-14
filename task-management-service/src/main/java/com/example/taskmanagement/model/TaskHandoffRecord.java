package com.example.taskmanagement.model;

import jakarta.persistence.*;

import java.time.ZonedDateTime;
import java.util.UUID;

@Entity
@Table(name = "task_handoff_records")
public class TaskHandoffRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "task_id", nullable = false)
    private UUID taskId;

    @Column(name = "action", nullable = false, length = 32)
    private String action;

    @Column(name = "from_controller_id")
    private UUID fromControllerId;

    @Column(name = "to_controller_id")
    private UUID toControllerId;

    @Column(name = "from_department_id", length = 64)
    private String fromDepartmentId;

    @Column(name = "to_department_id", length = 64)
    private String toDepartmentId;

    @Column(name = "from_assignee_id")
    private UUID fromAssigneeId;

    @Column(name = "to_assignee_id")
    private UUID toAssigneeId;

    @Column(name = "from_assigner_id")
    private UUID fromAssignerId;

    @Column(name = "to_assigner_id")
    private UUID toAssignerId;

    @Column(name = "from_status", length = 32)
    private String fromStatus;

    @Column(name = "to_status", length = 32)
    private String toStatus;

    @Column(name = "operated_by")
    private UUID operatedBy;

    @Column(name = "operated_at", nullable = false)
    private ZonedDateTime operatedAt;

    @PrePersist
    protected void onCreate() {
        if (operatedAt == null) {
            operatedAt = ZonedDateTime.now();
        }
    }

    public TaskHandoffRecord() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public UUID getTaskId() { return taskId; }
    public void setTaskId(UUID taskId) { this.taskId = taskId; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public UUID getFromControllerId() { return fromControllerId; }
    public void setFromControllerId(UUID fromControllerId) { this.fromControllerId = fromControllerId; }

    public UUID getToControllerId() { return toControllerId; }
    public void setToControllerId(UUID toControllerId) { this.toControllerId = toControllerId; }

    public String getFromDepartmentId() { return fromDepartmentId; }
    public void setFromDepartmentId(String fromDepartmentId) { this.fromDepartmentId = fromDepartmentId; }

    public String getToDepartmentId() { return toDepartmentId; }
    public void setToDepartmentId(String toDepartmentId) { this.toDepartmentId = toDepartmentId; }

    public UUID getFromAssigneeId() { return fromAssigneeId; }
    public void setFromAssigneeId(UUID fromAssigneeId) { this.fromAssigneeId = fromAssigneeId; }

    public UUID getToAssigneeId() { return toAssigneeId; }
    public void setToAssigneeId(UUID toAssigneeId) { this.toAssigneeId = toAssigneeId; }

    public UUID getFromAssignerId() { return fromAssignerId; }
    public void setFromAssignerId(UUID fromAssignerId) { this.fromAssignerId = fromAssignerId; }

    public UUID getToAssignerId() { return toAssignerId; }
    public void setToAssignerId(UUID toAssignerId) { this.toAssignerId = toAssignerId; }

    public String getFromStatus() { return fromStatus; }
    public void setFromStatus(String fromStatus) { this.fromStatus = fromStatus; }

    public String getToStatus() { return toStatus; }
    public void setToStatus(String toStatus) { this.toStatus = toStatus; }

    public UUID getOperatedBy() { return operatedBy; }
    public void setOperatedBy(UUID operatedBy) { this.operatedBy = operatedBy; }

    public ZonedDateTime getOperatedAt() { return operatedAt; }
    public void setOperatedAt(ZonedDateTime operatedAt) { this.operatedAt = operatedAt; }
}
