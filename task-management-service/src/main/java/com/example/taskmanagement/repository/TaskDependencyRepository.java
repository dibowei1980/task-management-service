package com.example.taskmanagement.repository;

import com.example.taskmanagement.model.TaskDependency;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface TaskDependencyRepository extends JpaRepository<TaskDependency, UUID> {
    List<TaskDependency> findByPredecessorId(UUID predecessorId);
    List<TaskDependency> findBySuccessorId(UUID successorId);
    boolean existsByPredecessorIdAndSuccessorId(UUID predecessorId, UUID successorId);
    void deleteByPredecessorId(UUID predecessorId);
    void deleteBySuccessorId(UUID successorId);
}
