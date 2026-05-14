package com.example.taskmanagement.dto;

import java.util.List;

public class ExternalSystemRegistrationRequest {
    private String systemId;
    private String displayName;
    private String serviceUrl;
    private String ssoClientId;
    private String dashboardUrl;
    private List<String> supportedTaskTypes;
    private String callbackPath;

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

    public List<String> getSupportedTaskTypes() { return supportedTaskTypes; }
    public void setSupportedTaskTypes(List<String> supportedTaskTypes) { this.supportedTaskTypes = supportedTaskTypes; }

    public String getCallbackPath() { return callbackPath; }
    public void setCallbackPath(String callbackPath) { this.callbackPath = callbackPath; }
}
