package com.example.taskmanagement.sso;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SsoSessionCache {

    private static final Logger log = LoggerFactory.getLogger(SsoSessionCache.class);

    private static final long DEFAULT_TTL_SECONDS = 3600;

    private final ConcurrentHashMap<String, CachedSession> cache = new ConcurrentHashMap<>();

    public void put(String sessionId, SsoUser user) {
        put(sessionId, user, DEFAULT_TTL_SECONDS);
    }

    public void put(String sessionId, SsoUser user, long ttlSeconds) {
        cache.put(sessionId, new CachedSession(user, Instant.now().plusSeconds(ttlSeconds)));
        log.debug("Cached session {} for user {}, TTL={}s", sessionId, user.getUsername(), ttlSeconds);
    }

    @SuppressWarnings("unchecked")
    public void putFromTokenResponse(String sessionId, Map<String, Object> tokenResponse) {
        Object userObj = tokenResponse.get("user");
        if (!(userObj instanceof Map)) {
            log.warn("No user object in token response for session {}", sessionId);
            return;
        }

        Map<String, Object> userMap = (Map<String, Object>) userObj;
        SsoUser user = new SsoUser();
        user.setUserId((String) userMap.getOrDefault("user_id", userMap.get("userId")));
        user.setUsername((String) userMap.get("username"));
        user.setEmail((String) userMap.get("email"));
        user.setDepartmentId((String) userMap.get("departmentId"));
        user.setDepartmentName((String) userMap.get("departmentName"));
        if (userMap.get("roles") instanceof List) {
            user.setRoles((List<String>) userMap.get("roles"));
        }
        if (userMap.get("permissions") instanceof List) {
            user.setPermissions((List<String>) userMap.get("permissions"));
        }

        long ttl = DEFAULT_TTL_SECONDS;
        Object expiresAt = tokenResponse.get("expires_at");
        if (expiresAt instanceof Number) {
            long expiresMs = ((Number) expiresAt).longValue();
            long ttlCalc = (expiresMs - System.currentTimeMillis()) / 1000;
            if (ttlCalc > 60) {
                ttl = ttlCalc;
            }
        }

        put(sessionId, user, ttl);
    }

    public SsoUser get(String sessionId) {
        if (sessionId == null) {
            return null;
        }
        CachedSession cached = cache.get(sessionId);
        if (cached == null) {
            return null;
        }
        if (Instant.now().isAfter(cached.expiresAt)) {
            cache.remove(sessionId);
            log.debug("Session {} expired, removed from cache", sessionId);
            return null;
        }
        return cached.user;
    }

    public void remove(String sessionId) {
        cache.remove(sessionId);
    }

    public int size() {
        return cache.size();
    }

    public void cleanup() {
        Instant now = Instant.now();
        cache.entrySet().removeIf(entry -> now.isAfter(entry.getValue().expiresAt));
    }

    private record CachedSession(SsoUser user, Instant expiresAt) {}
}
