package com.example.taskmanagement.logging;

import org.springframework.stereotype.Component;

@Component
public class LogSanitizer {
    public String sanitize(String input) {
        if (input == null || input.isBlank()) {
            return input;
        }
        return input
                .replaceAll("(?i)(authorization\\s*[:=]\\s*bearer\\s+)[^\\s,;]+", "$1***")
                .replaceAll("(?i)(token\\s*[:=]\\s*)[^\\s,;]+", "$1***")
                .replaceAll("(?i)(password\\s*[:=]\\s*)[^\\s,;]+", "$1***")
                .replaceAll("(?i)(secret\\s*[:=]\\s*)[^\\s,;]+", "$1***")
                .replaceAll("(?i)(api[-_]?key\\s*[:=]\\s*)[^\\s,;]+", "$1***");
    }
}
