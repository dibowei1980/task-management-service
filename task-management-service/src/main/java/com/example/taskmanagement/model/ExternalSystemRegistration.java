package com.example.taskmanagement.model;

import jakarta.persistence.*;
import java.time.ZonedDateTime;

@Entity
@Table(name = "external_system_registrations")
public class ExternalSystemRegistration {

    @Id
    private String systemId;

    @Column(nullable = false)
    private String displayName;

    @Column(nullable = false)
    private String serviceUrl;

    @Column(name = "sso_client_id", nullable = false)
    private String ssoClientId;

    @Column(name = "dashboard_url", length = 512)
    private String dashboardUrl;

    @Column(nullable = false)
    private String supportedTaskTypes;

    @Column(nullable = false)
    private String callbackPath;

    @Column(name = "registered_at", nullable = false)
    private ZonedDateTime registeredAt = ZonedDateTime.now();

    public ExternalSystemRegistration() {}

    public String getSystemId() { return systemId; }
    public void setSystemId(String systemId) { this.systemId = systemId; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public String getServiceUrl() { return serviceUrl; }
    public void setServiceUrl(String serviceUrl) { this.serviceUrl = serviceUrl; }

    public String getSsoClientId() { return ssoClientId; }
    public void setSsoClientId(String ssoClientId) { this.ssoClientId = ssoClientId; }

    public String getDashboardUrl() { return dashboardUrl; }
    public void setDashboardUrl(String dashboardUrl) { this.dashboardUrl = dashboardUrl; }

    public String getSupportedTaskTypes() { return supportedTaskTypes; }
    public void setSupportedTaskTypes(String supportedTaskTypes) { this.supportedTaskTypes = supportedTaskTypes; }

    public String getCallbackPath() { return callbackPath; }
    public void setCallbackPath(String callbackPath) { this.callbackPath = callbackPath; }

    public ZonedDateTime getRegisteredAt() { return registeredAt; }
    public void setRegisteredAt(ZonedDateTime registeredAt) { this.registeredAt = registeredAt; }
}
