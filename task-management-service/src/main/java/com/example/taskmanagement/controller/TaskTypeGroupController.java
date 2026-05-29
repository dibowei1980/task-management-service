package com.example.taskmanagement.controller;

import com.example.taskmanagement.dto.TaskTypeGroupRequest;
import com.example.taskmanagement.dto.TaskTypeGroupResponse;
import com.example.taskmanagement.service.TaskTypeGroupService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/task-type-groups")
public class TaskTypeGroupController {

    private final TaskTypeGroupService service;

    public TaskTypeGroupController(TaskTypeGroupService service) {
        this.service = service;
    }

    @GetMapping
    public List<TaskTypeGroupResponse> list() {
        return service.listAll();
    }

    @GetMapping("/enabled")
    public List<TaskTypeGroupResponse> listEnabled() {
        return service.listEnabled();
    }

    @GetMapping("/{id}")
    public TaskTypeGroupResponse get(@PathVariable UUID id) {
        return service.getById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TaskTypeGroupResponse create(@RequestBody TaskTypeGroupRequest request) {
        return service.create(request);
    }

    @PutMapping("/{id}")
    public TaskTypeGroupResponse update(@PathVariable UUID id, @RequestBody TaskTypeGroupRequest request) {
        return service.update(id, request);
    }

    @PatchMapping("/{id}/toggle")
    public void toggle(@PathVariable UUID id, @RequestBody ToggleRequest request) {
        service.setEnabled(id, request.enabled);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.delete(id);
    }

    public record ToggleRequest(boolean enabled) {}
}
