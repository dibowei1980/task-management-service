package com.example.taskmanagement.dto;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public class PersonnelWorkStatsResponse {
    private UUID userId;
    private String username;
    private Long totalTasks;
    private Long completedTasks;
    private Double totalWorkload;
    private String workloadUnit;
    private List<IntervalStats> intervalBreakdown;
    private List<StageResponsibleInfo> stageResponsibleInfo;

    public static class IntervalStats {
        private String period;
        private Long taskCount;
        private Double workload;

        public String getPeriod() { return period; }
        public void setPeriod(String period) { this.period = period; }
        public Long getTaskCount() { return taskCount; }
        public void setTaskCount(Long taskCount) { this.taskCount = taskCount; }
        public Double getWorkload() { return workload; }
        public void setWorkload(Double workload) { this.workload = workload; }
    }

    public static class StageResponsibleInfo {
        private String stage;
        private String username;
        private String completedAt;

        public String getStage() { return stage; }
        public void setStage(String stage) { this.stage = stage; }
        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
        public String getCompletedAt() { return completedAt; }
        public void setCompletedAt(String completedAt) { this.completedAt = completedAt; }
    }

    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public Long getTotalTasks() { return totalTasks; }
    public void setTotalTasks(Long totalTasks) { this.totalTasks = totalTasks; }
    public Long getCompletedTasks() { return completedTasks; }
    public void setCompletedTasks(Long completedTasks) { this.completedTasks = completedTasks; }
    public Double getTotalWorkload() { return totalWorkload; }
    public void setTotalWorkload(Double totalWorkload) { this.totalWorkload = totalWorkload; }
    public String getWorkloadUnit() { return workloadUnit; }
    public void setWorkloadUnit(String workloadUnit) { this.workloadUnit = workloadUnit; }
    public List<IntervalStats> getIntervalBreakdown() { return intervalBreakdown; }
    public void setIntervalBreakdown(List<IntervalStats> intervalBreakdown) { this.intervalBreakdown = intervalBreakdown; }
    public List<StageResponsibleInfo> getStageResponsibleInfo() { return stageResponsibleInfo; }
    public void setStageResponsibleInfo(List<StageResponsibleInfo> stageResponsibleInfo) { this.stageResponsibleInfo = stageResponsibleInfo; }
}
