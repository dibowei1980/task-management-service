package com.example.taskmanagement.dto;

import java.util.List;

public class ExternalSystemRegistrationRequest {
    private String systemId;
    private String displayName;
    private String serviceUrl;
    private String ssoClientId;
    private String dashboardUrl;
    private String resultViewUrl;
    private List<String> callbackFields;
    private String resultQueryPath;
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

    public String getResultViewUrl() { return resultViewUrl; }
    public void setResultViewUrl(String resultViewUrl) { this.resultViewUrl = resultViewUrl; }

    public List<String> getCallbackFields() { return callbackFields; }
    public void setCallbackFields(List<String> callbackFields) { this.callbackFields = callbackFields; }

    public String getResultQueryPath() { return resultQueryPath; }
    public void setResultQueryPath(String resultQueryPath) { this.resultQueryPath = resultQueryPath; }

    public List<String> getSupportedTaskTypes() { return supportedTaskTypes; }
    public void setSupportedTaskTypes(List<String> supportedTaskTypes) { this.supportedTaskTypes = supportedTaskTypes; }

    public String getCallbackPath() { return callbackPath; }
    public void setCallbackPath(String callbackPath) { this.callbackPath = callbackPath; }
}
