package com.example.taskmanagement.service;

import com.example.taskmanagement.dto.TaskTypeRegistrationRequest;
import com.example.taskmanagement.dto.TaskTypeRegistrationResponse;
import com.example.taskmanagement.dto.TaskTypeRequest;
import com.example.taskmanagement.exception.NotFoundException;
import com.example.taskmanagement.model.ExternalSystemRegistration;
import com.example.taskmanagement.model.TaskTypeGroup;
import com.example.taskmanagement.model.TaskTypeRegistration;
import com.example.taskmanagement.repository.ExternalSystemRegistrationRepository;
import com.example.taskmanagement.repository.TaskTypeGroupRepository;
import com.example.taskmanagement.repository.TaskTypeRegistrationRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZonedDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class TaskTypeRegistrationService {

    private static final Logger logger = LoggerFactory.getLogger(TaskTypeRegistrationService.class);
    private final TaskTypeRegistrationRepository repository;
    private final TaskTypeGroupRepository groupRepository;
    private final ExternalSystemRegistrationRepository externalSystemRegistrationRepository;
    private final TaskTypeService taskTypeService;
    private final ObjectMapper objectMapper;

    public TaskTypeRegistrationService(TaskTypeRegistrationRepository repository,
                                       TaskTypeGroupRepository groupRepository,
                                       ExternalSystemRegistrationRepository externalSystemRegistrationRepository,
                                       TaskTypeService taskTypeService,
                                       ObjectMapper objectMapper) {
        this.repository = repository;
        this.groupRepository = groupRepository;
        this.externalSystemRegistrationRepository = externalSystemRegistrationRepository;
        this.taskTypeService = taskTypeService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public TaskTypeRegistrationResponse submit(TaskTypeRegistrationRequest request) {
        if (request.getCode() == null || request.getCode().isBlank()) {
            throw new IllegalArgumentException("任务类型编码不能为空");
        }
        if (request.getName() == null || request.getName().isBlank()) {
            throw new IllegalArgumentException("任务类型名称不能为空");
        }
        if (request.getSourceSystem() == null || request.getSourceSystem().isBlank()) {
            throw new IllegalArgumentException("来源系统不能为空");
        }
        if (request.getSystemId() == null || request.getSystemId().isBlank()) {
            throw new IllegalArgumentException("系统标识不能为空");
        }

        String code = request.getCode().trim().toUpperCase();

        if (repository.existsByCode(code)) {
            TaskTypeRegistration existing = repository.findByCode(code).orElseThrow();
            throw new IllegalArgumentException("任务类型编码已存在" + (existing.getStatus().equals("PENDING") ? "（待审批）" : "（" + existing.getStatus() + "）") + ": " + code);
        }

        try {
            taskTypeService.getByCode(code);
            throw new IllegalArgumentException("任务类型编码已被系统内置类型占用: " + code);
        } catch (IllegalArgumentException ignored) {
        }

        TaskTypeRegistration entity = new TaskTypeRegistration();
        entity.setCode(code);
        entity.setName(request.getName().trim());
        entity.setGroupId(request.getGroupId());
        entity.setDescription(request.getDescription());
        entity.setSourceSystem(request.getSourceSystem().trim());
        entity.setSystemId(request.getSystemId().trim());
        entity.setDisplayName(request.getDisplayName());
        entity.setServiceUrl(request.getServiceUrl());
        entity.setDashboardUrl(request.getDashboardUrl());
        entity.setCallbackPath(request.getCallbackPath());
        entity.setSsoClientId(request.getSsoClientId());
        entity.setResultViewUrl(request.getResultViewUrl());
        entity.setResultQueryPath(request.getResultQueryPath());
        entity.setStatus("PENDING");

        if (request.getInterfaceManifest() != null && !request.getInterfaceManifest().isEmpty()) {
            try {
                entity.setInterfaceManifest(objectMapper.writeValueAsString(request.getInterfaceManifest()));
            } catch (JsonProcessingException e) {
                throw new IllegalArgumentException("接口清单序列化失败: " + e.getMessage());
            }
        }

        if (request.getCallbackFields() != null && !request.getCallbackFields().isEmpty()) {
            try {
                entity.setCallbackFields(objectMapper.writeValueAsString(request.getCallbackFields()));
            } catch (JsonProcessingException e) {
                throw new IllegalArgumentException("回传字段序列化失败: " + e.getMessage());
            }
        }

        TaskTypeRegistration saved = repository.save(entity);
        logger.info("Task type registration submitted: code={}, system={}", code, request.getSystemId());
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<TaskTypeRegistrationResponse> listAll() {
        return repository.findAllByOrderByCreatedAtDesc().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<TaskTypeRegistrationResponse> listByStatus(String status) {
        return repository.findByStatusOrderByCreatedAtDesc(status).stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public TaskTypeRegistrationResponse getById(UUID id) {
        return toResponse(repository.findById(id)
                .orElseThrow(() -> new NotFoundException("注册申请不存在")));
    }

    @Transactional
    @CacheEvict(value = "taskTypes", allEntries = true)
    public TaskTypeRegistrationResponse approve(UUID id, UUID targetGroupId, String reviewedBy) {
        TaskTypeRegistration entity = repository.findById(id)
                .orElseThrow(() -> new NotFoundException("注册申请不存在"));

        if (!"PENDING".equals(entity.getStatus())) {
            throw new IllegalArgumentException("该申请已被处理，当前状态: " + entity.getStatus());
        }

        UUID groupId = targetGroupId != null ? targetGroupId : entity.getGroupId();
        if (groupId == null) {
            throw new IllegalArgumentException("请选择目标任务类型分组");
        }
        TaskTypeGroup group = groupRepository.findById(groupId)
                .orElseThrow(() -> new IllegalArgumentException("目标任务类型分组不存在"));

        TaskTypeRequest typeRequest = new TaskTypeRequest();
        typeRequest.setCode(entity.getCode());
        typeRequest.setName(entity.getName());
        typeRequest.setGroupId(groupId);
        typeRequest.setDescription(entity.getDescription());
        typeRequest.setEnabled(true);
        typeRequest.setSource("EXTERNAL");
        try {
            taskTypeService.create(typeRequest);
        } catch (IllegalArgumentException e) {
            if (e.getMessage() != null && e.getMessage().contains("已存在")) {
                logger.info("Task type already exists, skipping creation: code={}", entity.getCode());
            } else {
                throw e;
            }
        }

        entity.setStatus("APPROVED");
        entity.setReviewedBy(reviewedBy);
        entity.setReviewedAt(ZonedDateTime.now());
        entity.setApprovedGroupId(groupId);

        syncCallbackFieldsToExternalSystem(entity);

        TaskTypeRegistration saved = repository.save(entity);
        logger.info("Task type registration approved: code={}, group={}, reviewer={}", entity.getCode(), group.getName(), reviewedBy);
        return toResponse(saved);
    }

    @Transactional
    public TaskTypeRegistrationResponse reject(UUID id, String rejectReason, String reviewedBy) {
        TaskTypeRegistration entity = repository.findById(id)
                .orElseThrow(() -> new NotFoundException("注册申请不存在"));

        if (!"PENDING".equals(entity.getStatus())) {
            throw new IllegalArgumentException("该申请已被处理，当前状态: " + entity.getStatus());
        }

        if (rejectReason == null || rejectReason.isBlank()) {
            throw new IllegalArgumentException("请填写拒绝原因");
        }

        entity.setStatus("REJECTED");
        entity.setReviewedBy(reviewedBy);
        entity.setReviewedAt(ZonedDateTime.now());
        entity.setRejectReason(rejectReason.trim());

        TaskTypeRegistration saved = repository.save(entity);
        logger.info("Task type registration rejected: code={}, reason={}, reviewer={}", entity.getCode(), rejectReason, reviewedBy);
        return toResponse(saved);
    }

    @Transactional
    public TaskTypeRegistrationResponse updateCallbackFields(UUID id, List<String> callbackFields) {
        TaskTypeRegistration entity = repository.findById(id)
                .orElseThrow(() -> new NotFoundException("注册申请不存在"));

        if (callbackFields != null && !callbackFields.isEmpty()) {
            try {
                entity.setCallbackFields(objectMapper.writeValueAsString(callbackFields));
            } catch (JsonProcessingException e) {
                throw new IllegalArgumentException("回传字段序列化失败: " + e.getMessage());
            }
        } else {
            entity.setCallbackFields(null);
        }

        syncCallbackFieldsToExternalSystem(entity);

        TaskTypeRegistration saved = repository.save(entity);
        logger.info("Task type registration callback fields updated: id={}", id);
        return toResponse(saved);
    }

    @Transactional
    public void delete(UUID id) {
        TaskTypeRegistration entity = repository.findById(id)
                .orElseThrow(() -> new NotFoundException("注册申请不存在"));

        if (!"REJECTED".equals(entity.getStatus())) {
            throw new IllegalArgumentException("仅允许删除已拒绝的注册申请，当前状态: " + entity.getStatus());
        }

        repository.delete(entity);
        logger.info("Task type registration deleted: code={}, id={}", entity.getCode(), id);
    }

    private void syncCallbackFieldsToExternalSystem(TaskTypeRegistration entity) {
        if (entity.getSystemId() == null) return;
        externalSystemRegistrationRepository.findById(entity.getSystemId()).ifPresent(sys -> {
            sys.setCallbackFields(entity.getCallbackFields());
            sys.setResultQueryPath(entity.getResultQueryPath());
            externalSystemRegistrationRepository.save(sys);
        });
    }

    private TaskTypeRegistrationResponse toResponse(TaskTypeRegistration entity) {
        TaskTypeRegistrationResponse r = new TaskTypeRegistrationResponse();
        r.setId(entity.getId());
        r.setCode(entity.getCode());
        r.setName(entity.getName());
        r.setGroupId(entity.getGroupId());
        r.setDescription(entity.getDescription());
        r.setSourceSystem(entity.getSourceSystem());
        r.setSystemId(entity.getSystemId());
        r.setDisplayName(entity.getDisplayName());
        r.setServiceUrl(entity.getServiceUrl());
        r.setDashboardUrl(entity.getDashboardUrl());
        r.setCallbackPath(entity.getCallbackPath());
        r.setSsoClientId(entity.getSsoClientId());
        r.setInterfaceManifest(entity.getInterfaceManifest());
        r.setResultViewUrl(entity.getResultViewUrl());
        r.setResultQueryPath(entity.getResultQueryPath());
        if (entity.getCallbackFields() != null && !entity.getCallbackFields().isBlank()) {
            try {
                r.setCallbackFields(objectMapper.readValue(entity.getCallbackFields(), objectMapper.getTypeFactory().constructCollectionType(List.class, String.class)));
            } catch (JsonProcessingException ignored) {
            }
        }
        r.setStatus(entity.getStatus());
        r.setReviewedBy(entity.getReviewedBy());
        r.setReviewedAt(entity.getReviewedAt());
        r.setRejectReason(entity.getRejectReason());
        r.setApprovedGroupId(entity.getApprovedGroupId());
        r.setCreatedAt(entity.getCreatedAt());
        r.setUpdatedAt(entity.getUpdatedAt());

        if (entity.getGroupId() != null) {
            groupRepository.findById(entity.getGroupId()).ifPresent(g -> r.setGroupName(g.getName()));
        }
        if (entity.getApprovedGroupId() != null) {
            groupRepository.findById(entity.getApprovedGroupId()).ifPresent(g -> r.setGroupName(g.getName()));
        }

        return r;
    }
}