package com.example.taskmanagement.dto;

import java.util.List;
import java.util.UUID;

public class TaskCompletionDataRequest {
    private String systemId;
    private UUID taskId;
    private String workflowStatus;
    private Integer progress;
    private String results;
    private Double completedWorkload;
    private String workloadUnit;
    private List<StageResponsible> stageResponsibles;

    public static class StageResponsible {
        private String stage;
        private UUID userId;
        private String username;
        private String completedAt;

        public String getStage() { return stage; }
        public void setStage(String stage) { this.stage = stage; }
        public UUID getUserId() { return userId; }
        public void setUserId(UUID userId) { this.userId = userId; }
        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
        public String getCompletedAt() { return completedAt; }
        public void setCompletedAt(String completedAt) { this.completedAt = completedAt; }
    }

    public String getSystemId() { return systemId; }
    public void setSystemId(String systemId) { this.systemId = systemId; }
    public UUID getTaskId() { return taskId; }
    public void setTaskId(UUID taskId) { this.taskId = taskId; }
    public String getWorkflowStatus() { return workflowStatus; }
    public void setWorkflowStatus(String workflowStatus) { this.workflowStatus = workflowStatus; }
    public Integer getProgress() { return progress; }
    public void setProgress(Integer progress) { this.progress = progress; }
    public String getResults() { return results; }
    public void setResults(String results) { this.results = results; }
    public Double getCompletedWorkload() { return completedWorkload; }
    public void setCompletedWorkload(Double completedWorkload) { this.completedWorkload = completedWorkload; }
    public String getWorkloadUnit() { return workloadUnit; }
    public void setWorkloadUnit(String workloadUnit) { this.workloadUnit = workloadUnit; }
    public List<StageResponsible> getStageResponsibles() { return stageResponsibles; }
    public void setStageResponsibles(List<StageResponsible> stageResponsibles) { this.stageResponsibles = stageResponsibles; }
}
