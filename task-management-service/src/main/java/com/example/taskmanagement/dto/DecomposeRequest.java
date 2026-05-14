package com.example.taskmanagement.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.Valid;

import java.util.List;

public class DecomposeRequest {

    @NotEmpty(message = "子任务列表不能为空")
    @Valid
    private List<SubTaskItem> subTasks;

    private String category;

    public List<SubTaskItem> getSubTasks() { return subTasks; }
    public void setSubTasks(List<SubTaskItem> subTasks) { this.subTasks = subTasks; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
}
