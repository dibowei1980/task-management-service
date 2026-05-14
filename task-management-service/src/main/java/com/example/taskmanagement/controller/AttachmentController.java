package com.example.taskmanagement.controller;

import com.example.taskmanagement.dto.AttachmentResponse;
import com.example.taskmanagement.service.AttachmentService;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/attachments")
public class AttachmentController {

    private final AttachmentService service;

    public AttachmentController(AttachmentService service) {
        this.service = service;
    }

    @GetMapping("/task/{taskId}")
    public List<AttachmentResponse> list(@PathVariable UUID taskId) {
        return service.listByTask(taskId);
    }

    @PostMapping("/task/{taskId}")
    @ResponseStatus(HttpStatus.CREATED)
    public AttachmentResponse upload(
            @PathVariable UUID taskId,
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) UUID uploadedBy,
            @RequestParam(required = false) String uploadedByName) {
        return service.upload(taskId, file, uploadedBy, uploadedByName);
    }

    @GetMapping("/{attachmentId}/download")
    public ResponseEntity<Resource> download(@PathVariable UUID attachmentId) {
        byte[] data = service.download(attachmentId);
        ByteArrayResource resource = new ByteArrayResource(data);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename("attachment").build().toString())
                .body(resource);
    }

    @DeleteMapping("/task/{taskId}/{attachmentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
            @PathVariable UUID taskId,
            @PathVariable UUID attachmentId,
            @RequestParam(required = false) UUID deletedBy) {
        service.delete(taskId, attachmentId, deletedBy);
    }
}
