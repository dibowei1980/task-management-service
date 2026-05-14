package com.example.taskmanagement.logging;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class LogMonitorService {
    private static final Logger log = LoggerFactory.getLogger(LogMonitorService.class);

    @Value("${app.log.monitor.enabled:true}")
    private boolean enabled;

    @Value("${app.log.dir:./logs}")
    private String logDir;

    @Value("${app.log.monitor.max-file-size-mb:1024}")
    private long maxFileSizeMb;

    @Value("${app.log.monitor.error-patterns:timeout,python_exit_,output_not_found,Unhandled error}")
    private String errorPatterns;

    @Value("${app.log.monitor.cooldown-seconds:300}")
    private long cooldownSeconds;

    private Path runLogPath;
    private final Map<String, Long> lastAlertEpoch = new HashMap<>();

    @PostConstruct
    public void init() {
        this.runLogPath = Paths.get(logDir).toAbsolutePath().normalize().resolve("run.log");
    }

    @Scheduled(fixedDelayString = "${app.log.monitor.interval-ms:60000}")
    public void monitor() {
        if (!enabled) {
            return;
        }
        if (runLogPath == null || !Files.exists(runLogPath)) {
            return;
        }
        try {
            checkFileSize();
            checkErrorPatterns();
        } catch (Exception e) {
            withMonitorContext(() -> log.error("log_monitor_failed message={}", e.getMessage(), e));
        }
    }

    private void checkFileSize() throws IOException {
        long bytes = Files.size(runLogPath);
        long maxBytes = maxFileSizeMb * 1024L * 1024L;
        if (bytes > maxBytes) {
            emitAlert("file_size_exceeded", "run.log size=" + bytes + " max=" + maxBytes);
        }
    }

    private void checkErrorPatterns() throws IOException {
        List<String> patterns = List.of(errorPatterns.split(","));
        if (patterns.isEmpty()) {
            return;
        }
        String tail = readTail(runLogPath, 512 * 1024);
        String lowerTail = tail.toLowerCase();
        for (String p : patterns) {
            String pattern = p == null ? "" : p.trim();
            if (pattern.isBlank()) {
                continue;
            }
            if (lowerTail.contains(pattern.toLowerCase())) {
                emitAlert("pattern_detected:" + pattern, "matched pattern=" + pattern);
            }
        }
    }

    private void emitAlert(String key, String content) {
        long now = Instant.now().getEpochSecond();
        long last = lastAlertEpoch.getOrDefault(key, 0L);
        if (now - last < cooldownSeconds) {
            return;
        }
        lastAlertEpoch.put(key, now);
        withMonitorContext(() -> log.error("log_alert {}", content));
    }

    private String readTail(Path path, int maxBytes) throws IOException {
        long fileSize = Files.size(path);
        long start = Math.max(0, fileSize - maxBytes);
        byte[] data;
        try (RandomAccessFile raf = new RandomAccessFile(path.toFile(), "r")) {
            raf.seek(start);
            data = new byte[(int) (fileSize - start)];
            raf.readFully(data);
        }
        return new String(data, StandardCharsets.UTF_8);
    }

    private void withMonitorContext(Runnable action) {
        String previousOperation = MDC.get("operation");
        String previousDescription = MDC.get("description");
        String previousThreadId = MDC.get("threadId");
        MDC.put("operation", "LOG_MONITOR");
        MDC.put("description", "monitor_run_log");
        MDC.put("threadId", String.valueOf(Thread.currentThread().getId()));
        try {
            action.run();
        } finally {
            restore("operation", previousOperation);
            restore("description", previousDescription);
            restore("threadId", previousThreadId);
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
