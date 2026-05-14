package com.example.taskmanagement.dto;

import java.time.ZonedDateTime;
import java.util.UUID;

public class HandoffRecordResponse {

    private UUID id;
    private UUID taskId;
    private String action;
    private UUID fromControllerId;
    private UUID toControllerId;
    private String fromDepartmentId;
    private String toDepartmentId;
    private UUID fromAssigneeId;
    private UUID toAssigneeId;
    private UUID fromAssignerId;
    private UUID toAssignerId;
    private UUID operatedBy;
    private ZonedDateTime operatedAt;

    private String fromStatus;
    private String toStatus;

    private String fromControllerName;
    private String toControllerName;
    private String fromDepartmentName;
    private String toDepartmentName;
    private String fromAssigneeName;
    private String toAssigneeName;
    private String fromAssignerName;
    private String toAssignerName;
    private String operatedByName;

    public HandoffRecordResponse() {}

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

    public UUID getOperatedBy() { return operatedBy; }
    public void setOperatedBy(UUID operatedBy) { this.operatedBy = operatedBy; }

    public ZonedDateTime getOperatedAt() { return operatedAt; }
    public void setOperatedAt(ZonedDateTime operatedAt) { this.operatedAt = operatedAt; }

    public String getFromStatus() { return fromStatus; }
    public void setFromStatus(String fromStatus) { this.fromStatus = fromStatus; }

    public String getToStatus() { return toStatus; }
    public void setToStatus(String toStatus) { this.toStatus = toStatus; }

    public String getFromControllerName() { return fromControllerName; }
    public void setFromControllerName(String fromControllerName) { this.fromControllerName = fromControllerName; }

    public String getToControllerName() { return toControllerName; }
    public void setToControllerName(String toControllerName) { this.toControllerName = toControllerName; }

    public String getFromDepartmentName() { return fromDepartmentName; }
    public void setFromDepartmentName(String fromDepartmentName) { this.fromDepartmentName = fromDepartmentName; }

    public String getToDepartmentName() { return toDepartmentName; }
    public void setToDepartmentName(String toDepartmentName) { this.toDepartmentName = toDepartmentName; }

    public String getFromAssigneeName() { return fromAssigneeName; }
    public void setFromAssigneeName(String fromAssigneeName) { this.fromAssigneeName = fromAssigneeName; }

    public String getToAssigneeName() { return toAssigneeName; }
    public void setToAssigneeName(String toAssigneeName) { this.toAssigneeName = toAssigneeName; }

    public String getFromAssignerName() { return fromAssignerName; }
    public void setFromAssignerName(String fromAssignerName) { this.fromAssignerName = fromAssignerName; }

    public String getToAssignerName() { return toAssignerName; }
    public void setToAssignerName(String toAssignerName) { this.toAssignerName = toAssignerName; }

    public String getOperatedByName() { return operatedByName; }
    public void setOperatedByName(String operatedByName) { this.operatedByName = operatedByName; }
}
