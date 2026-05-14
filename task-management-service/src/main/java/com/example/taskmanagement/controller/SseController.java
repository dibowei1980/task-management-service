package com.example.taskmanagement.controller;

import com.example.taskmanagement.service.SseNotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/sse")
@Tag(name = "SSE Notifications", description = "Server-Sent Events for real-time task updates")
public class SseController {

    private final SseNotificationService sseNotificationService;

    public SseController(SseNotificationService sseNotificationService) {
        this.sseNotificationService = sseNotificationService;
    }

    @GetMapping(value = "/subscribe", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "Subscribe to task change notifications via SSE")
    public SseEmitter subscribe() {
        return sseNotificationService.subscribe();
    }
}
