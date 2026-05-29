package com.example.taskmanagement.dto;

import java.time.ZonedDateTime;
import java.util.List;
import java.util.UUID;

public class TaskTypeRegistrationResponse {
    private UUID id;
    private String code;
    private String name;
    private UUID groupId;
    private String groupName;
    private String description;
    private String sourceSystem;
    private String systemId;
    private String displayName;
    private String serviceUrl;
    private String dashboardUrl;
    private String callbackPath;
    private String ssoClientId;
    private String interfaceManifest;
    private String resultViewUrl;
    private List<String> callbackFields;
    private String resultQueryPath;
    private String status;
    private String reviewedBy;
    private ZonedDateTime reviewedAt;
    private String rejectReason;
    private UUID approvedGroupId;
    private ZonedDateTime createdAt;
    private ZonedDateTime updatedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public UUID getGroupId() { return groupId; }
    public void setGroupId(UUID groupId) { this.groupId = groupId; }
    public String getGroupName() { return groupName; }
    public void setGroupName(String groupName) { this.groupName = groupName; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getSourceSystem() { return sourceSystem; }
    public void setSourceSystem(String sourceSystem) { this.sourceSystem = sourceSystem; }
    public String getSystemId() { return systemId; }
    public void setSystemId(String systemId) { this.systemId = systemId; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public String getServiceUrl() { return serviceUrl; }
    public void setServiceUrl(String serviceUrl) { this.serviceUrl = serviceUrl; }
    public String getDashboardUrl() { return dashboardUrl; }
    public void setDashboardUrl(String dashboardUrl) { this.dashboardUrl = dashboardUrl; }
    public String getCallbackPath() { return callbackPath; }
    public void setCallbackPath(String callbackPath) { this.callbackPath = callbackPath; }
    public String getSsoClientId() { return ssoClientId; }
    public void setSsoClientId(String ssoClientId) { this.ssoClientId = ssoClientId; }
    public String getInterfaceManifest() { return interfaceManifest; }
    public void setInterfaceManifest(String interfaceManifest) { this.interfaceManifest = interfaceManifest; }
    public String getResultViewUrl() { return resultViewUrl; }
    public void setResultViewUrl(String resultViewUrl) { this.resultViewUrl = resultViewUrl; }
    public List<String> getCallbackFields() { return callbackFields; }
    public void setCallbackFields(List<String> callbackFields) { this.callbackFields = callbackFields; }
    public String getResultQueryPath() { return resultQueryPath; }
    public void setResultQueryPath(String resultQueryPath) { this.resultQueryPath = resultQueryPath; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getReviewedBy() { return reviewedBy; }
    public void setReviewedBy(String reviewedBy) { this.reviewedBy = reviewedBy; }
    public ZonedDateTime getReviewedAt() { return reviewedAt; }
    public void setReviewedAt(ZonedDateTime reviewedAt) { this.reviewedAt = reviewedAt; }
    public String getRejectReason() { return rejectReason; }
    public void setRejectReason(String rejectReason) { this.rejectReason = rejectReason; }
    public UUID getApprovedGroupId() { return approvedGroupId; }
    public void setApprovedGroupId(UUID approvedGroupId) { this.approvedGroupId = approvedGroupId; }
    public ZonedDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(ZonedDateTime createdAt) { this.createdAt = createdAt; }
    public ZonedDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(ZonedDateTime updatedAt) { this.updatedAt = updatedAt; }
}