package com.example.taskmanagement.service;

import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class SseNotificationService {

    private static final Logger log = LoggerFactory.getLogger(SseNotificationService.class);
    private static final long SSE_TIMEOUT = 30 * 60 * 1000L;
    private static final long HEARTBEAT_INTERVAL_SECONDS = 30;

    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();
    private final AtomicLong eventId = new AtomicLong(0);
    private final ScheduledExecutorService heartbeatScheduler = Executors.newSingleThreadScheduledExecutor();

    @PreDestroy
    public void destroy() {
        heartbeatScheduler.shutdownNow();
        emitters.forEach(emitter -> {
            try { emitter.complete(); } catch (Exception ignored) {}
        });
        emitters.clear();
    }

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT);

        AtomicReference<ScheduledFuture<?>> heartbeatRef = new AtomicReference<>();

        ScheduledFuture<?> heartbeat = heartbeatScheduler.scheduleAtFixedRate(() -> {
            try {
                emitter.send(SseEmitter.event()
                        .name("heartbeat")
                        .data("{\"ts\":" + System.currentTimeMillis() + "}",
                                org.springframework.http.MediaType.APPLICATION_JSON));
            } catch (IOException e) {
                emitters.remove(emitter);
                ScheduledFuture<?> f = heartbeatRef.get();
                if (f != null) f.cancel(false);
            }
        }, HEARTBEAT_INTERVAL_SECONDS, HEARTBEAT_INTERVAL_SECONDS, TimeUnit.SECONDS);

        heartbeatRef.set(heartbeat);

        emitter.onCompletion(() -> {
            emitters.remove(emitter);
            heartbeat.cancel(false);
            log.info("SSE emitter completed, remaining: {}", emitters.size());
        });
        emitter.onTimeout(() -> {
            emitters.remove(emitter);
            heartbeat.cancel(false);
            log.info("SSE emitter timed out, remaining: {}", emitters.size());
        });
        emitter.onError(e -> {
            emitters.remove(emitter);
            heartbeat.cancel(false);
            log.info("SSE emitter error, remaining: {}", emitters.size());
        });

        emitters.add(emitter);
        log.info("SSE emitter added, total: {}", emitters.size());

        try {
            emitter.send(SseEmitter.event()
                    .name("connected")
                    .data("{\"message\":\"SSE connected\",\"ts\":" + System.currentTimeMillis() + "}",
                            org.springframework.http.MediaType.APPLICATION_JSON));
        } catch (IOException e) {
            emitters.remove(emitter);
            heartbeat.cancel(false);
            log.warn("Failed to send initial connected event");
        }

        return emitter;
    }

    public void notifyTaskChange(String action, Object taskId) {
        log.info("SSE notifyTaskChange: action={}, taskId={}, subscribers={}", action, taskId, emitters.size());
        Map<String, Object> data = Map.of(
                "event", "task-change",
                "action", action,
                "taskId", String.valueOf(taskId),
                "timestamp", System.currentTimeMillis()
        );
        broadcast(data);
    }

    private void broadcast(Map<String, Object> data) {
        long id = eventId.incrementAndGet();
        List<SseEmitter> dead = new java.util.ArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event()
                        .id(String.valueOf(id))
                        .name("task-change")
                        .data(data, org.springframework.http.MediaType.APPLICATION_JSON));
            } catch (IOException e) {
                dead.add(emitter);
            }
        }
        if (!dead.isEmpty()) {
            emitters.removeAll(dead);
            log.info("Removed {} dead SSE emitters, remaining: {}", dead.size(), emitters.size());
        }
    }
}
