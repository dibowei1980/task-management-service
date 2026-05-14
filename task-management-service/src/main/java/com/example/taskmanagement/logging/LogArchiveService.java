package com.example.taskmanagement.logging;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.stream.Stream;

@Service
public class LogArchiveService {
    private static final Logger log = LoggerFactory.getLogger(LogArchiveService.class);

    @Value("${app.log.dir:./logs}")
    private String logDir;

    @Value("${app.log.archive.retention-days:30}")
    private int retentionDays;

    @Scheduled(cron = "${app.log.archive.cleanup-cron:0 10 3 * * *}")
    public void cleanupArchive() {
        Path archiveDir = Paths.get(logDir).toAbsolutePath().normalize().resolve("archive");
        if (!Files.exists(archiveDir)) {
            return;
        }
        Instant cutoff = Instant.now().minus(retentionDays, ChronoUnit.DAYS);
        long deleted = 0;
        try (Stream<Path> stream = Files.list(archiveDir)) {
            for (Path p : stream.toList()) {
                if (!Files.isRegularFile(p)) {
                    continue;
                }
                Instant lastModified = Files.getLastModifiedTime(p).toInstant();
                if (lastModified.isBefore(cutoff)) {
                    Files.deleteIfExists(p);
                    deleted += 1;
                }
            }
        } catch (IOException e) {
            withContext(() -> log.error("archive_cleanup_failed message={}", e.getMessage(), e));
            return;
        }
        if (deleted > 0) {
            long deletedCount = deleted;
            withContext(() -> log.info("archive_cleanup_deleted_files={}", deletedCount));
        }
    }

    private void withContext(Runnable action) {
        String previousOperation = MDC.get("operation");
        String previousDescription = MDC.get("description");
        String previousThreadId = MDC.get("threadId");
        MDC.put("operation", "LOG_ARCHIVE");
        MDC.put("description", "cleanup_archive");
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
