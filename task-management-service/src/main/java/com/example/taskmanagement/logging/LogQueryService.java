package com.example.taskmanagement.logging;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.GZIPInputStream;

@Service
public class LogQueryService {
    private static final DateTimeFormatter TS_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS");

    @Value("${app.log.dir:./logs}")
    private String logDir;

    public List<Map<String, Object>> query(LocalDateTime from, LocalDateTime to, Set<String> levels, String keyword, int limit) throws IOException {
        int safeLimit = Math.max(1, Math.min(1000, limit));
        Path dir = Paths.get(logDir).toAbsolutePath().normalize();
        List<Path> files = listLogFiles(dir);
        Deque<Map<String, Object>> buffer = new ArrayDeque<>();
        String keywordLower = keyword == null ? "" : keyword.toLowerCase(Locale.ROOT);
        for (Path file : files) {
            if (file.getFileName().toString().endsWith(".gz")) {
                readGzip(file, from, to, levels, keywordLower, safeLimit, buffer);
            } else {
                readText(file, from, to, levels, keywordLower, safeLimit, buffer);
            }
        }
        return new ArrayList<>(buffer);
    }

    private List<Path> listLogFiles(Path root) throws IOException {
        List<Path> files = new ArrayList<>();
        Path active = root.resolve("run.log");
        if (Files.exists(active)) {
            files.add(active);
        }
        Path archive = root.resolve("archive");
        if (Files.exists(archive) && Files.isDirectory(archive)) {
            try (var stream = Files.list(archive)) {
                files.addAll(stream
                        .filter(Files::isRegularFile)
                        .filter(p -> {
                            String name = p.getFileName().toString();
                            return name.endsWith(".log") || name.endsWith(".log.gz");
                        })
                        .toList());
            }
        }
        files.sort(Comparator.comparingLong(this::lastModifiedSafe));
        return files;
    }

    private long lastModifiedSafe(Path path) {
        try {
            return Files.getLastModifiedTime(path).toMillis();
        } catch (IOException ignored) {
            return 0L;
        }
    }

    private void readText(Path file, LocalDateTime from, LocalDateTime to, Set<String> levels, String keywordLower, int limit, Deque<Map<String, Object>> out) throws IOException {
        try (BufferedReader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                collectLine(line, from, to, levels, keywordLower, limit, out);
            }
        }
    }

    private void readGzip(Path file, LocalDateTime from, LocalDateTime to, Set<String> levels, String keywordLower, int limit, Deque<Map<String, Object>> out) throws IOException {
        try (var raw = Files.newInputStream(file);
             var gzip = new GZIPInputStream(raw);
             var reader = new BufferedReader(new InputStreamReader(gzip, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                collectLine(line, from, to, levels, keywordLower, limit, out);
            }
        }
    }

    private void collectLine(String line, LocalDateTime from, LocalDateTime to, Set<String> levels, String keywordLower, int limit, Deque<Map<String, Object>> out) {
        if (line == null || line.isBlank()) {
            return;
        }
        if (!keywordLower.isBlank() && !line.toLowerCase(Locale.ROOT).contains(keywordLower)) {
            return;
        }
        Map<String, Object> parsed = parseLine(line);
        String level = String.valueOf(parsed.getOrDefault("level", ""));
        if (levels != null && !levels.isEmpty() && !levels.contains(normalizeLevel(level))) {
            return;
        }
        LocalDateTime ts = parseTimestamp(String.valueOf(parsed.getOrDefault("timestamp", "")));
        if (from != null && (ts == null || ts.isBefore(from))) {
            return;
        }
        if (to != null && (ts == null || ts.isAfter(to))) {
            return;
        }
        out.addLast(parsed);
        while (out.size() > limit) {
            out.removeFirst();
        }
    }

    private Map<String, Object> parseLine(String line) {
        Map<String, Object> m = new HashMap<>();
        if (line.length() >= 23) {
            m.put("timestamp", line.substring(0, 23));
        } else {
            m.put("timestamp", "");
        }
        m.put("raw", line);
        m.put("level", extractByKey(line, "level"));
        m.put("thread", extractByKey(line, "thread"));
        m.put("threadId", extractByKey(line, "tid"));
        m.put("operation", extractByKey(line, "op"));
        m.put("description", extractByKey(line, "desc"));
        m.put("requestId", extractByKey(line, "req"));
        m.put("username", extractByKey(line, "user"));
        m.put("logger", extractByKey(line, "logger"));
        m.put("message", extractByKey(line, "msg"));
        return m;
    }

    private String extractByKey(String line, String key) {
        String mark = key + "=";
        int start = line.indexOf(mark);
        if (start < 0) {
            return "";
        }
        int valueStart = start + mark.length();
        int next = line.length();
        String[] keys = {" level=", " thread=", " tid=", " op=", " desc=", " req=", " user=", " logger=", " msg="};
        for (String k : keys) {
            int idx = line.indexOf(k, valueStart);
            if (idx >= 0 && idx < next) {
                next = idx;
            }
        }
        return line.substring(valueStart, next).trim();
    }

    private LocalDateTime parseTimestamp(String ts) {
        try {
            return LocalDateTime.parse(ts, TS_FORMAT);
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    private String normalizeLevel(String value) {
        String s = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        if ("WARNING".equals(s)) {
            return "WARN";
        }
        return s;
    }
}
