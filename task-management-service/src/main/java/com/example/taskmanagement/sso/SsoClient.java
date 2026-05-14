package com.example.taskmanagement.sso;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

@Component
public class SsoClient {

    @Value("${sso.base-url:http://localhost:8080}")
    private String ssoBaseUrl;

    @Value("${sso.client-id:task-management-service}")
    private String clientId;

    @Value("${sso.client-secret:}")
    private String clientSecret;

    private final RestTemplate restTemplate = new RestTemplate();

    /**
     * 验证Session
     */
    public SsoUser validateSession(String sessionId) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("X-Client-Id", clientId);
            headers.set("X-Client-Secret", clientSecret);

            HttpEntity<Void> entity = new HttpEntity<>(headers);
            ResponseEntity<Map> response = restTemplate.exchange(
                    ssoBaseUrl + "/api/sso/session/" + sessionId,
                    HttpMethod.GET,
                    entity,
                    Map.class
            );

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
            // Log error but don't throw - let auth fall through to next method
        }
        return null;
    }

    /**
     * 验证API Token
     */
    public SsoUser validateApiToken(String apiToken) {
        try {
            Map<String, String> body = new HashMap<>();
            body.put("apiToken", apiToken);
            ResponseEntity<SsoTokenValidationResponse> response = restTemplate.postForEntity(
                    ssoBaseUrl + "/api/sso/api-token/validate",
                    body,
                    SsoTokenValidationResponse.class
            );

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                SsoTokenValidationResponse resp = response.getBody();
                if (Boolean.TRUE.equals(resp.getActive())) {
                    return resp.toSsoUser();
                }
            }
        } catch (Exception e) {
            // Log error but don't throw - let auth fall through to next method
        }
        return null;
    }
}
