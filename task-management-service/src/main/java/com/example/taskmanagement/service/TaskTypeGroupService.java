package com.example.taskmanagement.service;

import com.example.taskmanagement.dto.TaskTypeGroupRequest;
import com.example.taskmanagement.dto.TaskTypeGroupResponse;

import java.util.List;
import java.util.UUID;

public interface TaskTypeGroupService {
    List<TaskTypeGroupResponse> listAll();
    List<TaskTypeGroupResponse> listEnabled();
    TaskTypeGroupResponse getById(UUID id);
    TaskTypeGroupResponse create(TaskTypeGroupRequest request);
    TaskTypeGroupResponse update(UUID id, TaskTypeGroupRequest request);
    void setEnabled(UUID id, boolean enabled);
}
