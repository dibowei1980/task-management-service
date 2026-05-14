package com.example.taskmanagement.service.impl;

import com.example.taskmanagement.dto.ActionAttachmentResponse;
import com.example.taskmanagement.model.Task;
import com.example.taskmanagement.model.TaskActionAttachment;
import com.example.taskmanagement.model.TaskAttachment;
import com.example.taskmanagement.repository.TaskActionAttachmentRepository;
import com.example.taskmanagement.repository.TaskAttachmentRepository;
import com.example.taskmanagement.repository.TaskRepository;
import com.example.taskmanagement.service.ActionAttachmentService;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
public class ActionAttachmentServiceImpl implements ActionAttachmentService {

    private static final long MAX_FILE_SIZE = 10L * 1024 * 1024;
    private static final int MAX_PER_ACTION = 20;
    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
            "image/jpeg",
            "image/png",
            "image/tiff",
            "image/gif",
            "application/zip",
            "application/x-rar-compressed",
            "application/vnd.rar",
            "application/x-7z-compressed"
    );

    private final TaskActionAttachmentRepository repository;
    private final TaskAttachmentRepository taskAttachmentRepository;
    private final TaskRepository taskRepository;
    private final Path uploadDir;

    public ActionAttachmentServiceImpl(TaskActionAttachmentRepository repository,
                                       TaskAttachmentRepository taskAttachmentRepository,
                                       TaskRepository taskRepository) {
        this.repository = repository;
        this.taskAttachmentRepository = taskAttachmentRepository;
        this.taskRepository = taskRepository;
        this.uploadDir = Paths.get("uploads/action-attachments").toAbsolutePath();
        try {
            Files.createDirectories(uploadDir);
        } catch (IOException e) {
            throw new RuntimeException("failed to create upload directory", e);
        }
    }

    @Override
    @Transactional
    public ActionAttachmentResponse upload(UUID taskId, String action, MultipartFile file, UUID uploadedBy, String uploadedByName) {
        taskRepository.findById(taskId)
                .orElseThrow(() -> new IllegalArgumentException("task not found"));

        if (file.isEmpty()) {
            throw new IllegalArgumentException("文件为空");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new IllegalArgumentException("文件大小超过限制（10MB）");
        }
        if (file.getContentType() == null || !ALLOWED_CONTENT_TYPES.contains(file.getContentType())) {
            throw new IllegalArgumentException("不支持的文件格式，仅支持 PDF/Word/Excel/图片/ZIP/RAR/7z");
        }

        long currentCount = repository.countByTaskIdAndAction(taskId, action);
        if (currentCount >= MAX_PER_ACTION) {
            throw new IllegalArgumentException("该操作附件数量已达上限（20个）");
        }

        String storedName = UUID.randomUUID() + "_" + file.getOriginalFilename();
        Path destPath = uploadDir.resolve(storedName);
        try {
            Files.write(destPath, file.getBytes());
        } catch (IOException e) {
            throw new RuntimeException("文件保存失败", e);
        }

        TaskActionAttachment entity = new TaskActionAttachment();
        entity.setTaskId(taskId);
        entity.setAction(action);
        entity.setType("FILE");
        entity.setFileName(file.getOriginalFilename());
        entity.setStoredName(storedName);
        entity.setFileSize(file.getSize());
        entity.setContentType(file.getContentType());
        entity.setStoragePath(destPath.toString());
        entity.setUploadedBy(uploadedBy);
        entity.setUploadedByName(uploadedByName);

        entity = repository.save(entity);
        return toResponse(entity);
    }

    @Override
    @Transactional
    public ActionAttachmentResponse addLink(UUID taskId, String action, String url, String label, UUID uploadedBy, String uploadedByName) {
        taskRepository.findById(taskId)
                .orElseThrow(() -> new IllegalArgumentException("task not found"));

        long currentCount = repository.countByTaskIdAndAction(taskId, action);
        if (currentCount >= MAX_PER_ACTION) {
            throw new IllegalArgumentException("该操作附件数量已达上限（20个）");
        }

        TaskActionAttachment entity = new TaskActionAttachment();
        entity.setTaskId(taskId);
        entity.setAction(action);
        entity.setType("LINK");
        entity.setLinkUrl(url);
        entity.setLinkLabel(label);
        entity.setUploadedBy(uploadedBy);
        entity.setUploadedByName(uploadedByName);

        entity = repository.save(entity);
        return toResponse(entity);
    }

    @Override
    @Transactional
    public List<ActionAttachmentResponse> inheritFromTaskAttachments(UUID taskId, String action, List<UUID> sourceAttachmentIds, UUID uploadedBy, String uploadedByName) {
        taskRepository.findById(taskId)
                .orElseThrow(() -> new IllegalArgumentException("task not found"));

        long currentCount = repository.countByTaskIdAndAction(taskId, action);
        if (currentCount + sourceAttachmentIds.size() > MAX_PER_ACTION) {
            throw new IllegalArgumentException("继承后附件数量将超过上限（20个）");
        }

        List<ActionAttachmentResponse> results = new ArrayList<>();
        for (UUID sourceId : sourceAttachmentIds) {
            TaskAttachment source = taskAttachmentRepository.findById(sourceId)
                    .orElseThrow(() -> new IllegalArgumentException("源附件不存在: " + sourceId));

            if (!source.getTask().getId().equals(taskId)) {
                throw new IllegalArgumentException("源附件不属于当前任务");
            }

            TaskActionAttachment entity = new TaskActionAttachment();
            entity.setTaskId(taskId);
            entity.setAction(action);
            entity.setType("FILE");
            entity.setFileName(source.getFileName());
            entity.setStoredName(source.getStoredName());
            entity.setFileSize(source.getFileSize());
            entity.setContentType(source.getContentType());
            entity.setStoragePath(source.getStoragePath());
            entity.setInheritedFrom(sourceId);
            entity.setUploadedBy(uploadedBy);
            entity.setUploadedByName(uploadedByName);

            entity = repository.save(entity);
            results.add(toResponse(entity));
        }
        return results;
    }

    @Override
    public List<ActionAttachmentResponse> listByTaskAndAction(UUID taskId, String action, UUID userId, String departmentId) {
        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new IllegalArgumentException("task not found"));
        if (!canViewAction(task, action, userId, departmentId)) {
            throw new AccessDeniedException("无权查看此操作的附件");
        }
        return repository.findByTaskIdAndActionOrderByCreatedAtAsc(taskId, action).stream()
                .map(this::toResponse)
                .toList();
    }

    @Override
    public List<ActionAttachmentResponse> listByTask(UUID taskId, UUID userId, String departmentId) {
        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new IllegalArgumentException("task not found"));
        return repository.findByTaskIdOrderByCreatedAtAsc(taskId).stream()
                .filter(a -> canViewAction(task, a.getAction(), userId, departmentId))
                .map(this::toResponse)
                .toList();
    }

    @Override
    public byte[] download(UUID attachmentId, UUID userId, String departmentId) {
        TaskActionAttachment attachment = repository.findById(attachmentId)
                .orElseThrow(() -> new IllegalArgumentException("附件不存在"));
        Task task = taskRepository.findById(attachment.getTaskId())
                .orElseThrow(() -> new IllegalArgumentException("task not found"));
        if (!canViewAction(task, attachment.getAction(), userId, departmentId)) {
            throw new AccessDeniedException("无权下载此附件");
        }
        try {
            return Files.readAllBytes(Path.of(attachment.getStoragePath()));
        } catch (IOException e) {
            throw new RuntimeException("文件读取失败", e);
        }
    }

    @Override
    @Transactional
    public void delete(UUID attachmentId, UUID deletedBy) {
        TaskActionAttachment attachment = repository.findById(attachmentId)
                .orElseThrow(() -> new IllegalArgumentException("附件不存在"));

        if ("FILE".equals(attachment.getType()) && attachment.getInheritedFrom() == null) {
            try {
                Files.deleteIfExists(Path.of(attachment.getStoragePath()));
            } catch (IOException e) {
                throw new RuntimeException("文件删除失败", e);
            }
        }

        repository.delete(attachment);
    }

    private ActionAttachmentResponse toResponse(TaskActionAttachment entity) {
        ActionAttachmentResponse r = new ActionAttachmentResponse();
        r.setId(entity.getId());
        r.setTaskId(entity.getTaskId());
        r.setAction(entity.getAction());
        r.setType(entity.getType());
        r.setFileName(entity.getFileName());
        r.setFileSize(entity.getFileSize());
        r.setContentType(entity.getContentType());
        r.setLinkUrl(entity.getLinkUrl());
        r.setLinkLabel(entity.getLinkLabel());
        r.setInheritedFrom(entity.getInheritedFrom());
        r.setUploadedBy(entity.getUploadedBy());
        r.setUploadedByName(entity.getUploadedByName());
        r.setCreatedAt(entity.getCreatedAt());
        return r;
    }

    private boolean canViewAction(Task task, String action, UUID userId, String departmentId) {
        if (userId == null) return false;

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getAuthorities().stream().anyMatch(ga -> {
            String a = ga.getAuthority().toLowerCase(Locale.ROOT);
            return a.equals("project:read_global") || a.equals("task:read_global");
        })) {
            return true;
        }

        if ("ASSIGN".equals(action)) {
            return userId.equals(task.getAssigneeId());
        } else if ("SUBMIT_QA".equals(action)) {
            if (task.getQaAssigneeId() != null) {
                return userId.equals(task.getQaAssigneeId());
            }
            boolean hasQualityCheck = auth != null && auth.getAuthorities().stream().anyMatch(ga -> {
                String a = ga.getAuthority().toLowerCase(Locale.ROOT);
                return a.equals("quality:check");
            });
            boolean inQaDept = departmentId != null && departmentId.equals(task.getQaDepartmentId());
            return hasQualityCheck && inQaDept;
        }

        return false;
    }
}
