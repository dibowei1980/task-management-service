package com.example.taskmanagement.service;

import com.example.taskmanagement.dto.TaskTypeRequest;
import com.example.taskmanagement.dto.TaskTypeResponse;

import java.util.List;
import java.util.UUID;

public interface TaskTypeService {
    List<TaskTypeResponse> listAll();
    List<TaskTypeResponse> listByGroup(UUID groupId);
    TaskTypeResponse getById(UUID id);
    TaskTypeResponse getByCode(String code);
    TaskTypeResponse create(TaskTypeRequest request);
    TaskTypeResponse update(UUID id, TaskTypeRequest request);
    void setEnabled(UUID id, boolean enabled);
    void validateTypeCodeUsable(String code);
}
