package com.example.taskmanagement.model;

import jakarta.persistence.*;
import java.time.ZonedDateTime;
import java.util.UUID;

@Entity
@Table(name = "tasks")
public class Task {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String type = "DATA_PROCESSING";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TaskCategory category = TaskCategory.OPERATION_TASK;

    @Enumerated(EnumType.STRING)
    @Column
    private TaskStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "composition_mode")
    private CompositionMode compositionMode;

    private Integer priority;

    @Column(name = "assignee_id")
    private UUID assigneeId;

    @Column(name = "previous_assignee_id")
    private UUID previousAssigneeId;

    @Column(name = "assigner_id")
    private UUID assignerId;

    @Column(name = "controller_id")
    private UUID controllerId;

    @Column(name = "project_id")
    private UUID projectId;

    @Column(name = "self_check_for_task_id", unique = true)
    private UUID selfCheckForTaskId;

    private Integer progress = 0;

    @Column(name = "input_params", columnDefinition = "TEXT")
    private String inputParams;

    @Column(name = "output_results", columnDefinition = "TEXT")
    private String outputResults;

    @Column(name = "parent_task_id")
    private UUID parentTaskId;

    @Column(name = "department_id")
    private String departmentId;

    @Column(name = "created_by_name")
    private String createdByName;

    @Column(name = "created_by_id")
    private UUID createdById;

    @Column(name = "created_department_id")
    private String createdDepartmentId;

    @Column(name = "created_department_name")
    private String createdDepartmentName;

    @Column(name = "external_system")
    private String externalSystem;

    @Column(name = "external_task_id")
    private String externalTaskId;

    @Column(name = "external_url")
    private String externalUrl;

    @Column(name = "created_at")
    private ZonedDateTime createdAt;

    @Column(name = "started_at")
    private ZonedDateTime startedAt;

    @Column(name = "received_at")
    private ZonedDateTime receivedAt;

    @Column(name = "undo_requested_at")
    private ZonedDateTime undoRequestedAt;

    @Column(name = "due_at")
    private ZonedDateTime dueAt;

    @Column(name = "planned_due_at")
    private ZonedDateTime plannedDueAt;

    @Column(name = "completed_at")
    private ZonedDateTime completedAt;

    @Column(name = "workload")
    private Double workload;

    @Column(name = "workload_unit", length = 32)
    private String workloadUnit;

    @Column(name = "weight")
    private Double weight = 1.0;

    @Enumerated(EnumType.STRING)
    @Column(name = "workflow_status", length = 32)
    private WorkflowStatus workflowStatus;

    @Column(columnDefinition = "TEXT")
    private String remarks;

    @Column(name = "attachment_count", nullable = false)
    private Integer attachmentCount = 0;

    @Column(name = "status_workloads", columnDefinition = "TEXT")
    private String statusWorkloads;

    @Column(name = "in_progress_weight")
    private Double inProgressWeight = 0.95;

    @Column(name = "in_progress_completed_workload")
    private Double inProgressCompletedWorkload = 0.0;

    @Column(name = "qa_department_id", length = 64)
    private String qaDepartmentId;

    @Column(name = "qa_assignee_id")
    private UUID qaAssigneeId;

    @Version
    private Integer version;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = ZonedDateTime.now();
        }
        if (status == null) {
            status = TaskStatus.PENDING;
        }
        if (progress == null) {
            progress = 0;
        }
    }

    public Task() {}

    public Task(String name, String type, Integer priority, UUID assigneeId, ZonedDateTime dueAt) {
        this.name = name;
        this.type = type;
        this.priority = priority;
        this.assigneeId = assigneeId;
        this.dueAt = dueAt;
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public TaskStatus getStatus() {
        return status;
    }

    public void setStatus(TaskStatus status) {
        this.status = status;
    }

    public Integer getPriority() {
        return priority;
    }

    public void setPriority(Integer priority) {
        this.priority = priority;
    }

    public CompositionMode getCompositionMode() {
        return compositionMode;
    }

    public void setCompositionMode(CompositionMode compositionMode) {
        this.compositionMode = compositionMode;
    }

    public UUID getAssignerId() { return assignerId; }
    public void setAssignerId(UUID assignerId) { this.assignerId = assignerId; }

    public UUID getControllerId() { return controllerId; }
    public void setControllerId(UUID controllerId) { this.controllerId = controllerId; }

    public UUID getAssigneeId() {
        return assigneeId;
    }

    public void setAssigneeId(UUID assigneeId) {
        this.assigneeId = assigneeId;
    }

    public UUID getPreviousAssigneeId() { return previousAssigneeId; }
    public void setPreviousAssigneeId(UUID previousAssigneeId) { this.previousAssigneeId = previousAssigneeId; }

    public TaskCategory getCategory() {
        return category;
    }

    public void setCategory(TaskCategory category) {
        this.category = category;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public void setProjectId(UUID projectId) {
        this.projectId = projectId;
    }

    public UUID getSelfCheckForTaskId() {
        return selfCheckForTaskId;
    }

    public void setSelfCheckForTaskId(UUID selfCheckForTaskId) {
        this.selfCheckForTaskId = selfCheckForTaskId;
    }

    public Integer getProgress() {
        return progress;
    }

    public void setProgress(Integer progress) {
        this.progress = progress;
    }

    public String getInputParams() {
        return inputParams;
    }

    public void setInputParams(String inputParams) {
        this.inputParams = inputParams;
    }

    public String getOutputResults() {
        return outputResults;
    }

    public void setOutputResults(String outputResults) {
        this.outputResults = outputResults;
    }

    public UUID getParentTaskId() {
        return parentTaskId;
    }

    public void setParentTaskId(UUID parentTaskId) {
        this.parentTaskId = parentTaskId;
    }

    public String getDepartmentId() {
        return departmentId;
    }

    public void setDepartmentId(String departmentId) {
        this.departmentId = departmentId;
    }

    public String getCreatedByName() {
        return createdByName;
    }

    public void setCreatedByName(String createdByName) {
        this.createdByName = createdByName;
    }

    public UUID getCreatedById() {
        return createdById;
    }

    public void setCreatedById(UUID createdById) {
        this.createdById = createdById;
    }

    public String getCreatedDepartmentId() {
        return createdDepartmentId;
    }

    public void setCreatedDepartmentId(String createdDepartmentId) {
        this.createdDepartmentId = createdDepartmentId;
    }

    public String getCreatedDepartmentName() {
        return createdDepartmentName;
    }

    public void setCreatedDepartmentName(String createdDepartmentName) {
        this.createdDepartmentName = createdDepartmentName;
    }

    public String getExternalSystem() {
        return externalSystem;
    }

    public void setExternalSystem(String externalSystem) {
        this.externalSystem = externalSystem;
    }

    public String getExternalTaskId() {
        return externalTaskId;
    }

    public void setExternalTaskId(String externalTaskId) {
        this.externalTaskId = externalTaskId;
    }

    public String getExternalUrl() {
        return externalUrl;
    }

    public void setExternalUrl(String externalUrl) {
        this.externalUrl = externalUrl;
    }

    public ZonedDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(ZonedDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public ZonedDateTime getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(ZonedDateTime startedAt) {
        this.startedAt = startedAt;
    }

    public ZonedDateTime getReceivedAt() {
        return receivedAt;
    }

    public void setReceivedAt(ZonedDateTime receivedAt) {
        this.receivedAt = receivedAt;
    }

    public ZonedDateTime getUndoRequestedAt() {
        return undoRequestedAt;
    }

    public void setUndoRequestedAt(ZonedDateTime undoRequestedAt) {
        this.undoRequestedAt = undoRequestedAt;
    }

    public ZonedDateTime getDueAt() {
        return dueAt;
    }

    public void setDueAt(ZonedDateTime dueAt) {
        this.dueAt = dueAt;
    }

    public ZonedDateTime getPlannedDueAt() {
        return plannedDueAt;
    }

    public void setPlannedDueAt(ZonedDateTime plannedDueAt) {
        this.plannedDueAt = plannedDueAt;
    }

    public ZonedDateTime getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(ZonedDateTime completedAt) {
        this.completedAt = completedAt;
    }

    public Double getWorkload() {
        return workload;
    }

    public void setWorkload(Double workload) {
        this.workload = workload;
    }

    public String getWorkloadUnit() {
        return workloadUnit;
    }

    public void setWorkloadUnit(String workloadUnit) {
        this.workloadUnit = workloadUnit;
    }

    public Double getWeight() {
        return weight;
    }

    public void setWeight(Double weight) {
        this.weight = weight;
    }

    public WorkflowStatus getWorkflowStatus() { return workflowStatus; }
    public void setWorkflowStatus(WorkflowStatus workflowStatus) { this.workflowStatus = workflowStatus; }

    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }

    public Integer getAttachmentCount() { return attachmentCount; }
    public void setAttachmentCount(Integer attachmentCount) { this.attachmentCount = attachmentCount != null ? attachmentCount : 0; }

    public String getStatusWorkloads() { return statusWorkloads; }
    public void setStatusWorkloads(String statusWorkloads) { this.statusWorkloads = statusWorkloads; }

    public Double getInProgressWeight() { return inProgressWeight; }
    public void setInProgressWeight(Double inProgressWeight) { this.inProgressWeight = inProgressWeight; }

    public Double getInProgressCompletedWorkload() { return inProgressCompletedWorkload; }
    public void setInProgressCompletedWorkload(Double inProgressCompletedWorkload) { this.inProgressCompletedWorkload = inProgressCompletedWorkload; }

    public String getQaDepartmentId() { return qaDepartmentId; }
    public void setQaDepartmentId(String qaDepartmentId) { this.qaDepartmentId = qaDepartmentId; }

    public UUID getQaAssigneeId() { return qaAssigneeId; }
    public void setQaAssigneeId(UUID qaAssigneeId) { this.qaAssigneeId = qaAssigneeId; }

    public Integer getVersion() {
        return version;
    }

    public void setVersion(Integer version) {
        this.version = version;
    }
}
