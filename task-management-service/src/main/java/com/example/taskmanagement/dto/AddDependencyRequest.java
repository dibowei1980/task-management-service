package com.example.taskmanagement.dto;

public class AddDependencyRequest {
    private String dependencyTaskId;
    private String unlockStatus;

    public String getDependencyTaskId() { return dependencyTaskId; }
    public void setDependencyTaskId(String dependencyTaskId) { this.dependencyTaskId = dependencyTaskId; }
    public String getUnlockStatus() { return unlockStatus; }
    public void setUnlockStatus(String unlockStatus) { this.unlockStatus = unlockStatus; }
}
