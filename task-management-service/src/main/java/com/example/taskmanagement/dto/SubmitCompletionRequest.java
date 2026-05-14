package com.example.taskmanagement.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public class SubmitCompletionRequest {

    @NotNull(message = "完成工作量不能为空")
    @Positive(message = "完成工作量必须大于0")
    private Double completedWorkload;

    public Double getCompletedWorkload() { return completedWorkload; }
    public void setCompletedWorkload(Double completedWorkload) { this.completedWorkload = completedWorkload; }
}
