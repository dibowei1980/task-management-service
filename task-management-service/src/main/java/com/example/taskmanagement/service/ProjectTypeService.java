package com.example.taskmanagement.service;

import com.example.taskmanagement.dto.ProjectTypeRequest;
import com.example.taskmanagement.dto.ProjectTypeResponse;

import java.util.List;
import java.util.UUID;

public interface ProjectTypeService {
    List<ProjectTypeResponse> listAll();

    ProjectTypeResponse create(ProjectTypeRequest request);

    ProjectTypeResponse update(UUID id, ProjectTypeRequest request);

    ProjectTypeResponse setEnabled(UUID id, boolean enabled);

    void delete(UUID id);

    void validateTypeCodeUsable(String typeCode);

    ProjectTypeResponse getByCode(String typeCode);
}
