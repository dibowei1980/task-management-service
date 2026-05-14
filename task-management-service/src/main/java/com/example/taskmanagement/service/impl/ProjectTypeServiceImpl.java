package com.example.taskmanagement.service.impl;

import com.example.taskmanagement.dto.ProjectTypeRequest;
import com.example.taskmanagement.dto.ProjectTypeResponse;
import com.example.taskmanagement.model.ProjectTypeDefinition;
import com.example.taskmanagement.repository.ProjectTypeDefinitionRepository;
import com.example.taskmanagement.repository.TaskRepository;
import com.example.taskmanagement.service.ProjectTypeService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class ProjectTypeServiceImpl implements ProjectTypeService {
    private final ProjectTypeDefinitionRepository repository;
    private final TaskRepository taskRepository;

    public ProjectTypeServiceImpl(ProjectTypeDefinitionRepository repository, TaskRepository taskRepository) {
        this.repository = repository;
        this.taskRepository = taskRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ProjectTypeResponse> listAll() {
        return repository.findAllByOrderByEnabledDescNameAsc().stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional
    public ProjectTypeResponse create(ProjectTypeRequest request) {
        validateRequest(request);
        String code = request.getCode().trim();
        String name = request.getName().trim();
        repository.findByCodeIgnoreCase(code).ifPresent(item -> { throw new IllegalArgumentException("项目类型编码已存在"); });
        repository.findByNameIgnoreCase(name).ifPresent(item -> { throw new IllegalArgumentException("项目类型名称已存在"); });
        ProjectTypeDefinition entity = new ProjectTypeDefinition();
        apply(entity, request);
        return toResponse(repository.save(entity));
    }

    @Override
    @Transactional
    public ProjectTypeResponse update(UUID id, ProjectTypeRequest request) {
        validateRequest(request);
        ProjectTypeDefinition entity = repository.findById(id).orElseThrow(() -> new IllegalArgumentException("项目类型不存在"));
        String code = request.getCode().trim();
        String name = request.getName().trim();
        repository.findByCodeIgnoreCase(code).filter(item -> !item.getId().equals(id)).ifPresent(item -> { throw new IllegalArgumentException("项目类型编码已存在"); });
        repository.findByNameIgnoreCase(name).filter(item -> !item.getId().equals(id)).ifPresent(item -> { throw new IllegalArgumentException("项目类型名称已存在"); });
        apply(entity, request);
        return toResponse(repository.save(entity));
    }

    @Override
    @Transactional
    public ProjectTypeResponse setEnabled(UUID id, boolean enabled) {
        ProjectTypeDefinition entity = repository.findById(id).orElseThrow(() -> new IllegalArgumentException("项目类型不存在"));
        entity.setEnabled(enabled);
        return toResponse(repository.save(entity));
    }

    @Override
    @Transactional
    public void delete(UUID id) {
        ProjectTypeDefinition entity = repository.findById(id).orElseThrow(() -> new IllegalArgumentException("项目类型不存在"));
        if (entity.getReferenceCount() != null && entity.getReferenceCount() > 0) {
            throw new IllegalArgumentException("项目类型已被引用，不能删除");
        }
        repository.delete(entity);
    }

    @Override
    @Transactional(readOnly = true)
    public void validateTypeCodeUsable(String typeCode) {
        if (typeCode == null || typeCode.isBlank()) {
            throw new IllegalArgumentException("项目类型编码不能为空");
        }
        ProjectTypeDefinition entity = repository.findByCodeIgnoreCase(typeCode).orElseThrow(() -> new IllegalArgumentException("项目类型不存在: " + typeCode));
        if (!entity.isEnabled()) {
            throw new IllegalArgumentException("项目类型已停用: " + typeCode);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public ProjectTypeResponse getByCode(String typeCode) {
        return repository.findByCodeIgnoreCase(typeCode).map(this::toResponse).orElseThrow(() -> new IllegalArgumentException("项目类型不存在: " + typeCode));
    }

    private void validateRequest(ProjectTypeRequest request) {
        if (request == null || request.getCode() == null || request.getCode().isBlank()) {
            throw new IllegalArgumentException("项目类型编码不能为空");
        }
        if (request.getName() == null || request.getName().isBlank()) {
            throw new IllegalArgumentException("项目类型名称不能为空");
        }
    }

    private void apply(ProjectTypeDefinition entity, ProjectTypeRequest request) {
        entity.setCode(request.getCode().trim());
        entity.setName(request.getName().trim());
        entity.setDescription(request.getDescription());
        entity.setSource(request.getSource() == null || request.getSource().isBlank() ? "CUSTOM" : request.getSource().trim());
        entity.setEnabled(request.getEnabled() == null || request.getEnabled());
    }

    private ProjectTypeResponse toResponse(ProjectTypeDefinition entity) {
        ProjectTypeResponse response = new ProjectTypeResponse();
        response.setId(entity.getId());
        response.setCode(entity.getCode());
        response.setName(entity.getName());
        response.setDescription(entity.getDescription());
        response.setSource(entity.getSource());
        response.setEnabled(entity.isEnabled());
        response.setReferenceCount(entity.getReferenceCount());
        response.setCreatedAt(entity.getCreatedAt());
        response.setUpdatedAt(entity.getUpdatedAt());
        return response;
    }
}
