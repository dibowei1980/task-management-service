package com.example.taskmanagement.model;

import jakarta.persistence.*;
import java.time.ZonedDateTime;
import java.util.UUID;

@Entity
@Table(name = "task_type_registrations")
public class TaskTypeRegistration {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 64, unique = true)
    private String code;

    @Column(nullable = false, length = 128)
    private String name;

    @Column(name = "group_id")
    private UUID groupId;

    @Column(length = 500)
    private String description;

    @Column(name = "source_system", nullable = false, length = 64)
    private String sourceSystem;

    @Column(name = "system_id", nullable = false, length = 64)
    private String systemId;

    @Column(name = "display_name", length = 128)
    private String displayName;

    @Column(name = "service_url", length = 512)
    private String serviceUrl;

    @Column(name = "dashboard_url", length = 512)
    private String dashboardUrl;

    @Column(name = "callback_path", length = 256)
    private String callbackPath;

    @Column(name = "sso_client_id", length = 64)
    private String ssoClientId;

    @Column(name = "interface_manifest", length = 4000)
    private String interfaceManifest;

    @Column(name = "result_view_url", length = 512)
    private String resultViewUrl;

    @Column(name = "callback_fields", length = 512)
    private String callbackFields;

    @Column(name = "result_query_path", length = 256)
    private String resultQueryPath;

    @Column(nullable = false, length = 32)
    private String status = "PENDING";

    @Column(name = "reviewed_by", length = 128)
    private String reviewedBy;

    @Column(name = "reviewed_at")
    private ZonedDateTime reviewedAt;

    @Column(name = "reject_reason", length = 1000)
    private String rejectReason;

    @Column(name = "approved_group_id")
    private UUID approvedGroupId;

    @Column(name = "created_at", nullable = false)
    private ZonedDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private ZonedDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        ZonedDateTime now = ZonedDateTime.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = ZonedDateTime.now();
    }

    public TaskTypeRegistration() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public UUID getGroupId() { return groupId; }
    public void setGroupId(UUID groupId) { this.groupId = groupId; }
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
    public String getCallbackFields() { return callbackFields; }
    public void setCallbackFields(String callbackFields) { this.callbackFields = callbackFields; }
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