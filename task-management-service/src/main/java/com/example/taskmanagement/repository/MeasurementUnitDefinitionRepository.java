package com.example.taskmanagement.repository;

import com.example.taskmanagement.model.MeasurementUnitDefinition;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MeasurementUnitDefinitionRepository extends JpaRepository<MeasurementUnitDefinition, UUID> {
    Optional<MeasurementUnitDefinition> findByCodeIgnoreCase(String code);
    Optional<MeasurementUnitDefinition> findByNameIgnoreCase(String name);
    List<MeasurementUnitDefinition> findAllByOrderByEnabledDescNameAsc();
}
