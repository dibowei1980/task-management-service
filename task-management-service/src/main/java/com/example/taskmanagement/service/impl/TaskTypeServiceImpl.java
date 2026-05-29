package com.example.taskmanagement.service.impl;

import com.example.taskmanagement.dto.TaskTypeRequest;
import com.example.taskmanagement.dto.TaskTypeResponse;
import com.example.taskmanagement.model.TaskTypeDefinition;
import com.example.taskmanagement.model.TaskTypeGroup;
import com.example.taskmanagement.repository.TaskTypeDefinitionRepository;
import com.example.taskmanagement.repository.TaskTypeGroupRepository;
import com.example.taskmanagement.service.TaskTypeService;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class TaskTypeServiceImpl implements TaskTypeService {

    private final TaskTypeDefinitionRepository repository;
    private final TaskTypeGroupRepository groupRepository;

    public TaskTypeServiceImpl(TaskTypeDefinitionRepository repository, TaskTypeGroupRepository groupRepository) {
        this.repository = repository;
        this.groupRepository = groupRepository;
    }

    @Override
    @Cacheable(value = "taskTypes", key = "'all'")
    public List<TaskTypeResponse> listAll() {
        return repository.findAllByOrderByEnabledDescNameAsc().stream().map(this::toResponse).toList();
    }

    @Override
    @Cacheable(value = "taskTypes", key = "'group:' + #groupId")
    public List<TaskTypeResponse> listByGroup(UUID groupId) {
        return repository.findByGroupIdOrderByNameAsc(groupId).stream().map(this::toResponse).toList();
    }

    @Override
    @Cacheable(value = "taskTypes", key = "'id:' + #id")
    public TaskTypeResponse getById(UUID id) {
        return toResponse(repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("task type not found")));
    }

    @Override
    @Cacheable(value = "taskTypes", key = "'byCode:' + #code")
    public TaskTypeResponse getByCode(String code) {
        return toResponse(repository.findByCodeIgnoreCase(code)
                .orElseThrow(() -> new IllegalArgumentException("task type not found: " + code)));
    }

    @Override
    @Transactional
    @CacheEvict(value = "taskTypes", allEntries = true)
    public TaskTypeResponse create(TaskTypeRequest request) {
        validateUniqueness(request.getCode(), request.getName(), null);
        TaskTypeGroup group = groupRepository.findById(request.getGroupId())
                .orElseThrow(() -> new IllegalArgumentException("task type group not found"));

        TaskTypeDefinition entity = new TaskTypeDefinition();
        entity.setCode(request.getCode().trim().toUpperCase());
        entity.setName(request.getName().trim());
        entity.setGroup(group);
        entity.setDescription(request.getDescription());
        entity.setSource(request.getSource() == null || request.getSource().isBlank() ? "CUSTOM" : request.getSource().trim());
        entity.setEnabled(request.getEnabled() == null || request.getEnabled());
        return toResponse(repository.save(entity));
    }

    @Override
    @Transactional
    @CacheEvict(value = "taskTypes", allEntries = true)
    public TaskTypeResponse update(UUID id, TaskTypeRequest request) {
        TaskTypeDefinition entity = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("task type not found"));
        validateUniqueness(request.getCode(), request.getName(), id);

        entity.setCode(request.getCode().trim().toUpperCase());
        entity.setName(request.getName().trim());
        entity.setDescription(request.getDescription());
        if (request.getGroupId() != null) {
            TaskTypeGroup group = groupRepository.findById(request.getGroupId())
                    .orElseThrow(() -> new IllegalArgumentException("task type group not found"));
            entity.setGroup(group);
        }
        if (request.getEnabled() != null) {
            entity.setEnabled(request.getEnabled());
        }
        return toResponse(repository.save(entity));
    }

    @Override
    @Transactional
    @CacheEvict(value = "taskTypes", allEntries = true)
    public void setEnabled(UUID id, boolean enabled) {
        TaskTypeDefinition entity = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("task type not found"));
        entity.setEnabled(enabled);
        repository.save(entity);
    }

    @Override
    @Transactional
    @CacheEvict(value = "taskTypes", allEntries = true)
    public void delete(UUID id) {
        TaskTypeDefinition entity = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("task type not found"));
        if (entity.getReferenceCount() != null && entity.getReferenceCount() > 0) {
            throw new IllegalArgumentException("任务类型已被引用，不能删除");
        }
        repository.delete(entity);
    }

    @Override
    @Transactional
    @CacheEvict(value = "taskTypes", allEntries = true)
    public void deleteByCode(String code) {
        repository.findByCodeIgnoreCase(code.trim().toUpperCase()).ifPresent(entity -> {
            if (entity.getReferenceCount() != null && entity.getReferenceCount() > 0) {
                throw new IllegalArgumentException("任务类型已被引用，不能删除: " + code);
            }
            repository.delete(entity);
        });
    }

    @Override
    @Cacheable(value = "taskTypes", key = "'validate:' + #code")
    public void validateTypeCodeUsable(String code) {
        if (code == null || code.isBlank()) {
            throw new IllegalArgumentException("task type code is required");
        }
        TaskTypeDefinition def = repository.findByCodeIgnoreCase(code)
                .orElseThrow(() -> new IllegalArgumentException("task type not found: " + code));
        if (!def.isEnabled()) {
            throw new IllegalArgumentException("task type is disabled: " + code);
        }
    }

    private void validateUniqueness(String code, String name, UUID excludeId) {
        repository.findByCodeIgnoreCase(code.trim().toUpperCase()).ifPresent(existing -> {
            if (excludeId == null || !existing.getId().equals(excludeId)) {
                throw new IllegalArgumentException("任务类型编码已存在: " + code);
            }
        });
        repository.findByNameIgnoreCase(name.trim()).ifPresent(existing -> {
            if (excludeId == null || !existing.getId().equals(excludeId)) {
                throw new IllegalArgumentException("任务类型名称已存在: " + name);
            }
        });
    }

    private TaskTypeResponse toResponse(TaskTypeDefinition entity) {
        TaskTypeResponse r = new TaskTypeResponse();
        r.setId(entity.getId());
        r.setCode(entity.getCode());
        r.setName(entity.getName());
        r.setGroupId(entity.getGroup().getId());
        r.setGroupName(entity.getGroup().getName());
        r.setDescription(entity.getDescription());
        r.setSource(entity.getSource());
        r.setEnabled(entity.isEnabled());
        r.setReferenceCount(entity.getReferenceCount());
        r.setCreatedAt(entity.getCreatedAt());
        r.setUpdatedAt(entity.getUpdatedAt());
        return r;
    }
}
