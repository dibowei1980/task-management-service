package com.example.taskmanagement.logging;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.stream.Collectors;

@Aspect
@Component
public class OperationLogAspect {
    private static final Logger log = LoggerFactory.getLogger(OperationLogAspect.class);
    private final LogSanitizer logSanitizer;

    public OperationLogAspect(LogSanitizer logSanitizer) {
        this.logSanitizer = logSanitizer;
    }

    @Around("execution(public * com.example.taskmanagement.controller..*(..)) || execution(public * com.example.taskmanagement.service.impl..*(..))")
    public Object logOperation(ProceedingJoinPoint joinPoint) throws Throwable {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        String className = signature.getDeclaringType().getSimpleName();
        String methodName = signature.getName();
        String operation = className + "." + methodName;
        String args = Arrays.stream(joinPoint.getArgs())
                .map(v -> v == null ? "null" : v.toString())
                .collect(Collectors.joining(", "));
        String previousOperation = MDC.get("operation");
        String previousDescription = MDC.get("description");
        String previousThreadId = MDC.get("threadId");
        MDC.put("operation", operation);
        MDC.put("description", logSanitizer.sanitize(args));
        MDC.put("threadId", String.valueOf(Thread.currentThread().getId()));
        long start = System.currentTimeMillis();
        try {
            if (log.isDebugEnabled()) {
                log.debug("operation_start");
            } else {
                log.info("operation_start");
            }
            Object result = joinPoint.proceed();
            long cost = System.currentTimeMillis() - start;
            log.info("operation_success durationMs={} resultType={}", cost, result == null ? "null" : result.getClass().getSimpleName());
            return result;
        } catch (Throwable ex) {
            long cost = System.currentTimeMillis() - start;
            log.error("operation_failed durationMs={} error={}", cost, logSanitizer.sanitize(ex.getMessage()), ex);
            throw ex;
        } finally {
            if (previousOperation == null) {
                MDC.remove("operation");
            } else {
                MDC.put("operation", previousOperation);
            }
            if (previousDescription == null) {
                MDC.remove("description");
            } else {
                MDC.put("description", previousDescription);
            }
            if (previousThreadId == null) {
                MDC.remove("threadId");
            } else {
                MDC.put("threadId", previousThreadId);
            }
        }
    }
}
