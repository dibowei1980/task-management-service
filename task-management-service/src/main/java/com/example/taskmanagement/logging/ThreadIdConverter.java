package com.example.taskmanagement.logging;

import ch.qos.logback.classic.pattern.ClassicConverter;
import ch.qos.logback.classic.spi.ILoggingEvent;

public class ThreadIdConverter extends ClassicConverter {
    @Override
    public String convert(ILoggingEvent event) {
        String mdcThreadId = event.getMDCPropertyMap() == null ? null : event.getMDCPropertyMap().get("threadId");
        if (mdcThreadId != null && !mdcThreadId.isBlank()) {
            return mdcThreadId;
        }
        return "-1";
    }
}
