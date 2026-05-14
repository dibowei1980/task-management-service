package com.example.taskmanagement.service.impl;

import com.example.taskmanagement.dto.MeasurementUnitRequest;
import com.example.taskmanagement.dto.MeasurementUnitResponse;
import com.example.taskmanagement.model.MeasurementUnitDefinition;
import com.example.taskmanagement.repository.MeasurementUnitDefinitionRepository;
import com.example.taskmanagement.service.MeasurementUnitService;
import com.example.taskmanagement.service.UnitConversionService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class MeasurementUnitServiceImpl implements MeasurementUnitService {
    private final MeasurementUnitDefinitionRepository repository;
    private final UnitConversionService unitConversionService;

    public MeasurementUnitServiceImpl(MeasurementUnitDefinitionRepository repository, UnitConversionService unitConversionService) {
        this.repository = repository;
        this.unitConversionService = unitConversionService;
    }

    @Override
    @Transactional(readOnly = true)
    public List<MeasurementUnitResponse> listAll() {
        return repository.findAllByOrderByEnabledDescNameAsc().stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional
    public MeasurementUnitResponse create(MeasurementUnitRequest request) {
        validateRequest(request);
        String code = request.getCode().trim();
        String name = request.getName().trim();
        repository.findByCodeIgnoreCase(code).ifPresent(item -> { throw new IllegalArgumentException("计量单位编码已存在"); });
        repository.findByNameIgnoreCase(name).ifPresent(item -> { throw new IllegalArgumentException("计量单位名称已存在"); });
        MeasurementUnitDefinition entity = new MeasurementUnitDefinition();
        apply(entity, request);
        entity.setBuiltin(false);
        MeasurementUnitResponse response = toResponse(repository.save(entity));
        unitConversionService.evictAll();
        return response;
    }

    @Override
    @Transactional
    public MeasurementUnitResponse update(UUID id, MeasurementUnitRequest request) {
        validateRequest(request);
        MeasurementUnitDefinition entity = repository.findById(id).orElseThrow(() -> new IllegalArgumentException("计量单位不存在"));
        String code = request.getCode().trim();
        String name = request.getName().trim();
        repository.findByCodeIgnoreCase(code).filter(item -> !item.getId().equals(id)).ifPresent(item -> { throw new IllegalArgumentException("计量单位编码已存在"); });
        repository.findByNameIgnoreCase(name).filter(item -> !item.getId().equals(id)).ifPresent(item -> { throw new IllegalArgumentException("计量单位名称已存在"); });
        apply(entity, request);
        MeasurementUnitResponse response = toResponse(repository.save(entity));
        unitConversionService.evictAll();
        return response;
    }

    @Override
    @Transactional
    public MeasurementUnitResponse setEnabled(UUID id, boolean enabled) {
        MeasurementUnitDefinition entity = repository.findById(id).orElseThrow(() -> new IllegalArgumentException("计量单位不存在"));
        entity.setEnabled(enabled);
        MeasurementUnitResponse response = toResponse(repository.save(entity));
        unitConversionService.evictAll();
        return response;
    }

    private void validateRequest(MeasurementUnitRequest request) {
        if (request == null || request.getCode() == null || request.getCode().isBlank()) {
            throw new IllegalArgumentException("计量单位编码不能为空");
        }
        if (request.getName() == null || request.getName().isBlank()) {
            throw new IllegalArgumentException("计量单位名称不能为空");
        }
        if (request.getBaseUnitCode() != null && !request.getBaseUnitCode().isBlank() && request.getConversionFactor() != null && request.getConversionFactor() <= 0) {
            throw new IllegalArgumentException("换算系数必须大于0");
        }
    }

    private void apply(MeasurementUnitDefinition entity, MeasurementUnitRequest request) {
        entity.setCode(request.getCode().trim());
        entity.setName(request.getName().trim());
        entity.setEnabled(request.getEnabled() == null || request.getEnabled());
        String baseUnitCode = request.getBaseUnitCode();
        entity.setBaseUnitCode(baseUnitCode == null || baseUnitCode.isBlank() ? null : baseUnitCode.trim());
        entity.setConversionFactor(entity.getBaseUnitCode() == null ? null : request.getConversionFactor());
    }

    private MeasurementUnitResponse toResponse(MeasurementUnitDefinition entity) {
        MeasurementUnitResponse response = new MeasurementUnitResponse();
        response.setId(entity.getId());
        response.setCode(entity.getCode());
        response.setName(entity.getName());
        response.setBuiltin(entity.isBuiltin());
        response.setEnabled(entity.isEnabled());
        response.setBaseUnitCode(entity.getBaseUnitCode());
        response.setBaseUnitName(entity.getBaseUnitCode() == null ? null : repository.findByCodeIgnoreCase(entity.getBaseUnitCode()).map(MeasurementUnitDefinition::getName).orElse(entity.getBaseUnitCode()));
        response.setConversionFactor(entity.getConversionFactor());
        response.setBasic(entity.getBaseUnitCode() == null);
        response.setCreatedAt(entity.getCreatedAt());
        response.setUpdatedAt(entity.getUpdatedAt());
        return response;
    }
}
