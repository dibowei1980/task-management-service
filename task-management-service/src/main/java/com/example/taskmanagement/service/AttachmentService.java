package com.example.taskmanagement.service;

import com.example.taskmanagement.dto.AttachmentResponse;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

public interface AttachmentService {
    AttachmentResponse upload(UUID taskId, MultipartFile file, UUID uploadedBy, String uploadedByName);
    byte[] download(UUID attachmentId);
    void delete(UUID taskId, UUID attachmentId, UUID deletedBy);
    List<AttachmentResponse> listByTask(UUID taskId);
}
