package com.example.taskmanagement.repository;

import com.example.taskmanagement.model.TaskTypeGroup;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TaskTypeGroupRepository extends JpaRepository<TaskTypeGroup, UUID> {
    Optional<TaskTypeGroup> findByCodeIgnoreCase(String code);
    Optional<TaskTypeGroup> findByNameIgnoreCase(String name);
    List<TaskTypeGroup> findAllByOrderBySortOrderAsc();
    List<TaskTypeGroup> findByEnabledTrueOrderBySortOrderAsc();
}
