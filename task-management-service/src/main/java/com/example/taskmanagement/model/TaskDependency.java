package com.example.taskmanagement.model;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "task_dependencies", 
       uniqueConstraints = @UniqueConstraint(columnNames = {"predecessor_id", "successor_id"}))
public class TaskDependency {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "predecessor_id", nullable = false)
    private UUID predecessorId;

    @Column(name = "successor_id", nullable = false)
    private UUID successorId;

    @Enumerated(EnumType.STRING)
    @Column(name = "dependency_type")
    private DependencyType dependencyType = DependencyType.FINISH_TO_START;

    @Column(name = "unlock_status", length = 32)
    private String unlockStatus = "QA_COMPLETED";

    public enum DependencyType {
        FINISH_TO_START,
        START_TO_START,
        FINISH_TO_FINISH
    }

    public TaskDependency() {}

    public TaskDependency(UUID predecessorId, UUID successorId) {
        this.predecessorId = predecessorId;
        this.successorId = successorId;
    }

    public TaskDependency(UUID predecessorId, UUID successorId, String unlockStatus) {
        this.predecessorId = predecessorId;
        this.successorId = successorId;
        this.unlockStatus = unlockStatus != null ? unlockStatus : "QA_COMPLETED";
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getPredecessorId() { return predecessorId; }
    public void setPredecessorId(UUID predecessorId) { this.predecessorId = predecessorId; }
    public UUID getSuccessorId() { return successorId; }
    public void setSuccessorId(UUID successorId) { this.successorId = successorId; }
    public DependencyType getDependencyType() { return dependencyType; }
    public void setDependencyType(DependencyType dependencyType) { this.dependencyType = dependencyType; }
    public String getUnlockStatus() { return unlockStatus; }
    public void setUnlockStatus(String unlockStatus) { this.unlockStatus = unlockStatus; }
}
