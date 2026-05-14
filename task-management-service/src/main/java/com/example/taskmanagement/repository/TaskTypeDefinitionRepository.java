package com.example.taskmanagement.repository;

import com.example.taskmanagement.model.TaskTypeDefinition;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TaskTypeDefinitionRepository extends JpaRepository<TaskTypeDefinition, UUID> {
    Optional<TaskTypeDefinition> findByCodeIgnoreCase(String code);
    Optional<TaskTypeDefinition> findByNameIgnoreCase(String name);
    List<TaskTypeDefinition> findByGroupIdOrderByNameAsc(UUID groupId);
    List<TaskTypeDefinition> findAllByOrderByEnabledDescNameAsc();
}
