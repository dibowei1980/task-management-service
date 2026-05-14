package com.example.taskmanagement.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.util.UUID;

public class SubTaskItem {

    @NotBlank(message = "子任务名称不能为空")
    private String name;

    @NotBlank(message = "任务类型不能为空")
    private String type;

    @NotNull(message = "工作量不能为空")
    @Positive(message = "工作量必须大于0")
    private Double workload;

    @NotBlank(message = "工作量单位不能为空")
    private String workloadUnit;

    private String departmentId;

    private UUID assigneeId;

    private String qaDepartmentId;

    private UUID qaAssigneeId;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public Double getWorkload() { return workload; }
    public void setWorkload(Double workload) { this.workload = workload; }

    public String getWorkloadUnit() { return workloadUnit; }
    public void setWorkloadUnit(String workloadUnit) { this.workloadUnit = workloadUnit; }

    public String getDepartmentId() { return departmentId; }
    public void setDepartmentId(String departmentId) { this.departmentId = departmentId; }

    public UUID getAssigneeId() { return assigneeId; }
    public void setAssigneeId(UUID assigneeId) { this.assigneeId = assigneeId; }

    public String getQaDepartmentId() { return qaDepartmentId; }
    public void setQaDepartmentId(String qaDepartmentId) { this.qaDepartmentId = qaDepartmentId; }

    public UUID getQaAssigneeId() { return qaAssigneeId; }
    public void setQaAssigneeId(UUID qaAssigneeId) { this.qaAssigneeId = qaAssigneeId; }
}
