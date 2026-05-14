package com.example.taskmanagement.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class LogContextFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        String requestId = request.getHeader("X-Request-Id");
        if (requestId == null || requestId.isBlank()) {
            requestId = UUID.randomUUID().toString();
        }
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String username = auth == null ? "anonymous" : String.valueOf(auth.getName());
        String operation = request.getMethod() + " " + request.getRequestURI();
        String description = request.getRemoteAddr() + " -> " + request.getRequestURI();
        MDC.put("requestId", requestId);
        MDC.put("threadId", String.valueOf(Thread.currentThread().getId()));
        MDC.put("username", username);
        MDC.put("operation", operation);
        MDC.put("description", description);
        try {
            filterChain.doFilter(request, response);
        } finally {
            MDC.clear();
        }
    }
}
