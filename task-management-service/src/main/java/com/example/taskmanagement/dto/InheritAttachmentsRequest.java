package com.example.taskmanagement.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;
import java.util.UUID;

public class InheritAttachmentsRequest {

    @NotBlank(message = "操作类型不能为空")
    private String action;

    @NotEmpty(message = "源附件列表不能为空")
    private List<UUID> sourceAttachmentIds;

    private UUID uploadedBy;

    private String uploadedByName;

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }
    public List<UUID> getSourceAttachmentIds() { return sourceAttachmentIds; }
    public void setSourceAttachmentIds(List<UUID> sourceAttachmentIds) { this.sourceAttachmentIds = sourceAttachmentIds; }
    public UUID getUploadedBy() { return uploadedBy; }
    public void setUploadedBy(UUID uploadedBy) { this.uploadedBy = uploadedBy; }
    public String getUploadedByName() { return uploadedByName; }
    public void setUploadedByName(String uploadedByName) { this.uploadedByName = uploadedByName; }
}
