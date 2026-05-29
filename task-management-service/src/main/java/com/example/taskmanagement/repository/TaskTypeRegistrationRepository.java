package com.example.taskmanagement.repository;

import com.example.taskmanagement.model.TaskTypeRegistration;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TaskTypeRegistrationRepository extends JpaRepository<TaskTypeRegistration, UUID> {
    boolean existsByCode(String code);
    Optional<TaskTypeRegistration> findByCode(String code);
    List<TaskTypeRegistration> findByStatusOrderByCreatedAtDesc(String status);
    List<TaskTypeRegistration> findAllByOrderByCreatedAtDesc();
    List<TaskTypeRegistration> findBySystemId(String systemId);
    void deleteBySystemId(String systemId);
}