package com.example.taskmanagement.controller;

import com.example.taskmanagement.dto.ProjectTypeRequest;
import com.example.taskmanagement.dto.ProjectTypeResponse;
import com.example.taskmanagement.service.ProjectTypeService;
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
@RequestMapping("/api/project-types")
public class ProjectTypeController {
    private final ProjectTypeService service;

    public ProjectTypeController(ProjectTypeService service) {
        this.service = service;
    }

    @GetMapping
    public List<ProjectTypeResponse> list() {
        return service.listAll();
    }

    @GetMapping("/by-code/{code}")
    public ProjectTypeResponse getByCode(@PathVariable String code) {
        return service.getByCode(code);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProjectTypeResponse create(@RequestBody ProjectTypeRequest request) {
        return service.create(request);
    }

    @PutMapping("/{id}")
    public ProjectTypeResponse update(@PathVariable UUID id, @RequestBody ProjectTypeRequest request) {
        return service.update(id, request);
    }

    @PatchMapping("/{id}/enabled")
    public ProjectTypeResponse setEnabled(@PathVariable UUID id, @RequestBody ToggleRequest request) {
        return service.setEnabled(id, request.enabled);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.delete(id);
    }

    public record ToggleRequest(boolean enabled) {}
}
