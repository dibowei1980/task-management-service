package com.example.taskmanagement.controller;

import com.example.taskmanagement.dto.MeasurementUnitRequest;
import com.example.taskmanagement.dto.MeasurementUnitResponse;
import com.example.taskmanagement.service.MeasurementUnitService;
import org.springframework.http.HttpStatus;
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
@RequestMapping("/api/measurement-units")
public class MeasurementUnitController {
    private final MeasurementUnitService service;

    public MeasurementUnitController(MeasurementUnitService service) {
        this.service = service;
    }

    @GetMapping
    public List<MeasurementUnitResponse> list() {
        return service.listAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public MeasurementUnitResponse create(@RequestBody MeasurementUnitRequest request) {
        return service.create(request);
    }

    @PutMapping("/{id}")
    public MeasurementUnitResponse update(@PathVariable UUID id, @RequestBody MeasurementUnitRequest request) {
        return service.update(id, request);
    }

    @PatchMapping("/{id}/enabled")
    public MeasurementUnitResponse setEnabled(@PathVariable UUID id, @RequestBody ToggleRequest request) {
        return service.setEnabled(id, request.enabled);
    }

    public record ToggleRequest(boolean enabled) {}
}
