package com.example.taskmanagement.dto;

import java.time.ZonedDateTime;
import java.util.UUID;

public class AttachmentResponse {
    private UUID id;
    private UUID taskId;
    private String fileName;
    private Long fileSize;
    private String contentType;
    private UUID uploadedBy;
    private String uploadedByName;
    private ZonedDateTime uploadedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getTaskId() { return taskId; }
    public void setTaskId(UUID taskId) { this.taskId = taskId; }
    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }
    public Long getFileSize() { return fileSize; }
    public void setFileSize(Long fileSize) { this.fileSize = fileSize; }
    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }
    public UUID getUploadedBy() { return uploadedBy; }
    public void setUploadedBy(UUID uploadedBy) { this.uploadedBy = uploadedBy; }
    public String getUploadedByName() { return uploadedByName; }
    public void setUploadedByName(String uploadedByName) { this.uploadedByName = uploadedByName; }
    public ZonedDateTime getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(ZonedDateTime uploadedAt) { this.uploadedAt = uploadedAt; }
}
