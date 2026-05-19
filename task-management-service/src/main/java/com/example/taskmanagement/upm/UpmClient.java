package com.example.taskmanagement.upm;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class UpmClient {

    private static final Logger log = LoggerFactory.getLogger(UpmClient.class);

    @Value("${upm.base-url:http://localhost:8081}")
    private String upmBaseUrl;

    @Value("${upm.internal.api.key:}")
    private String internalApiKey;

    @Value("${upm.api.token:}")
    private String apiToken;

    private final RestTemplate restTemplate = new RestTemplate();

    private static final long TOKEN_TTL_MS = 3600_000L;

    private static class TokenEntry {
        final String token;
        final long expiresAt;
        TokenEntry(String token, long expiresAt) {
            this.token = token;
            this.expiresAt = expiresAt;
        }
        boolean isExpired() {
            return System.currentTimeMillis() >= expiresAt;
        }
    }

    private final ConcurrentHashMap<String, TokenEntry> userTokenCache = new ConcurrentHashMap<>();

    public void cacheUserToken(String username, String upmToken) {
        if (username == null || upmToken == null || upmToken.isBlank()) return;
        userTokenCache.put(username, new TokenEntry(upmToken, System.currentTimeMillis() + TOKEN_TTL_MS));
        log.debug("Cached UPM token for user: {}", username);
    }

    public String getCachedUserToken(String username) {
        if (username == null) return null;
        TokenEntry entry = userTokenCache.get(username);
        if (entry == null || entry.isExpired()) {
            userTokenCache.remove(username);
            return null;
        }
        return entry.token;
    }

    public void evictUserToken(String username) {
        if (username != null) {
            userTokenCache.remove(username);
        }
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> login(String username, String password) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (internalApiKey != null && !internalApiKey.isBlank()) {
            headers.set("X-Internal-Api-Key", internalApiKey);
        }

        Map<String, String> body = Map.of(
                "username", username,
                "password", password
        );

        HttpEntity<Map<String, String>> entity = new HttpEntity<>(body, headers);

        ResponseEntity<Map> response = restTemplate.postForEntity(
                upmBaseUrl + "/auth/login",
                entity,
                Map.class
        );

        if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
            log.info("UPM login successful for user: {}", username);
            return response.getBody();
        }

        throw new RuntimeException("UPM login failed: " + response.getStatusCode());
    }

    private String resolveToken(String userToken) {
        if (userToken != null && !userToken.isBlank()) {
            return userToken;
        }
        return getServiceToken();
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getUsers(String userToken) {
        try {
            String token = resolveToken(userToken);
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(token);
            HttpEntity<Void> entity = new HttpEntity<>(headers);

            ResponseEntity<List> response = restTemplate.exchange(
                    upmBaseUrl + "/api/users?size=100",
                    HttpMethod.GET,
                    entity,
                    List.class
            );

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return response.getBody();
            }

            if (response.getStatusCode() == HttpStatus.FORBIDDEN) {
                log.warn("UPM /api/users returned 403, token may have expired.");
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.error("UPM /api/users call failed: {}", e.getMessage());
        }

        return List.of();
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> searchUsers(String userToken, String roleName, String permissionCode,
                                                  String username, String email,
                                                  Boolean isActive, String createdFrom, String createdTo) {
        try {
            String token = resolveToken(userToken);
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(token);
            HttpEntity<Void> entity = new HttpEntity<>(headers);

            StringBuilder url = new StringBuilder(upmBaseUrl).append("/api/users/search?");
            boolean first = true;
            if (roleName != null && !roleName.isBlank()) {
                url.append("roleName=").append(URLEncoder.encode(roleName, StandardCharsets.UTF_8));
                first = false;
            }
            if (permissionCode != null && !permissionCode.isBlank()) {
                if (!first) url.append("&");
                url.append("permissionCode=").append(encodeQueryParam(permissionCode));
                first = false;
            }
            if (username != null && !username.isBlank()) {
                if (!first) url.append("&");
                url.append("username=").append(URLEncoder.encode(username, StandardCharsets.UTF_8));
                first = false;
            }
            if (email != null && !email.isBlank()) {
                if (!first) url.append("&");
                url.append("email=").append(URLEncoder.encode(email, StandardCharsets.UTF_8));
                first = false;
            }
            if (isActive != null) {
                if (!first) url.append("&");
                url.append("isActive=").append(isActive);
                first = false;
            }
            if (createdFrom != null && !createdFrom.isBlank()) {
                if (!first) url.append("&");
                url.append("createdFrom=").append(URLEncoder.encode(createdFrom, StandardCharsets.UTF_8));
                first = false;
            }
            if (createdTo != null && !createdTo.isBlank()) {
                if (!first) url.append("&");
                url.append("createdTo=").append(URLEncoder.encode(createdTo, StandardCharsets.UTF_8));
            }

            ResponseEntity<List> response = restTemplate.exchange(
                    url.toString(),
                    HttpMethod.GET,
                    entity,
                    List.class
            );

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return response.getBody();
            }

            if (response.getStatusCode() == HttpStatus.FORBIDDEN) {
                log.warn("UPM /api/users/search returned 403, token may have expired.");
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (org.springframework.web.client.HttpClientErrorException.Forbidden e) {
            log.warn("UPM /api/users/search returned 403, token lacks permission: {}", e.getMessage());
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            log.warn("UPM /api/users/search returned {}: {}", e.getStatusCode(), e.getMessage());
        } catch (Exception e) {
            log.warn("UPM /api/users/search failed: {}", e.getMessage());
        }

        return List.of();
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getDepartments(String userToken) {
        try {
            String token = resolveToken(userToken);
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(token);
            HttpEntity<Void> entity = new HttpEntity<>(headers);

            ResponseEntity<List> response = restTemplate.exchange(
                    upmBaseUrl + "/api/departments",
                    HttpMethod.GET,
                    entity,
                    List.class
            );

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return response.getBody();
            }

            if (response.getStatusCode() == HttpStatus.FORBIDDEN) {
                log.warn("UPM /api/departments returned 403, token may have expired.");
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.error("UPM /api/departments call failed: {}", e.getMessage());
        }

        return List.of();
    }

    @SuppressWarnings("unchecked")
    public Set<String> getOauthClientIds() {
        try {
            HttpHeaders headers = new HttpHeaders();
            if (internalApiKey != null && !internalApiKey.isBlank()) {
                headers.set("X-Internal-Api-Key", internalApiKey);
            } else {
                String token = getServiceToken();
                headers.setBearerAuth(token);
            }
            HttpEntity<Void> entity = new HttpEntity<>(headers);

            String url = (internalApiKey != null && !internalApiKey.isBlank())
                    ? upmBaseUrl + "/api/oauth-clients/internal/list"
                    : upmBaseUrl + "/api/oauth-clients";

            ResponseEntity<Map> response = restTemplate.exchange(
                    url,
                    HttpMethod.GET,
                    entity,
                    Map.class
            );

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Set<String> clientIds = new HashSet<>();
                Object clientsObj = response.getBody().get("clients");
                List<?> clients = (clientsObj instanceof List<?>) ? (List<?>) clientsObj : List.of();
                for (Object item : clients) {
                    if (!(item instanceof Map<?, ?> map)) {
                        continue;
                    }
                    Object v = map.get("clientId");
                    if (v == null) v = map.get("client_id");
                    if (v == null) v = map.get("id");
                    if (v != null) {
                        String clientId = String.valueOf(v).trim();
                        if (!clientId.isEmpty()) {
                            clientIds.add(clientId);
                        }
                    }
                }
                return clientIds;
            }

            if (response.getStatusCode() == HttpStatus.FORBIDDEN) {
                log.warn("UPM OAuth clients endpoint returned 403, credentials may have expired.");
            }
        } catch (Exception e) {
            log.warn("UPM OAuth clients fetch failed: {}", e.getMessage());
        }

        return Set.of();
    }

    private String getServiceToken() {
        if (apiToken != null && !apiToken.isBlank()) {
            return apiToken;
        }
        throw new IllegalStateException(
            "UPM 认证未配置。请设置 UPM_API_TOKEN（需具有 user:read 和 department:read 权限），"
            + "或确保登录用户具有 user:read/department:read 权限。");
    }

    private String encodeQueryParam(String value) {
        if (value == null) return "";
        return URLEncoder.encode(value, StandardCharsets.UTF_8)
                .replace("+", "%20")
                .replace("%3A", ":")
                .replace("%3a", ":");
    }
}
