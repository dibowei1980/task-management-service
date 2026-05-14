package com.example.taskmanagement.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.security.access.AccessDeniedException;

import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException e) {
        withContext("API_BAD_REQUEST", e.getMessage(), () -> log.warn("bad_request {}", e.getMessage()));
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                "error", "bad_request",
                "message", e.getMessage() == null ? "invalid_request" : e.getMessage()
        ));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> handleAccessDenied(AccessDeniedException e) {
        withContext("API_FORBIDDEN", e.getMessage(), () -> log.warn("forbidden {}", e.getMessage()));
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                "error", "forbidden",
                "message", e.getMessage() == null ? "forbidden" : e.getMessage()
        ));
    }

    @ExceptionHandler(com.example.taskmanagement.exception.NotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNotFound(com.example.taskmanagement.exception.NotFoundException e) {
        withContext("API_NOT_FOUND", e.getMessage(), () -> log.warn("not_found {}", e.getMessage()));
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
                "error", "not_found",
                "message", e.getMessage() == null ? "not_found" : e.getMessage()
        ));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleException(Exception e) {
        withContext("API_INTERNAL_ERROR", e.getMessage(), () -> log.error("Unhandled error", e));
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                "error", "internal_server_error",
                "exception", e.getClass().getName(),
                "message", e.getMessage() == null ? "" : e.getMessage()
        ));
    }

    private void withContext(String operation, String description, Runnable action) {
        String prevOperation = MDC.get("operation");
        String prevDescription = MDC.get("description");
        String prevThreadId = MDC.get("threadId");
        MDC.put("operation", operation);
        MDC.put("description", description == null ? "" : description);
        MDC.put("threadId", String.valueOf(Thread.currentThread().getId()));
        try {
            action.run();
        } finally {
            restore("operation", prevOperation);
            restore("description", prevDescription);
            restore("threadId", prevThreadId);
        }
    }

    private void restore(String key, String value) {
        if (value == null) {
            MDC.remove(key);
        } else {
            MDC.put(key, value);
        }
    }
}
