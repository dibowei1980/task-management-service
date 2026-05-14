package com.example.taskmanagement.dto;

import com.example.taskmanagement.model.TaskCategory;
import com.example.taskmanagement.model.TaskStatus;
import com.example.taskmanagement.model.WorkflowStatus;

import jakarta.validation.constraints.NotBlank;

import java.time.ZonedDateTime;
import java.util.List;
import java.util.UUID;

public class TaskUpdateRequest {
    private String name;
    private String type;
    private TaskCategory category;
    private TaskStatus status;
    private Integer priority;
    private ZonedDateTime plannedDueAt;
    private String inputParams;
    private String outputResults;
    @NotBlank(message = "负责部门不能为空")
    private String departmentId;

    private UUID projectLeaderId;
    private UUID assigneeId;
    private List<UUID> operatorIds;
    private List<UUID> inspectorIds;

    private Double workload;
    private String workloadUnit;
    private Double weight;
    private WorkflowStatus workflowStatus;
    private String remarks;
    private Integer progress;
    private Double inProgressWeight;
    private String qaDepartmentId;
    private UUID qaAssigneeId;
    private java.util.Map<String, Double> statusWorkloads;

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

    public ZonedDateTime getPlannedDueAt() {
        return plannedDueAt;
    }

    public void setPlannedDueAt(ZonedDateTime plannedDueAt) {
        this.plannedDueAt = plannedDueAt;
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

    public String getDepartmentId() {
        return departmentId;
    }

    public void setDepartmentId(String departmentId) {
        this.departmentId = departmentId;
    }

    public UUID getProjectLeaderId() {
        return projectLeaderId;
    }

    public void setProjectLeaderId(UUID projectLeaderId) {
        this.projectLeaderId = projectLeaderId;
    }

    public UUID getAssigneeId() {
        return assigneeId;
    }

    public void setAssigneeId(UUID assigneeId) {
        this.assigneeId = assigneeId;
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

    public Integer getProgress() { return progress; }
    public void setProgress(Integer progress) { this.progress = progress; }

    public Double getInProgressWeight() { return inProgressWeight; }
    public void setInProgressWeight(Double inProgressWeight) { this.inProgressWeight = inProgressWeight; }

    public String getQaDepartmentId() { return qaDepartmentId; }
    public void setQaDepartmentId(String qaDepartmentId) { this.qaDepartmentId = qaDepartmentId; }

    public UUID getQaAssigneeId() { return qaAssigneeId; }
    public void setQaAssigneeId(UUID qaAssigneeId) { this.qaAssigneeId = qaAssigneeId; }

    public java.util.Map<String, Double> getStatusWorkloads() { return statusWorkloads; }
    public void setStatusWorkloads(java.util.Map<String, Double> statusWorkloads) { this.statusWorkloads = statusWorkloads; }
}
