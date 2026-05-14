package com.example.taskmanagement.service;

import com.example.taskmanagement.upm.UpmClient;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class SsoClientWhitelistService {
    private static final Logger log = LoggerFactory.getLogger(SsoClientWhitelistService.class);

    @Autowired
    private UpmClient upmClient;

    @Value("${sso.client-whitelist.bootstrap:}")
    private String bootstrapWhitelist;

    private final Set<String> whitelist = ConcurrentHashMap.newKeySet();

    @PostConstruct
    public void init() {
        reloadWhitelist();
    }

    @Scheduled(fixedDelayString = "${sso.client-whitelist.refresh-ms:300000}")
    public void scheduledRefresh() {
        reloadWhitelist();
    }

    public boolean isAllowed(String clientId) {
        if (clientId == null || clientId.isBlank()) {
            return false;
        }
        return whitelist.contains(clientId.trim());
    }

    public Set<String> getWhitelistSnapshot() {
        return Set.copyOf(whitelist);
    }

    private synchronized void reloadWhitelist() {
        Set<String> fromUpm = Set.of();
        try {
            fromUpm = upmClient.getOauthClientIds();
        } catch (Exception e) {
            log.warn("Failed to fetch OAuth client IDs from UPM: {}", e.getMessage());
        }
        Set<String> merged = ConcurrentHashMap.newKeySet();
        merged.addAll(fromUpm);
        merged.addAll(parseBootstrapWhitelist());

        if (!merged.isEmpty()) {
            whitelist.clear();
            whitelist.addAll(merged);
            log.info("SSO client whitelist refreshed, size={}", whitelist.size());
            return;
        }

        if (whitelist.isEmpty()) {
            log.warn("SSO client whitelist remains empty after refresh; registrations will be rejected.");
        } else {
            log.warn("SSO client whitelist refresh returned empty, keep previous cache size={}", whitelist.size());
        }
    }

    private Set<String> parseBootstrapWhitelist() {
        if (bootstrapWhitelist == null || bootstrapWhitelist.isBlank()) {
            return Set.of();
        }
        Set<String> ids = ConcurrentHashMap.newKeySet();
        Arrays.stream(bootstrapWhitelist.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .forEach(ids::add);
        return ids;
    }
}
