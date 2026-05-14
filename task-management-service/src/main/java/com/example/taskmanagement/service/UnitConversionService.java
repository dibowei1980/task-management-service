package com.example.taskmanagement.service;

import com.example.taskmanagement.model.MeasurementUnitDefinition;
import com.example.taskmanagement.repository.MeasurementUnitDefinitionRepository;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

@Service
public class UnitConversionService {

    private final MeasurementUnitDefinitionRepository repository;

    public UnitConversionService(MeasurementUnitDefinitionRepository repository) {
        this.repository = repository;
    }

    @Cacheable(value = "unitConversions", key = "'factor:' + #workloadUnit")
    public double getConversionFactor(String workloadUnit) {
        if (workloadUnit == null || workloadUnit.isBlank()) return 1.0;
        MeasurementUnitDefinition unit = repository.findByCodeIgnoreCase(workloadUnit).orElse(null);
        if (unit == null) return 1.0;
        if (unit.getBaseUnitCode() == null) return 1.0;
        return unit.getConversionFactor() != null ? unit.getConversionFactor() : 1.0;
    }

    @Cacheable(value = "unitConversions", key = "'baseUnit:' + #workloadUnit")
    public String resolveBaseUnit(String workloadUnit) {
        if (workloadUnit == null || workloadUnit.isBlank()) return null;
        MeasurementUnitDefinition unit = repository.findByCodeIgnoreCase(workloadUnit).orElse(null);
        if (unit == null) return workloadUnit;
        return unit.getBaseUnitCode() != null ? unit.getBaseUnitCode() : unit.getCode();
    }

    @CacheEvict(value = "unitConversions", allEntries = true)
    public void evictAll() {
    }
}
