package com.example.taskmanagement.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.UUID;

public class AssignRequest {

    @NotBlank(message = "负责部门不能为空")
    private String departmentId;

    private UUID assigneeId;

    private String qaDepartmentId;

    private UUID qaAssigneeId;

    public String getDepartmentId() { return departmentId; }
    public void setDepartmentId(String departmentId) { this.departmentId = departmentId; }

    public UUID getAssigneeId() { return assigneeId; }
    public void setAssigneeId(UUID assigneeId) { this.assigneeId = assigneeId; }

    public String getQaDepartmentId() { return qaDepartmentId; }
    public void setQaDepartmentId(String qaDepartmentId) { this.qaDepartmentId = qaDepartmentId; }

    public UUID getQaAssigneeId() { return qaAssigneeId; }
    public void setQaAssigneeId(UUID qaAssigneeId) { this.qaAssigneeId = qaAssigneeId; }
}
