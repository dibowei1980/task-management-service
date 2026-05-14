package com.example.taskmanagement.dto;

import com.example.taskmanagement.model.TaskCategory;
import com.example.taskmanagement.model.CompositionMode;
import com.example.taskmanagement.model.TaskStatus;
import com.example.taskmanagement.model.WorkflowStatus;

import java.time.ZonedDateTime;
import java.util.List;
import java.util.UUID;

public class TaskResponse {
    private UUID id;
    private String name;
    private String type;
    private TaskCategory category;
    private TaskStatus status;
    private Integer priority;

    private UUID assigneeId;
    private UUID previousAssigneeId;
    private UUID assignerId;

    private UUID projectId;
    private UUID parentTaskId;
    private String departmentId;
    private String createdByName;
    private UUID createdById;
    private String createdDepartmentId;
    private String createdDepartmentName;
    private String externalSystem;
    private String externalTaskId;
    private String externalUrl;

    private UUID projectLeaderId;
    private List<UUID> operatorIds;
    private List<UUID> inspectorIds;

    private Integer progress;
    private String inputParams;
    private String outputResults;

    private ZonedDateTime plannedDueAt;
    private ZonedDateTime createdAt;
    private ZonedDateTime startedAt;
    private ZonedDateTime receivedAt;
    private ZonedDateTime undoRequestedAt;
    private ZonedDateTime completedAt;

    private Double workload;
    private String workloadUnit;
    private Double weight;
    private CompositionMode compositionMode;

    private Integer depthLevel;

    private WorkflowStatus workflowStatus;
    private String remarks;
    private Integer attachmentCount;
    private Integer assignAttachmentCount;
    private Integer submitQaAttachmentCount;
    private String statusWorkloads;
    private Double inProgressWeight;
    private Double inProgressCompletedWorkload;
    private String qaDepartmentId;
    private UUID qaAssigneeId;
    private Boolean hasChildren;
    private Integer directChildCount;
    private UUID controllerId;
    private Boolean canUpdate;
    private Boolean canRevokeAssignment;
    private Boolean canUndoReceive;
    private ProgressFormula progressFormula;

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

    public TaskCategory getCategory() {
        return category;
    }

    public void setCategory(TaskCategory category) {
        this.category = category;
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

    public UUID getAssigneeId() {
        return assigneeId;
    }

    public void setAssigneeId(UUID assigneeId) {
        this.assigneeId = assigneeId;
    }

    public UUID getPreviousAssigneeId() {
        return previousAssigneeId;
    }

    public void setPreviousAssigneeId(UUID previousAssigneeId) {
        this.previousAssigneeId = previousAssigneeId;
    }

    public UUID getAssignerId() {
        return assignerId;
    }

    public void setAssignerId(UUID assignerId) {
        this.assignerId = assignerId;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public void setProjectId(UUID projectId) {
        this.projectId = projectId;
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

    public UUID getProjectLeaderId() {
        return projectLeaderId;
    }

    public void setProjectLeaderId(UUID projectLeaderId) {
        this.projectLeaderId = projectLeaderId;
    }

    public List<UUID> getOperatorIds() {
        return operatorIds;
    }

    public void setOperatorIds(List<UUID> operatorIds) {
        this.operatorIds = operatorIds;
    }

    public List<UUID> getInspectorIds() {
        return inspectorIds;
    }

    public void setInspectorIds(List<UUID> inspectorIds) {
        this.inspectorIds = inspectorIds;
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

    public ZonedDateTime getPlannedDueAt() {
        return plannedDueAt;
    }

    public void setPlannedDueAt(ZonedDateTime plannedDueAt) {
        this.plannedDueAt = plannedDueAt;
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

    public CompositionMode getCompositionMode() {
        return compositionMode;
    }

    public void setCompositionMode(CompositionMode compositionMode) {
        this.compositionMode = compositionMode;
    }

    public Integer getDepthLevel() {
        return depthLevel;
    }

    public void setDepthLevel(Integer depthLevel) {
        this.depthLevel = depthLevel;
    }

    public WorkflowStatus getWorkflowStatus() { return workflowStatus; }
    public void setWorkflowStatus(WorkflowStatus workflowStatus) { this.workflowStatus = workflowStatus; }

    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }

    public Integer getAttachmentCount() { return attachmentCount; }
    public void setAttachmentCount(Integer attachmentCount) { this.attachmentCount = attachmentCount; }
    public Integer getAssignAttachmentCount() { return assignAttachmentCount; }
    public void setAssignAttachmentCount(Integer assignAttachmentCount) { this.assignAttachmentCount = assignAttachmentCount; }
    public Integer getSubmitQaAttachmentCount() { return submitQaAttachmentCount; }
    public void setSubmitQaAttachmentCount(Integer submitQaAttachmentCount) { this.submitQaAttachmentCount = submitQaAttachmentCount; }

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

    public Boolean getHasChildren() { return hasChildren; }
    public void setHasChildren(Boolean hasChildren) { this.hasChildren = hasChildren; }

    public Integer getDirectChildCount() { return directChildCount; }
    public void setDirectChildCount(Integer directChildCount) { this.directChildCount = directChildCount; }

    public UUID getControllerId() { return controllerId; }
    public void setControllerId(UUID controllerId) { this.controllerId = controllerId; }

    public Boolean getCanUpdate() { return canUpdate; }
    public void setCanUpdate(Boolean canUpdate) { this.canUpdate = canUpdate; }

    public Boolean getCanRevokeAssignment() { return canRevokeAssignment; }
    public void setCanRevokeAssignment(Boolean canRevokeAssignment) { this.canRevokeAssignment = canRevokeAssignment; }

    public Boolean getCanUndoReceive() { return canUndoReceive; }
    public void setCanUndoReceive(Boolean canUndoReceive) { this.canUndoReceive = canUndoReceive; }

    public ProgressFormula getProgressFormula() { return progressFormula; }
    public void setProgressFormula(ProgressFormula progressFormula) { this.progressFormula = progressFormula; }
}
