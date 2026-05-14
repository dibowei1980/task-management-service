package com.example.taskmanagement.upm;

import com.example.taskmanagement.sso.SsoSessionCache;
import com.example.taskmanagement.security.JwtUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/upm")
@CrossOrigin(origins = "${app.cors.allowed-origins:http://localhost:5173,http://localhost:5174}")
public class UpmProxyController {

    private static final Logger log = LoggerFactory.getLogger(UpmProxyController.class);

    @Autowired
    private UpmClient upmClient;

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private SsoSessionCache ssoSessionCache;

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> credentials) {
        String username = credentials.get("username");
        String password = credentials.get("password");
        if (username == null || username.isBlank() || password == null || password.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Username and password required"));
        }
        try {
            Map<String, Object> upmResult = upmClient.login(username, password);

            String upmToken = upmResult.get("token") != null ? String.valueOf(upmResult.get("token")) : null;
            upmClient.cacheUserToken(username, upmToken);

            String userId = extractString(upmResult, "id");
            String email = extractString(upmResult, "email");
            String departmentId = extractString(upmResult, "departmentId");
            String departmentName = extractString(upmResult, "departmentName");
            @SuppressWarnings("unchecked")
            List<String> roles = (List<String>) upmResult.get("roles");
            if (roles == null) {
                roles = List.of();
            }

            String localToken = jwtUtil.generateToken(userId, username, email, departmentId, departmentName, roles);

            log.info("UPM login successful for user: {}, issued local token", username);

            return ResponseEntity.ok(Map.of(
                    "token", localToken,
                    "id", userId,
                    "username", username,
                    "email", email != null ? email : "",
                    "roles", roles,
                    "departmentId", departmentId != null ? departmentId : "",
                    "departmentName", departmentName != null ? departmentName : ""
            ));
        } catch (Exception e) {
            log.warn("Login failed for user {}: {}", username, e.getMessage());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Invalid username or password"));
        }
    }

    @GetMapping("/users")
    public ResponseEntity<?> getUsers(
            @RequestParam(value = "roleName", required = false) String roleName,
            @RequestParam(value = "permissionCode", required = false) String permissionCode,
            @RequestParam(value = "departmentId", required = false) String requestedDepartmentId,
            @RequestParam(value = "username", required = false) String username,
            @RequestParam(value = "email", required = false) String email,
            @RequestParam(value = "isActive", required = false) Boolean isActive,
            @RequestParam(value = "createdFrom", required = false) String createdFrom,
            @RequestParam(value = "createdTo", required = false) String createdTo) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String authName = auth != null ? auth.getName() : null;

        String userToken = upmClient.getCachedUserToken(authName);
        boolean hasSearchParam = (roleName != null && !roleName.isBlank())
                || (permissionCode != null && !permissionCode.isBlank())
                || (username != null && !username.isBlank())
                || (email != null && !email.isBlank())
                || isActive != null
                || (createdFrom != null && !createdFrom.isBlank())
                || (createdTo != null && !createdTo.isBlank());

        log.info("getUsers called: user={}, hasUserToken={}, requestedDeptId={}, permissionCode={}, hasSearchParam={}",
                authName, userToken != null, requestedDepartmentId, permissionCode, hasSearchParam);

        List<Map<String, Object>> users;
        try {
            if (hasSearchParam) {
                users = upmClient.searchUsers(userToken, roleName, permissionCode, username, email, isActive, createdFrom, createdTo);
            } else {
                users = upmClient.getUsers(userToken);
            }
        } catch (IllegalStateException e) {
            log.warn("UPM auth not configured and no cached user token: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of(
                            "error", "upm_auth_not_configured",
                            "message", "UPM 认证未配置且当前用户无 user:read/department:read 权限。"
                                    + "请设置 UPM_API_TOKEN（需具有 user:read 和 department:read 权限），"
                                    + "或确保登录用户具有相应权限。"
                    ));
        } catch (Exception e) {
            log.error("UPM getUsers call failed: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of(
                            "error", "upm_service_error",
                            "message", "UPM 服务调用失败: " + e.getMessage()
                    ));
        }

        log.info("UPM returned {} users", users.size());

        if (requestedDepartmentId != null && !requestedDepartmentId.isEmpty()) {
            final String deptId = requestedDepartmentId;
            List<Map<String, Object>> filtered = users.stream()
                    .filter(u -> deptId.equals(String.valueOf(u.get("departmentId"))))
                    .collect(Collectors.toList());
            log.info("Filtered to {} users in department {}", filtered.size(), deptId);
            return ResponseEntity.ok(filtered);
        }

        return ResponseEntity.ok(users);
    }

    @GetMapping("/me")
    public ResponseEntity<?> getCurrentUser(
            Authentication authentication,
            @RequestHeader(value = "X-Session-Id", required = false) String sessionId) {
        if (authentication == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Not authenticated"));
        }

        String userId = "";
        String username = authentication.getName();
        String departmentId = "";
        String departmentName = "";
        List<String> roles = List.of();
        List<String> permissions = List.of();

        if (authentication.getDetails() instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, String> details = (Map<String, String>) authentication.getDetails();
            userId = details.getOrDefault("userId", "");
            departmentId = details.getOrDefault("departmentId", "");
            departmentName = details.getOrDefault("departmentName", "");
        }

        if (sessionId != null && !sessionId.isBlank()) {
            com.example.taskmanagement.sso.SsoUser ssoUser = ssoSessionCache.get(sessionId);
            if (ssoUser != null) {
                if (ssoUser.getUserId() != null) userId = ssoUser.getUserId();
                if (ssoUser.getUsername() != null) username = ssoUser.getUsername();
                if (ssoUser.getDepartmentId() != null) departmentId = ssoUser.getDepartmentId();
                if (ssoUser.getDepartmentName() != null) departmentName = ssoUser.getDepartmentName();
                if (ssoUser.getRoles() != null) roles = ssoUser.getRoles();
                if (ssoUser.getPermissions() != null) permissions = ssoUser.getPermissions();
            }
        }

        if (roles.isEmpty() && permissions.isEmpty()) {
            List<String> authorities = authentication.getAuthorities().stream()
                    .map(GrantedAuthority::getAuthority)
                    .toList();
            for (String a : authorities) {
                if (a.startsWith("ROLE_")) {
                    if (!roles.contains(a.substring(5))) roles = append(roles, a.substring(5));
                } else if (a.contains(":")) {
                    if (!permissions.contains(a.toLowerCase())) permissions = append(permissions, a.toLowerCase());
                }
            }
        }

        return ResponseEntity.ok(Map.of(
                "id", userId,
                "username", username,
                "email", "",
                "roles", roles,
                "permissions", permissions,
                "departmentId", departmentId,
                "departmentName", departmentName
        ));
    }

    private static List<String> append(List<String> list, String item) {
        var result = new java.util.ArrayList<>(list);
        result.add(item);
        return result;
    }

    @GetMapping("/departments")
    public ResponseEntity<?> getDepartments() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String authName = auth != null ? auth.getName() : null;

        String userToken = upmClient.getCachedUserToken(authName);

        List<Map<String, Object>> departments;
        try {
            departments = upmClient.getDepartments(userToken);
        } catch (IllegalStateException e) {
            log.warn("UPM auth not configured and no cached user token: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of(
                            "error", "upm_auth_not_configured",
                            "message", "UPM 认证未配置且当前用户无 user:read/department:read 权限。"
                                    + "请设置 UPM_API_TOKEN（需具有 user:read 和 department:read 权限），"
                                    + "或确保登录用户具有相应权限。"
                    ));
        } catch (Exception e) {
            log.error("UPM getDepartments call failed: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of(
                            "error", "upm_service_error",
                            "message", "UPM 服务调用失败: " + e.getMessage()
                    ));
        }

        return ResponseEntity.ok(departments);
    }

    @GetMapping("/users/eligible-project-leaders")
    public ResponseEntity<?> getEligibleProjectLeaders(
            @RequestParam(value = "departmentId", required = false) String departmentId,
            @RequestParam(value = "category", required = false) String category) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String authName = auth != null ? auth.getName() : null;
        List<String> authorities = auth != null ? auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .toList()
                : List.of();

        boolean hasProjectUpdateGlobal = authorities.stream()
                .anyMatch(a -> a.equalsIgnoreCase("project:update_global"));
        boolean hasManager = authorities.stream()
                .anyMatch(a -> a.equalsIgnoreCase("department:manager"));
        boolean hasProjectCreate = authorities.stream()
                .anyMatch(a -> a.equalsIgnoreCase("project:create"));
        boolean hasTaskCreate = authorities.stream()
                .anyMatch(a -> a.equalsIgnoreCase("task:create"));

        if (!hasProjectUpdateGlobal && !hasManager && !hasProjectCreate && !hasTaskCreate) {
            return ResponseEntity.ok(List.of());
        }

        String userToken = upmClient.getCachedUserToken(authName);

        try {
            List<Map<String, Object>> result;

            if (hasProjectUpdateGlobal) {
                List<Map<String, Object>> deptManagers = upmClient.searchUsers(
                        userToken, null, "department:manager", null, null, true, null, null);
                result = new java.util.ArrayList<>(deptManagers);
                if (departmentId != null && !departmentId.isEmpty()) {
                    result = result.stream()
                            .filter(u -> departmentId.equals(String.valueOf(u.get("departmentId"))))
                            .collect(java.util.stream.Collectors.toList());
                }
                log.info("eligible-project-leaders (project:update_global): deptManagers={}, after dept filter={}",
                        deptManagers.size(), result.size());
            } else if (hasManager) {
                List<Map<String, Object>> projCreateUsers = upmClient.searchUsers(
                        userToken, null, "project:create", null, null, true, null, null);
                List<Map<String, Object>> taskCreateUsers = upmClient.searchUsers(
                        userToken, null, "task:create", null, null, true, null, null);
                List<Map<String, Object>> deptManagers = upmClient.searchUsers(
                        userToken, null, "department:manager", null, null, true, null, null);
                java.util.Set<String> higherIds = new java.util.HashSet<>();
                for (Map<String, Object> u : deptManagers) {
                    higherIds.add(String.valueOf(u.get("id")));
                }

                java.util.Map<String, Map<String, Object>> merged = new java.util.LinkedHashMap<>();
                for (Map<String, Object> u : projCreateUsers) {
                    String uid = String.valueOf(u.get("id"));
                    if (!higherIds.contains(uid)) merged.put(uid, u);
                }
                for (Map<String, Object> u : taskCreateUsers) {
                    String uid = String.valueOf(u.get("id"));
                    if (!higherIds.contains(uid) && !merged.containsKey(uid)) merged.put(uid, u);
                }

                result = new java.util.ArrayList<>(merged.values());
                if (departmentId != null && !departmentId.isEmpty()) {
                    result = result.stream()
                            .filter(u -> departmentId.equals(String.valueOf(u.get("departmentId"))))
                            .collect(java.util.stream.Collectors.toList());
                }
                log.info("eligible-project-leaders (department:manager): projCreate={}, taskCreate={}, after filter={}",
                        projCreateUsers.size(), taskCreateUsers.size(), result.size());
            } else if (hasProjectCreate) {
                List<Map<String, Object>> taskCreateUsers = upmClient.searchUsers(
                        userToken, null, "task:create", null, null, true, null, null);
                List<Map<String, Object>> projCreateUsers = upmClient.searchUsers(
                        userToken, null, "project:create", null, null, true, null, null);
                List<Map<String, Object>> deptManagers = upmClient.searchUsers(
                        userToken, null, "department:manager", null, null, true, null, null);
                java.util.Set<String> higherIds = new java.util.HashSet<>();
                for (Map<String, Object> u : deptManagers) higherIds.add(String.valueOf(u.get("id")));
                for (Map<String, Object> u : projCreateUsers) higherIds.add(String.valueOf(u.get("id")));

                result = new java.util.ArrayList<>();
                for (Map<String, Object> u : taskCreateUsers) {
                    String uid = String.valueOf(u.get("id"));
                    if (!higherIds.contains(uid)) result.add(u);
                }
                if (departmentId != null && !departmentId.isEmpty()) {
                    result = result.stream()
                            .filter(u -> departmentId.equals(String.valueOf(u.get("departmentId"))))
                            .collect(java.util.stream.Collectors.toList());
                }
                log.info("eligible-project-leaders (project:create): taskCreate={}, after filter={}",
                        taskCreateUsers.size(), result.size());
            } else {
                List<Map<String, Object>> taskExecuteUsers = upmClient.searchUsers(
                        userToken, null, "task:execute", null, null, true, null, null);
                List<Map<String, Object>> taskCreateUsers = upmClient.searchUsers(
                        userToken, null, "task:create", null, null, true, null, null);
                List<Map<String, Object>> projCreateUsers = upmClient.searchUsers(
                        userToken, null, "project:create", null, null, true, null, null);
                List<Map<String, Object>> deptManagers = upmClient.searchUsers(
                        userToken, null, "department:manager", null, null, true, null, null);
                java.util.Set<String> higherIds = new java.util.HashSet<>();
                for (Map<String, Object> u : deptManagers) higherIds.add(String.valueOf(u.get("id")));
                for (Map<String, Object> u : projCreateUsers) higherIds.add(String.valueOf(u.get("id")));
                for (Map<String, Object> u : taskCreateUsers) higherIds.add(String.valueOf(u.get("id")));

                result = new java.util.ArrayList<>();
                for (Map<String, Object> u : taskExecuteUsers) {
                    String uid = String.valueOf(u.get("id"));
                    if (!higherIds.contains(uid)) result.add(u);
                }
                if (departmentId != null && !departmentId.isEmpty()) {
                    result = result.stream()
                            .filter(u -> departmentId.equals(String.valueOf(u.get("departmentId"))))
                            .collect(java.util.stream.Collectors.toList());
                }
                log.info("eligible-project-leaders (task:create): taskExecute={}, after filter={}",
                        taskExecuteUsers.size(), result.size());
            }

            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.warn("UPM eligible-project-leaders failed: {}", e.getMessage());
            return ResponseEntity.ok(List.of());
        }
    }

    private String extractString(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value == null) return null;
        return String.valueOf(value);
    }
}
