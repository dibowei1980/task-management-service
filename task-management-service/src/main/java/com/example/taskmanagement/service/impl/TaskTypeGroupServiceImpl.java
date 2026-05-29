package com.example.taskmanagement.service.impl;

import com.example.taskmanagement.dto.TaskTypeGroupRequest;
import com.example.taskmanagement.dto.TaskTypeGroupResponse;
import com.example.taskmanagement.model.TaskTypeGroup;
import com.example.taskmanagement.repository.TaskTypeDefinitionRepository;
import com.example.taskmanagement.repository.TaskTypeGroupRepository;
import com.example.taskmanagement.service.TaskTypeGroupService;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class TaskTypeGroupServiceImpl implements TaskTypeGroupService {

    private final TaskTypeGroupRepository repository;
    private final TaskTypeDefinitionRepository taskTypeDefinitionRepository;

    public TaskTypeGroupServiceImpl(TaskTypeGroupRepository repository, TaskTypeDefinitionRepository taskTypeDefinitionRepository) {
        this.repository = repository;
        this.taskTypeDefinitionRepository = taskTypeDefinitionRepository;
    }

    @Override
    @Cacheable(value = "taskTypeGroups", key = "'all'")
    public List<TaskTypeGroupResponse> listAll() {
        return repository.findAllByOrderBySortOrderAsc().stream().map(this::toResponse).toList();
    }

    @Override
    @Cacheable(value = "taskTypeGroups", key = "'enabled'")
    public List<TaskTypeGroupResponse> listEnabled() {
        return repository.findByEnabledTrueOrderBySortOrderAsc().stream().map(this::toResponse).toList();
    }

    @Override
    @Cacheable(value = "taskTypeGroups", key = "'id:' + #id")
    public TaskTypeGroupResponse getById(UUID id) {
        return toResponse(repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("task type group not found")));
    }

    @Override
    @Transactional
    @CacheEvict(value = "taskTypeGroups", allEntries = true)
    public TaskTypeGroupResponse create(TaskTypeGroupRequest request) {
        validateUniqueness(request.getCode(), request.getName(), null);
        TaskTypeGroup entity = new TaskTypeGroup();
        entity.setCode(request.getCode().trim().toUpperCase());
        entity.setName(request.getName().trim());
        entity.setSortOrder(request.getSortOrder() != null ? request.getSortOrder() : 0);
        entity.setEnabled(request.getEnabled() == null || request.getEnabled());
        return toResponse(repository.save(entity));
    }

    @Override
    @Transactional
    @CacheEvict(value = "taskTypeGroups", allEntries = true)
    public TaskTypeGroupResponse update(UUID id, TaskTypeGroupRequest request) {
        TaskTypeGroup entity = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("task type group not found"));
        validateUniqueness(request.getCode(), request.getName(), id);
        entity.setCode(request.getCode().trim().toUpperCase());
        entity.setName(request.getName().trim());
        if (request.getSortOrder() != null) {
            entity.setSortOrder(request.getSortOrder());
        }
        if (request.getEnabled() != null) {
            entity.setEnabled(request.getEnabled());
        }
        return toResponse(repository.save(entity));
    }

    @Override
    @Transactional
    @CacheEvict(value = "taskTypeGroups", allEntries = true)
    public void setEnabled(UUID id, boolean enabled) {
        TaskTypeGroup entity = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("task type group not found"));
        entity.setEnabled(enabled);
        repository.save(entity);
    }

    @Override
    @Transactional
    @CacheEvict(value = {"taskTypeGroups", "taskTypes"}, allEntries = true)
    public void delete(UUID id) {
        TaskTypeGroup entity = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("task type group not found"));
        long childCount = taskTypeDefinitionRepository.findByGroupIdOrderByNameAsc(id).size();
        if (childCount > 0) {
            throw new IllegalArgumentException("分组下还有 " + childCount + " 个任务类型，不能删除");
        }
        repository.delete(entity);
    }

    private void validateUniqueness(String code, String name, UUID excludeId) {
        repository.findByCodeIgnoreCase(code.trim().toUpperCase()).ifPresent(existing -> {
            if (excludeId == null || !existing.getId().equals(excludeId)) {
                throw new IllegalArgumentException("分组编码已存在: " + code);
            }
        });
        repository.findByNameIgnoreCase(name.trim()).ifPresent(existing -> {
            if (excludeId == null || !existing.getId().equals(excludeId)) {
                throw new IllegalArgumentException("分组名称已存在: " + name);
            }
        });
    }

    private TaskTypeGroupResponse toResponse(TaskTypeGroup entity) {
        TaskTypeGroupResponse r = new TaskTypeGroupResponse();
        r.setId(entity.getId());
        r.setCode(entity.getCode());
        r.setName(entity.getName());
        r.setSortOrder(entity.getSortOrder());
        r.setEnabled(entity.isEnabled());
        r.setCreatedAt(entity.getCreatedAt());
        r.setUpdatedAt(entity.getUpdatedAt());
        return r;
    }
}
