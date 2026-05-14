package com.example.taskmanagement.service;

import com.example.taskmanagement.dto.ActionAttachmentResponse;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

public interface ActionAttachmentService {

    ActionAttachmentResponse upload(UUID taskId, String action, MultipartFile file, UUID uploadedBy, String uploadedByName);

    ActionAttachmentResponse addLink(UUID taskId, String action, String url, String label, UUID uploadedBy, String uploadedByName);

    List<ActionAttachmentResponse> inheritFromTaskAttachments(UUID taskId, String action, List<UUID> sourceAttachmentIds, UUID uploadedBy, String uploadedByName);

    List<ActionAttachmentResponse> listByTaskAndAction(UUID taskId, String action, UUID userId, String departmentId);

    List<ActionAttachmentResponse> listByTask(UUID taskId, UUID userId, String departmentId);

    byte[] download(UUID attachmentId, UUID userId, String departmentId);

    void delete(UUID attachmentId, UUID deletedBy);
}
