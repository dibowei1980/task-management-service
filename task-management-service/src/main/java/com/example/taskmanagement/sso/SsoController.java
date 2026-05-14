package com.example.taskmanagement.sso;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import com.example.taskmanagement.upm.UpmClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/sso")
@CrossOrigin(origins = "${app.cors.allowed-origins:http://localhost:5173,http://localhost:5174}")
public class SsoController {

    private static final Logger log = LoggerFactory.getLogger(SsoController.class);

    @Value("${sso.base-url:http://localhost:8080}")
    private String ssoBaseUrl;

    @Value("${sso.client-id:task-management-service}")
    private String clientId;

    @Value("${sso.client-secret:}")
    private String clientSecret;

    @Value("${sso.redirect-uri:http://localhost:5173/sso/callback}")
    private String defaultRedirectUri;

    private final RestTemplate restTemplate = new RestTemplate();

    private final SsoSessionCache sessionCache;

    private final UpmClient upmClient;

    public SsoController(SsoSessionCache sessionCache, UpmClient upmClient) {
        this.sessionCache = sessionCache;
        this.upmClient = upmClient;
    }

    @GetMapping("/auth-url")
    public ResponseEntity<?> getAuthUrl(
            @RequestParam(value = "redirect_uri", required = false) String redirectUri) {
        try {
            String targetRedirectUri = (redirectUri != null && !redirectUri.isEmpty()) ? redirectUri : 
                defaultRedirectUri;
            
            String url = ssoBaseUrl + "/api/sso/auth-url?client_id=" + clientId
                    + "&redirect_uri=" + targetRedirectUri;
            
            log.info("Calling SSO auth-url: {}", url);
            
            ResponseEntity<Map> response = restTemplate.getForEntity(url, Map.class);
            
            log.info("SSO response status: {}, body: {}", response.getStatusCode(), response.getBody());
            
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return ResponseEntity.ok(response.getBody());
            } else {
                return ResponseEntity.status(response.getStatusCode())
                        .body(Map.of("error", "Failed to get auth URL"));
            }
        } catch (Exception e) {
            log.error("Error calling SSO auth-url", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "SSO service error: " + e.getMessage()));
        }
    }

    @PostMapping("/token")
    public ResponseEntity<?> exchangeCode(@RequestBody Map<String, String> request) {
        String code = request.get("code");
        if (code == null || code.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "code is required"));
        }

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, String> body = new HashMap<>();
            body.put("code", code);
            body.put("client_id", clientId);
            body.put("client_secret", clientSecret);

            HttpEntity<Map<String, String>> entity = new HttpEntity<>(body, headers);

            ResponseEntity<Map> response = restTemplate.postForEntity(
                    ssoBaseUrl + "/api/sso/token",
                    entity,
                    Map.class
            );

            log.info("SSO token exchange response: status={}", response.getStatusCode());

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Map<String, Object> result = response.getBody();
                String sessionId = (String) result.get("session_id");
                
                if (sessionId != null) {
                    sessionCache.putFromTokenResponse(sessionId, result);
                    supplementFromUpm(sessionId, result);
                    log.info("Cached user info for session {}", sessionId);
                    registerClientSession(sessionId);
                }
                
                return ResponseEntity.ok(result);
            } else {
                return ResponseEntity.status(response.getStatusCode())
                        .body(Map.of("error", "Failed to exchange code"));
            }
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            log.error("SSO token exchange error: {}", e.getResponseBodyAsString());
            return ResponseEntity.status(e.getStatusCode())
                    .body(Map.of("error", "SSO error: " + e.getResponseBodyAsString()));
        } catch (Exception e) {
            log.error("SSO token exchange failed", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "SSO service error: " + e.getMessage()));
        }
    }

    private void registerClientSession(String sessionId) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Client-Id", clientId);
            headers.set("X-Client-Secret", clientSecret);

            Map<String, String> body = new HashMap<>();
            body.put("session_id", sessionId);
            body.put("client_id", clientId);
            // callback_url 可选，如果提供则必须在SSO服务端注册为有效的redirect_uri
            // 暂时不提供，避免验证失败

            HttpEntity<Map<String, String>> entity = new HttpEntity<>(body, headers);

            ResponseEntity<String> response = restTemplate.postForEntity(
                    ssoBaseUrl + "/api/sso/register-client",
                    entity,
                    String.class
            );

            log.info("SSO client registration response: status={}, body={}", response.getStatusCode(), response.getBody());
        } catch (Exception e) {
            log.error("Failed to register client session: {}", e.getMessage(), e);
        }
    }

    @SuppressWarnings("unchecked")
    private void supplementFromUpm(String sessionId, Map<String, Object> tokenResponse) {
        try {
            Object userObj = tokenResponse.get("user");
            if (!(userObj instanceof Map)) return;

            Map<String, Object> userMap = (Map<String, Object>) userObj;
            String username = (String) userMap.get("username");
            if (username == null || username.isBlank()) return;

            String existingDeptId = (String) userMap.get("departmentId");
            String existingUserId = (String) userMap.get("userId");
            boolean needDept = existingDeptId == null || existingDeptId.isBlank();
            boolean needUserId = existingUserId == null || existingUserId.isBlank() || !isValidUuid(existingUserId);
            if (!needDept && !needUserId) return;

            log.info("Supplementing from UPM for SSO user: {} (needDept={}, needUserId={})", username, needDept, needUserId);

            List<Map<String, Object>> upmUsers = upmClient.getUsers(null);
            for (Map<String, Object> upmUser : upmUsers) {
                if (username.equals(upmUser.get("username"))) {
                    SsoUser cachedUser = sessionCache.get(sessionId);

                    if (needDept) {
                        String deptId = upmUser.get("departmentId") != null ? String.valueOf(upmUser.get("departmentId")) : null;
                        String deptName = upmUser.get("departmentName") != null ? String.valueOf(upmUser.get("departmentName")) : null;
                        if (deptId != null && !deptId.isBlank()) {
                            userMap.put("departmentId", deptId);
                            userMap.put("departmentName", deptName);
                            if (cachedUser != null) {
                                cachedUser.setDepartmentId(deptId);
                                cachedUser.setDepartmentName(deptName);
                            }
                            log.info("Supplemented departmentId={} for SSO user {}", deptId, username);
                        }
                    }

                    if (needUserId) {
                        String upmUserId = upmUser.get("id") != null ? String.valueOf(upmUser.get("id")) : null;
                        if (upmUserId != null && isValidUuid(upmUserId)) {
                            userMap.put("userId", upmUserId);
                            if (cachedUser != null) {
                                cachedUser.setUserId(upmUserId);
                            }
                            log.info("Supplemented userId={} for SSO user {}", upmUserId, username);
                        }
                    }

                    if (cachedUser != null) {
                        sessionCache.put(sessionId, cachedUser);
                    }
                    break;
                }
            }
        } catch (Exception e) {
            log.warn("Failed to supplement from UPM: {}", e.getMessage());
        }
    }

    private static boolean isValidUuid(String s) {
        if (s == null || s.isBlank()) return false;
        try {
            java.util.UUID.fromString(s);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private void supplementSsoUserFromUpm(SsoUser user) {
        if (user.getUsername() == null || user.getUsername().isBlank()) return;

        boolean needDept = user.getDepartmentId() == null || user.getDepartmentId().isBlank();
        boolean needUserId = user.getUserId() == null || user.getUserId().isBlank() || !isValidUuid(user.getUserId());
        if (!needDept && !needUserId) return;

        try {
            log.info("Supplementing from UPM for SSO user (validate): {} (needDept={}, needUserId={})", user.getUsername(), needDept, needUserId);
            List<Map<String, Object>> upmUsers = upmClient.getUsers(null);
            for (Map<String, Object> upmUser : upmUsers) {
                if (user.getUsername().equals(upmUser.get("username"))) {
                    if (needDept) {
                        String deptId = upmUser.get("departmentId") != null ? String.valueOf(upmUser.get("departmentId")) : null;
                        String deptName = upmUser.get("departmentName") != null ? String.valueOf(upmUser.get("departmentName")) : null;
                        if (deptId != null && !deptId.isBlank()) {
                            user.setDepartmentId(deptId);
                            user.setDepartmentName(deptName);
                            log.info("Supplemented departmentId={} for SSO user {} (validate)", deptId, user.getUsername());
                        }
                    }
                    if (needUserId) {
                        String upmUserId = upmUser.get("id") != null ? String.valueOf(upmUser.get("id")) : null;
                        if (upmUserId != null && isValidUuid(upmUserId)) {
                            user.setUserId(upmUserId);
                            log.info("Supplemented userId={} for SSO user {} (validate)", upmUserId, user.getUsername());
                        }
                    }
                    break;
                }
            }
        } catch (Exception e) {
            log.warn("Failed to supplement from UPM (validate): {}", e.getMessage());
        }
    }

    @GetMapping("/validate")
    public ResponseEntity<?> validateSession(@RequestHeader("X-Session-Id") String sessionId) {
        log.info("[SSO Validate] Received validation request for session: {}", sessionId);
        try {
            SsoUser user = sessionCache.get(sessionId);
            if (user != null) {
                log.info("[SSO Validate] Session valid (cached), user: {}", user.getUsername());
                return ResponseEntity.ok(Map.of(
                        "authenticated", true,
                        "user", user
                ));
            }

            user = validateSessionInternal(sessionId);
            if (user != null) {
                supplementSsoUserFromUpm(user);
                log.info("[SSO Validate] Session valid (SSO), user: {}", user.getUsername());
                sessionCache.put(sessionId, user);
                return ResponseEntity.ok(Map.of(
                        "authenticated", true,
                        "user", user
                ));
            }
            log.warn("[SSO Validate] Session invalid or expired: {}", sessionId);
            return ResponseEntity.ok(Map.of("authenticated", false));
        } catch (Exception e) {
            log.error("[SSO Validate] Validation failed for session {}: {}", sessionId, e.getMessage(), e);
            return ResponseEntity.ok(Map.of("authenticated", false));
        }
    }

    private SsoUser validateSessionInternal(String sessionId) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("X-Client-Id", clientId);
            headers.set("X-Client-Secret", clientSecret);

            HttpEntity<Void> entity = new HttpEntity<>(headers);
            ResponseEntity<Map> response = restTemplate.exchange(
                    ssoBaseUrl + "/api/sso/session/" + sessionId,
                    org.springframework.http.HttpMethod.GET,
                    entity,
                    Map.class
            );

            log.info("SSO session validation response: status={}, body={}", response.getStatusCode(), response.getBody());

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Map<String, Object> body = response.getBody();
                Object userObj = body.get("user");
                if (userObj instanceof Map) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> userMap = (Map<String, Object>) userObj;
                    SsoUser user = new SsoUser();
                    user.setUserId((String) userMap.getOrDefault("user_id", userMap.get("userId")));
                    user.setUsername((String) userMap.get("username"));
                    user.setEmail((String) userMap.get("email"));
                    user.setDepartmentId((String) userMap.get("departmentId"));
                    user.setDepartmentName((String) userMap.get("departmentName"));
                    if (userMap.get("roles") instanceof java.util.List) {
                        @SuppressWarnings("unchecked")
                        java.util.List<String> roles = (java.util.List<String>) userMap.get("roles");
                        user.setRoles(roles);
                    }
                    if (userMap.get("permissions") instanceof java.util.List) {
                        @SuppressWarnings("unchecked")
                        java.util.List<String> perms = (java.util.List<String>) userMap.get("permissions");
                        user.setPermissions(perms);
                    }
                    return user;
                }
            }
        } catch (Exception e) {
            log.error("SSO session validation failed for session {}: {}", sessionId, e.getMessage());
        }
        return null;
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(@RequestHeader("X-Session-Id") String sessionId) {
        log.info("[SSO Logout] Received logout request for session: {}", sessionId);
        sessionCache.remove(sessionId);
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Session-Id", sessionId);

            Map<String, String> body = new HashMap<>();
            body.put("client_id", clientId);

            HttpEntity<Map<String, String>> entity = new HttpEntity<>(body, headers);
            restTemplate.postForEntity(ssoBaseUrl + "/api/sso/logout", entity, String.class);
            log.info("[SSO Logout] SSO server session invalidated: {}", sessionId);
        } catch (Exception e) {
            log.warn("[SSO Logout] Failed to invalidate SSO server session (non-blocking): {}", e.getMessage());
        }
        return ResponseEntity.ok(Map.of("logged_out", true));
    }

    @GetMapping("/debug/config")
    public ResponseEntity<?> debugConfig() {
        return ResponseEntity.ok(Map.of(
            "ssoBaseUrl", ssoBaseUrl,
            "clientId", clientId,
            "clientSecretSet", clientSecret != null && !clientSecret.isEmpty(),
            "clientSecretLength", clientSecret != null ? clientSecret.length() : 0
        ));
    }
}
