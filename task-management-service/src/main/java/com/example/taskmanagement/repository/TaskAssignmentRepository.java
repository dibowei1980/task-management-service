package com.example.taskmanagement.repository;

import com.example.taskmanagement.model.TaskAssignment;
import com.example.taskmanagement.model.TaskAssignmentId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface TaskAssignmentRepository extends JpaRepository<TaskAssignment, TaskAssignmentId> {
    List<TaskAssignment> findByIdTaskId(UUID taskId);
    List<TaskAssignment> findByIdUserId(UUID userId);
    void deleteByIdTaskId(UUID taskId);

    @Query("select a.id.taskId from TaskAssignment a where a.id.userId = :userId and a.id.assignmentRole = 'OPERATOR'")
    List<UUID> findOperatorTaskIdsByUserId(@Param("userId") UUID userId);
}

