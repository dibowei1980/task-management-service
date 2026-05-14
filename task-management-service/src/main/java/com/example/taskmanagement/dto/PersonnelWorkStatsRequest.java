package com.example.taskmanagement.dto;

import java.util.List;
import java.util.UUID;

public class PersonnelWorkStatsRequest {
    private UUID userId;
    private List<String> taskTypes;
    private String startDate;
    private String endDate;
    private String interval;

    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public List<String> getTaskTypes() { return taskTypes; }
    public void setTaskTypes(List<String> taskTypes) { this.taskTypes = taskTypes; }
    public String getStartDate() { return startDate; }
    public void setStartDate(String startDate) { this.startDate = startDate; }
    public String getEndDate() { return endDate; }
    public void setEndDate(String endDate) { this.endDate = endDate; }
    public String getInterval() { return interval; }
    public void setInterval(String interval) { this.interval = interval; }
}
