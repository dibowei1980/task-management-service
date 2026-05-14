package com.example.taskmanagement.repository;

import com.example.taskmanagement.model.Task;
import com.example.taskmanagement.model.TaskCategory;
import com.example.taskmanagement.model.TaskStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Repository
public interface TaskRepository extends JpaRepository<Task, UUID> {
    List<Task> findByAssigneeId(UUID assigneeId);
    List<Task> findByStatus(TaskStatus status);
    List<Task> findByParentTaskId(UUID parentTaskId);
    Optional<Task> findByExternalSystemAndExternalTaskId(String externalSystem, String externalTaskId);
    Optional<Task> findBySelfCheckForTaskId(UUID selfCheckForTaskId);

    long countByAssigneeIdAndStatus(UUID assigneeId, TaskStatus status);
    long countByAssigneeIdAndStatusAndDepartmentId(UUID assigneeId, TaskStatus status, String departmentId);

    List<Task> findByProjectIdAndCategory(UUID projectId, TaskCategory category);

    List<Task> findByProjectIdIn(Set<UUID> projectIds);

    boolean existsByParentTaskId(UUID parentTaskId);

    boolean existsByParentTaskIdAndName(UUID parentTaskId, String name);

    long countByParentTaskId(UUID parentTaskId);
    
    org.springframework.data.domain.Page<Task> findAllByDepartmentId(String departmentId, org.springframework.data.domain.Pageable pageable);

    org.springframework.data.domain.Page<Task> findAllByDepartmentIdOrCreatedDepartmentId(String departmentId, String createdDepartmentId, org.springframework.data.domain.Pageable pageable);

    org.springframework.data.domain.Page<Task> findAllByCategory(TaskCategory category, org.springframework.data.domain.Pageable pageable);

    org.springframework.data.domain.Page<Task> findAllByDepartmentIdAndCategory(String departmentId, TaskCategory category, org.springframework.data.domain.Pageable pageable);

    org.springframework.data.domain.Page<Task> findAllByExternalSystem(String externalSystem, org.springframework.data.domain.Pageable pageable);

    org.springframework.data.domain.Page<Task> findAllByExternalSystemAndCategory(String externalSystem, TaskCategory category, org.springframework.data.domain.Pageable pageable);

    @Query(
            value = """
                    select t from Task t
                    where
                        (:departmentId is not null and (t.departmentId = :departmentId or t.createdDepartmentId = :departmentId))
                        or (:departmentName is not null and (t.departmentId = :departmentName or t.createdDepartmentName = :departmentName))
                    """,
            countQuery = """
                    select count(t) from Task t
                    where
                        (:departmentId is not null and (t.departmentId = :departmentId or t.createdDepartmentId = :departmentId))
                        or (:departmentName is not null and (t.departmentId = :departmentName or t.createdDepartmentName = :departmentName))
                    """
    )
    org.springframework.data.domain.Page<Task> findAllForDepartmentScope(@Param("departmentId") String departmentId, @Param("departmentName") String departmentName, org.springframework.data.domain.Pageable pageable);

    @Query(
            value = """
                    select t from Task t
                    where (
                        (:departmentId is not null and (t.departmentId = :departmentId or t.createdDepartmentId = :departmentId))
                        or (:departmentName is not null and (t.departmentId = :departmentName or t.createdDepartmentName = :departmentName))
                    )
                    and (:category is null or t.category = :category)
                    """,
            countQuery = """
                    select count(t) from Task t
                    where (
                        (:departmentId is not null and (t.departmentId = :departmentId or t.createdDepartmentId = :departmentId))
                        or (:departmentName is not null and (t.departmentId = :departmentName or t.createdDepartmentName = :departmentName))
                    )
                    and (:category is null or t.category = :category)
                    """
    )
    org.springframework.data.domain.Page<Task> findAllForDepartmentScopeWithCategory(@Param("departmentId") String departmentId, @Param("departmentName") String departmentName, @Param("category") TaskCategory category, org.springframework.data.domain.Pageable pageable);

    @Query(
            value = """
                    select t from Task t
                    where (t.id in (
                        select p.id from Task p
                        where p.category = :projectCategory and p.assigneeId = :userId
                    )
                    or t.projectId in (
                        select p.id from Task p
                        where p.category = :projectCategory and p.assigneeId = :userId
                    ))
                    and (:departmentId is null or t.departmentId = :departmentId or t.createdDepartmentId = :departmentId)
                    """,
            countQuery = """
                    select count(t) from Task t
                    where (t.id in (
                        select p.id from Task p
                        where p.category = :projectCategory and p.assigneeId = :userId
                    )
                    or t.projectId in (
                        select p.id from Task p
                        where p.category = :projectCategory and p.assigneeId = :userId
                    ))
                    and (:departmentId is null or t.departmentId = :departmentId or t.createdDepartmentId = :departmentId)
                    """
    )
    org.springframework.data.domain.Page<Task> findAllForProjectLeader(TaskCategory projectCategory, UUID userId, @Param("departmentId") String departmentId, org.springframework.data.domain.Pageable pageable);
}
