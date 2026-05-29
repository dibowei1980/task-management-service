package com.example.taskmanagement.dto;

import java.util.List;
import java.util.UUID;

public class TaskTypeRegistrationRequest {
    private String code;
    private String name;
    private UUID groupId;
    private String description;
    private String sourceSystem;
    private String systemId;
    private String displayName;
    private String serviceUrl;
    private String dashboardUrl;
    private String callbackPath;
    private String ssoClientId;
    private List<InterfaceEntry> interfaceManifest;
    private String resultViewUrl;
    private List<String> callbackFields;
    private String resultQueryPath;

    public static class InterfaceEntry {
        private String name;
        private String version;
        private String method;
        private String description;
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getVersion() { return version; }
        public void setVersion(String version) { this.version = version; }
        public String getMethod() { return method; }
        public void setMethod(String method) { this.method = method; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
    }

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
    public List<InterfaceEntry> getInterfaceManifest() { return interfaceManifest; }
    public void setInterfaceManifest(List<InterfaceEntry> interfaceManifest) { this.interfaceManifest = interfaceManifest; }
    public String getResultViewUrl() { return resultViewUrl; }
    public void setResultViewUrl(String resultViewUrl) { this.resultViewUrl = resultViewUrl; }
    public List<String> getCallbackFields() { return callbackFields; }
    public void setCallbackFields(List<String> callbackFields) { this.callbackFields = callbackFields; }
    public String getResultQueryPath() { return resultQueryPath; }
    public void setResultQueryPath(String resultQueryPath) { this.resultQueryPath = resultQueryPath; }
}
