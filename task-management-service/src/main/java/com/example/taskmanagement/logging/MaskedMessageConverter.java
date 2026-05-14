package com.example.taskmanagement.logging;

import ch.qos.logback.classic.pattern.MessageConverter;
import ch.qos.logback.classic.spi.ILoggingEvent;

public class MaskedMessageConverter extends MessageConverter {
    private static final String[] PATTERNS = new String[] {
            "(?i)(authorization\\s*[:=]\\s*bearer\\s+)[^\\s,;]+",
            "(?i)(token\\s*[:=]\\s*)[^\\s,;]+",
            "(?i)(password\\s*[:=]\\s*)[^\\s,;]+",
            "(?i)(secret\\s*[:=]\\s*)[^\\s,;]+",
            "(?i)(api[-_]?key\\s*[:=]\\s*)[^\\s,;]+"
    };

    @Override
    public String convert(ILoggingEvent event) {
        String msg = event.getFormattedMessage();
        if (msg == null || msg.isBlank()) {
            return "";
        }
        String masked = msg;
        for (String pattern : PATTERNS) {
            masked = masked.replaceAll(pattern, "$1***");
        }
        return masked;
    }
}
