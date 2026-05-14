package com.example.taskmanagement.dto;

import com.example.taskmanagement.model.WorkflowStatus;

import java.util.List;
import java.util.UUID;

public class WorkflowStatusUpdateRequest {
    private WorkflowStatus workflowStatus;
    private String commentStage;
    private String commentResult;
    private String commentMessage;
    private String intermediatePath;
    private Integer progress;
    private String results;
    private String systemId;
    private UUID taskId;
    private Double completedWorkload;
    private String workloadUnit;
    private List<StageResponsible> stageResponsibles;

    public static class StageResponsible {
        private String stage;
        private UUID userId;
        private String username;
        private String completedAt;

        public String getStage() {
            return stage;
        }

        public void setStage(String stage) {
            this.stage = stage;
        }

        public UUID getUserId() {
            return userId;
        }

        public void setUserId(UUID userId) {
            this.userId = userId;
        }

        public String getUsername() {
            return username;
        }

        public void setUsername(String username) {
            this.username = username;
        }

        public String getCompletedAt() {
            return completedAt;
        }

        public void setCompletedAt(String completedAt) {
            this.completedAt = completedAt;
        }
    }

    public WorkflowStatus getWorkflowStatus() {
        return workflowStatus;
    }

    public void setWorkflowStatus(WorkflowStatus workflowStatus) {
        this.workflowStatus = workflowStatus;
    }

    public String getCommentStage() {
        return commentStage;
    }

    public void setCommentStage(String commentStage) {
        this.commentStage = commentStage;
    }

    public String getCommentResult() {
        return commentResult;
    }

    public void setCommentResult(String commentResult) {
        this.commentResult = commentResult;
    }

    public String getCommentMessage() {
        return commentMessage;
    }

    public void setCommentMessage(String commentMessage) {
        this.commentMessage = commentMessage;
    }

    public String getIntermediatePath() {
        return intermediatePath;
    }

    public void setIntermediatePath(String intermediatePath) {
        this.intermediatePath = intermediatePath;
    }

    public Integer getProgress() {
        return progress;
    }

    public void setProgress(Integer progress) {
        this.progress = progress;
    }

    public String getResults() {
        return results;
    }

    public void setResults(String results) {
        this.results = results;
    }

    public String getSystemId() {
        return systemId;
    }

    public void setSystemId(String systemId) {
        this.systemId = systemId;
    }

    public UUID getTaskId() {
        return taskId;
    }

    public void setTaskId(UUID taskId) {
        this.taskId = taskId;
    }

    public Double getCompletedWorkload() {
        return completedWorkload;
    }

    public void setCompletedWorkload(Double completedWorkload) {
        this.completedWorkload = completedWorkload;
    }

    public String getWorkloadUnit() {
        return workloadUnit;
    }

    public void setWorkloadUnit(String workloadUnit) {
        this.workloadUnit = workloadUnit;
    }

    public List<StageResponsible> getStageResponsibles() {
        return stageResponsibles;
    }

    public void setStageResponsibles(List<StageResponsible> stageResponsibles) {
        this.stageResponsibles = stageResponsibles;
    }
}
