package com.example.taskmanagement.repository;

import com.example.taskmanagement.model.ProjectTypeDefinition;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProjectTypeDefinitionRepository extends JpaRepository<ProjectTypeDefinition, UUID> {
    Optional<ProjectTypeDefinition> findByCodeIgnoreCase(String code);
    Optional<ProjectTypeDefinition> findByNameIgnoreCase(String name);
    List<ProjectTypeDefinition> findAllByOrderByEnabledDescNameAsc();
}
