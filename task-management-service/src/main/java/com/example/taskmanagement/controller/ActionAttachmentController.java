package com.example.taskmanagement.controller;

import com.example.taskmanagement.dto.ActionAttachmentResponse;
import com.example.taskmanagement.dto.AddActionLinkRequest;
import com.example.taskmanagement.dto.InheritAttachmentsRequest;
import com.example.taskmanagement.service.ActionAttachmentService;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/action-attachments")
public class ActionAttachmentController {

    private final ActionAttachmentService service;

    public ActionAttachmentController(ActionAttachmentService service) {
        this.service = service;
    }

    @PostMapping("/task/{taskId}/upload")
    @PreAuthorize("isAuthenticated()")
    public ActionAttachmentResponse upload(
            @PathVariable UUID taskId,
            @RequestParam("file") MultipartFile file,
            @RequestParam("action") String action,
            @RequestParam(required = false) UUID uploadedBy,
            @RequestParam(required = false) String uploadedByName) {
        return service.upload(taskId, action, file, uploadedBy, uploadedByName);
    }

    @PostMapping("/task/{taskId}/link")
    @PreAuthorize("isAuthenticated()")
    public ActionAttachmentResponse addLink(
            @PathVariable UUID taskId,
            @RequestBody AddActionLinkRequest request) {
        return service.addLink(taskId, request.getAction(), request.getUrl(),
                request.getLabel(), request.getUploadedBy(), request.getUploadedByName());
    }

    @PostMapping("/task/{taskId}/inherit")
    @PreAuthorize("isAuthenticated()")
    public List<ActionAttachmentResponse> inherit(
            @PathVariable UUID taskId,
            @RequestBody InheritAttachmentsRequest request) {
        return service.inheritFromTaskAttachments(taskId, request.getAction(),
                request.getSourceAttachmentIds(), request.getUploadedBy(), request.getUploadedByName());
    }

    @GetMapping("/task/{taskId}")
    @PreAuthorize("@authzService.canRead(authentication)")
    public List<ActionAttachmentResponse> listByTaskAndAction(
            @PathVariable UUID taskId,
            @RequestParam(required = false) String action,
            @org.springframework.web.bind.annotation.RequestAttribute(value = "userId", required = false) String userId,
            @org.springframework.web.bind.annotation.RequestAttribute(value = "departmentId", required = false) String departmentId) {
        UUID uid = parseUuid(userId);
        if (action != null && !action.isBlank()) {
            return service.listByTaskAndAction(taskId, action, uid, departmentId);
        }
        return service.listByTask(taskId, uid, departmentId);
    }

    @GetMapping("/{attachmentId}/download")
    @PreAuthorize("@authzService.canRead(authentication)")
    public ResponseEntity<Resource> download(
            @PathVariable UUID attachmentId,
            @org.springframework.web.bind.annotation.RequestAttribute(value = "userId", required = false) String userId,
            @org.springframework.web.bind.annotation.RequestAttribute(value = "departmentId", required = false) String departmentId) {
        UUID uid = parseUuid(userId);
        byte[] data = service.download(attachmentId, uid, departmentId);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"action-attachment\"")
                .body(new org.springframework.core.io.ByteArrayResource(data));
    }

    @DeleteMapping("/{attachmentId}")
    @PreAuthorize("isAuthenticated()")
    public void delete(
            @PathVariable UUID attachmentId,
            @RequestParam(required = false) UUID deletedBy) {
        service.delete(attachmentId, deletedBy);
    }

    private UUID parseUuid(String s) {
        if (s == null || s.isBlank()) return null;
        try { return UUID.fromString(s); } catch (IllegalArgumentException e) { return null; }
    }
}
