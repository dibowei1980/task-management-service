package com.example.taskmanagement.controller;

import com.example.taskmanagement.dto.TaskTypeRequest;
import com.example.taskmanagement.dto.TaskTypeResponse;
import com.example.taskmanagement.service.TaskTypeService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/task-types")
public class TaskTypeController {

    private final TaskTypeService service;

    public TaskTypeController(TaskTypeService service) {
        this.service = service;
    }

    @GetMapping
    public List<TaskTypeResponse> list(@RequestParam(required = false) UUID groupId) {
        if (groupId != null) {
            return service.listByGroup(groupId);
        }
        return service.listAll();
    }

    @GetMapping("/{id}")
    public TaskTypeResponse get(@PathVariable UUID id) {
        return service.getById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TaskTypeResponse create(@RequestBody TaskTypeRequest request) {
        return service.create(request);
    }

    @PutMapping("/{id}")
    public TaskTypeResponse update(@PathVariable UUID id, @RequestBody TaskTypeRequest request) {
        return service.update(id, request);
    }

    @PatchMapping("/{id}/toggle")
    public void toggle(@PathVariable UUID id, @RequestBody ToggleRequest request) {
        service.setEnabled(id, request.enabled);
    }

    public record ToggleRequest(boolean enabled) {}
}
