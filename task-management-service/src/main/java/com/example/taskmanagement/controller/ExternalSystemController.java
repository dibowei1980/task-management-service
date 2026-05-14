package com.example.taskmanagement.controller;

import com.example.taskmanagement.dto.ExternalSystemRegistrationRequest;
import com.example.taskmanagement.model.ExternalSystemRegistration;
import com.example.taskmanagement.service.ExternalSystemService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import jakarta.annotation.security.PermitAll;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.LinkedHashSet;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/external-systems")
@Tag(name = "External System Registration", description = "APIs for managing external system registrations")
public class ExternalSystemController {

    @Autowired
    private ExternalSystemService externalSystemService;

    @PostMapping("/register")
    @Operation(summary = "Register an external system")
    @PermitAll
    public ResponseEntity<?> register(@RequestBody ExternalSystemRegistrationRequest request) {
        try {
            ExternalSystemRegistration registration = externalSystemService.register(request);
            return ResponseEntity.ok(registration);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping
    @Operation(summary = "List all registered external systems")
    @PreAuthorize("@authzService.canRead(authentication)")
    public ResponseEntity<List<ExternalSystemRegistration>> listAll() {
        return ResponseEntity.ok(externalSystemService.findAll());
    }

    @GetMapping("/{systemId}")
    @Operation(summary = "Get external system details")
    @PreAuthorize("@authzService.canRead(authentication)")
    public ResponseEntity<ExternalSystemRegistration> getById(@PathVariable String systemId) {
        return externalSystemService.findById(systemId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{systemId}")
    @Operation(summary = "Unregister an external system")
    @PreAuthorize("@authzService.canDelete(authentication)")
    public ResponseEntity<Void> unregister(@PathVariable String systemId) {
        externalSystemService.unregister(systemId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/task-types")
    @Operation(summary = "List all supported task types from registered external systems")
    @PreAuthorize("@authzService.canRead(authentication)")
    public ResponseEntity<List<Map<String, String>>> listTaskTypes() {
        List<ExternalSystemRegistration> systems = externalSystemService.findAll();
        Set<String> seen = new LinkedHashSet<>();
        List<Map<String, String>> types = systems.stream()
                .flatMap(sys -> {
                    String[] typeArr = sys.getSupportedTaskTypes().split(",");
                    return java.util.Arrays.stream(typeArr)
                            .map(String::trim)
                            .filter(t -> !t.isEmpty() && seen.add(t))
                            .map(t -> Map.of("type", t, "source", sys.getDisplayName()));
                })
                .collect(Collectors.toList());
        return ResponseEntity.ok(types);
    }
}
