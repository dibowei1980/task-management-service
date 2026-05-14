package com.example.taskmanagement.logging;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import org.slf4j.LoggerFactory;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/tasks/logs")
public class LogQueryController {
    private final LogQueryService logQueryService;

    public LogQueryController(LogQueryService logQueryService) {
        this.logQueryService = logQueryService;
    }

    @GetMapping("/query")
    @PreAuthorize("@authzService.canRead(authentication)")
    public Map<String, Object> query(
            @RequestParam(value = "from", required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss.SSS") LocalDateTime from,
            @RequestParam(value = "to", required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss.SSS") LocalDateTime to,
            @RequestParam(value = "levels", required = false) List<String> levels,
            @RequestParam(value = "keyword", required = false) String keyword,
            @RequestParam(value = "limit", required = false, defaultValue = "200") int limit
    ) throws IOException {
        Set<String> normalizedLevels = levels == null ? Set.of() : levels.stream()
                .map(v -> v == null ? "" : v.trim().toUpperCase(Locale.ROOT))
                .filter(v -> !v.isBlank())
                .map(v -> "WARNING".equals(v) ? "WARN" : v)
                .collect(Collectors.toSet());
        List<Map<String, Object>> rows = logQueryService.query(from, to, normalizedLevels, keyword, limit);
        Map<String, Object> out = new HashMap<>();
        out.put("count", rows.size());
        out.put("items", rows);
        return out;
    }

    @PatchMapping("/level")
    @PreAuthorize("@authzService.canUpdate(authentication)")
    public Map<String, Object> setLevel(
            @RequestParam("logger") String logger,
            @RequestParam("level") String level
    ) {
        LoggerContext context = (LoggerContext) LoggerFactory.getILoggerFactory();
        ch.qos.logback.classic.Logger target = context.getLogger(logger);
        Level targetLevel = Level.toLevel(level == null ? "INFO" : level.toUpperCase(Locale.ROOT), Level.INFO);
        target.setLevel(targetLevel);
        return Map.of(
                "logger", logger,
                "level", targetLevel.levelStr
        );
    }
}
