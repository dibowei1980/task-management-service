package com.example.taskmanagement.service.impl;

import com.example.taskmanagement.dto.AttachmentResponse;
import com.example.taskmanagement.model.Task;
import com.example.taskmanagement.model.TaskAttachment;
import com.example.taskmanagement.repository.TaskAttachmentRepository;
import com.example.taskmanagement.repository.TaskRepository;
import com.example.taskmanagement.service.AttachmentService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class AttachmentServiceImpl implements AttachmentService {

    private static final long MAX_FILE_SIZE = 50L * 1024 * 1024;
    private static final int MAX_ATTACHMENTS_PER_TASK = 20;
    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "image/jpeg",
            "image/png",
            "image/tiff",
            "application/zip",
            "application/x-rar-compressed",
            "application/vnd.rar"
    );

    private final TaskAttachmentRepository repository;
    private final TaskRepository taskRepository;
    private final Path uploadDir;

    public AttachmentServiceImpl(TaskAttachmentRepository repository, TaskRepository taskRepository) {
        this.repository = repository;
        this.taskRepository = taskRepository;
        this.uploadDir = Paths.get("uploads/attachments").toAbsolutePath();
        try {
            Files.createDirectories(uploadDir);
        } catch (IOException e) {
            throw new RuntimeException("failed to create upload directory", e);
        }
    }

    @Override
    @Transactional
    public AttachmentResponse upload(UUID taskId, MultipartFile file, UUID uploadedBy, String uploadedByName) {
        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new IllegalArgumentException("task not found"));

        if (file.isEmpty()) {
            throw new IllegalArgumentException("file is empty");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new IllegalArgumentException("文件大小超过限制（50MB）");
        }
        if (file.getContentType() == null || !ALLOWED_CONTENT_TYPES.contains(file.getContentType())) {
            throw new IllegalArgumentException("不支持的文件格式，仅支持 PDF/Word/图片/ZIP/RAR");
        }

        long currentCount = repository.countByTaskId(taskId);
        if (currentCount >= MAX_ATTACHMENTS_PER_TASK) {
            throw new IllegalArgumentException("附件数量已达上限（20个）");
        }

        String storedName = UUID.randomUUID() + "_" + file.getOriginalFilename();
        Path destPath = uploadDir.resolve(storedName);
        try {
            Files.write(destPath, file.getBytes());
        } catch (IOException e) {
            throw new RuntimeException("文件保存失败", e);
        }

        TaskAttachment attachment = new TaskAttachment();
        attachment.setTask(task);
        attachment.setFileName(file.getOriginalFilename());
        attachment.setStoredName(storedName);
        attachment.setFileSize(file.getSize());
        attachment.setContentType(file.getContentType());
        attachment.setStoragePath(destPath.toString());
        attachment.setUploadedBy(uploadedBy);
        attachment.setUploadedByName(uploadedByName);

        attachment = repository.save(attachment);

        task.setAttachmentCount((int) (currentCount + 1));
        taskRepository.save(task);

        return toResponse(attachment);
    }

    @Override
    public byte[] download(UUID attachmentId) {
        TaskAttachment attachment = repository.findById(attachmentId)
                .orElseThrow(() -> new IllegalArgumentException("attachment not found"));
        try {
            return Files.readAllBytes(Path.of(attachment.getStoragePath()));
        } catch (IOException e) {
            throw new RuntimeException("文件读取失败", e);
        }
    }

    @Override
    @Transactional
    public void delete(UUID taskId, UUID attachmentId, UUID deletedBy) {
        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new IllegalArgumentException("task not found"));
        TaskAttachment attachment = repository.findById(attachmentId)
                .orElseThrow(() -> new IllegalArgumentException("attachment not found"));

        if (!attachment.getTask().getId().equals(taskId)) {
            throw new IllegalArgumentException("attachment does not belong to task");
        }

        try {
            Files.deleteIfExists(Path.of(attachment.getStoragePath()));
        } catch (IOException e) {
            throw new RuntimeException("文件删除失败", e);
        }

        repository.delete(attachment);

        task.setAttachmentCount(Math.max(0, task.getAttachmentCount() - 1));
        taskRepository.save(task);
    }

    @Override
    public List<AttachmentResponse> listByTask(UUID taskId) {
        return repository.findByTaskIdOrderByUploadedAtDesc(taskId).stream()
                .map(this::toResponse)
                .toList();
    }

    private AttachmentResponse toResponse(TaskAttachment entity) {
        AttachmentResponse r = new AttachmentResponse();
        r.setId(entity.getId());
        r.setTaskId(entity.getTask().getId());
        r.setFileName(entity.getFileName());
        r.setFileSize(entity.getFileSize());
        r.setContentType(entity.getContentType());
        r.setUploadedBy(entity.getUploadedBy());
        r.setUploadedByName(entity.getUploadedByName());
        r.setUploadedAt(entity.getUploadedAt());
        return r;
    }
}
