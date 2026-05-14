package com.example.taskmanagement.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.UUID;

public class AddActionLinkRequest {

    @NotBlank(message = "操作类型不能为空")
    private String action;

    @NotBlank(message = "地址不能为空")
    private String url;

    private String label;

    private UUID uploadedBy;

    private String uploadedByName;

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }
    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public UUID getUploadedBy() { return uploadedBy; }
    public void setUploadedBy(UUID uploadedBy) { this.uploadedBy = uploadedBy; }
    public String getUploadedByName() { return uploadedByName; }
    public void setUploadedByName(String uploadedByName) { this.uploadedByName = uploadedByName; }
}
