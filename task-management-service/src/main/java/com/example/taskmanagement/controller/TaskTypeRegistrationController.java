package com.example.taskmanagement.controller;

import com.example.taskmanagement.dto.TaskTypeRegistrationRequest;
import com.example.taskmanagement.dto.TaskTypeRegistrationResponse;
import com.example.taskmanagement.service.TaskTypeRegistrationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import jakarta.annotation.security.PermitAll;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/task-type-registrations")
@Tag(name = "Task Type Registration", description = "任务类型注册申请与审批")
public class TaskTypeRegistrationController {

    private final TaskTypeRegistrationService service;

    public TaskTypeRegistrationController(TaskTypeRegistrationService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "提交任务类型注册申请")
    @PermitAll
    public TaskTypeRegistrationResponse submit(@RequestBody TaskTypeRegistrationRequest request) {
        return service.submit(request);
    }

    @GetMapping
    @Operation(summary = "列出所有注册申请")
    @PreAuthorize("@authzService.canRead(authentication)")
    public List<TaskTypeRegistrationResponse> list(@RequestParam(required = false) String status) {
        if (status != null && !status.isBlank()) {
            return service.listByStatus(status);
        }
        return service.listAll();
    }

    @GetMapping("/{id}")
    @Operation(summary = "获取注册申请详情")
    @PreAuthorize("@authzService.canRead(authentication)")
    public TaskTypeRegistrationResponse getById(@PathVariable UUID id) {
        return service.getById(id);
    }

    @PostMapping("/{id}/approve")
    @Operation(summary = "审批通过注册申请")
    @PreAuthorize("hasAuthority('system:admin')")
    public TaskTypeRegistrationResponse approve(
            @PathVariable UUID id,
            @RequestBody ApproveRequest request,
            Authentication authentication) {
        String reviewer = authentication.getName();
        return service.approve(id, request.targetGroupId(), reviewer);
    }

    @PostMapping("/{id}/reject")
    @Operation(summary = "审批拒绝注册申请")
    @PreAuthorize("hasAuthority('system:admin')")
    public TaskTypeRegistrationResponse reject(
            @PathVariable UUID id,
            @RequestBody RejectRequest request,
            Authentication authentication) {
        String reviewer = authentication.getName();
        return service.reject(id, request.rejectReason(), reviewer);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除已拒绝的注册申请")
    @PreAuthorize("hasAuthority('system:admin')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.delete(id);
    }

    public record ApproveRequest(UUID targetGroupId) {}
    public record RejectRequest(String rejectReason) {}
    public record UpdateCallbackFieldsRequest(List<String> callbackFields) {}

    @PutMapping("/{id}/callback-fields")
    @Operation(summary = "更新回传字段配置")
    @PreAuthorize("hasAuthority('system:admin')")
    public TaskTypeRegistrationResponse updateCallbackFields(
            @PathVariable UUID id,
            @RequestBody UpdateCallbackFieldsRequest request) {
        return service.updateCallbackFields(id, request.callbackFields());
    }
}