package com.example.taskmanagement.controller;

import com.example.taskmanagement.security.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/tasks/debug")
public class DebugController {
    @Autowired
    private JwtUtil jwtUtil;

    @GetMapping("/ping")
    public Map<String, Object> ping() {
        return Map.of("ok", true);
    }

    @GetMapping("/parse-jwt")
    public Map<String, Object> parseJwt(@RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        Map<String, Object> result = new HashMap<>();
        result.put("hasAuthorizationHeader", authorizationHeader != null);
        if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) {
            result.put("ok", false);
            result.put("error", "missing_bearer");
            return result;
        }
        String token = authorizationHeader.substring(7);
        try {
            result.put("username", jwtUtil.extractUsername(token));
            result.put("userId", jwtUtil.extractUserId(token));
            result.put("departmentId", jwtUtil.extractDepartmentId(token));
            result.put("roles", jwtUtil.extractRoles(token));
            result.put("expired", jwtUtil.isTokenExpired(token));
            result.put("ok", true);
        } catch (Exception e) {
            result.put("ok", false);
            result.put("error", e.getClass().getName());
            result.put("message", e.getMessage());
        }
        return result;
    }

    @GetMapping("/authz-read")
    @PreAuthorize("@authzService.canRead(authentication)")
    public Map<String, Object> authzRead(Authentication authentication) {
        return Map.of(
                "ok", true,
                "name", authentication == null ? null : authentication.getName(),
                "authorities", authentication == null ? java.util.List.of() : authentication.getAuthorities().stream().map(a -> a.getAuthority()).toList()
        );
    }
}
