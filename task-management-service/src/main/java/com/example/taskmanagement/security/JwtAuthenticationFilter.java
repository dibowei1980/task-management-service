package com.example.taskmanagement.security;

import com.example.taskmanagement.sso.SsoClient;
import com.example.taskmanagement.sso.SsoSessionCache;
import com.example.taskmanagement.sso.SsoUser;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationFilter.class);

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private SsoClient ssoClient;

    @Autowired
    private SsoSessionCache ssoSessionCache;

    @Value("${auth.mode:both}")
    private String authMode;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        String jwt = extractToken(request);

        // 1. 先检查内部自动化token（保留现有逻辑）
        String internalToken = System.getenv("TASK_MANAGEMENT_AUTH_TOKEN");
        if (internalToken != null && !internalToken.isBlank() && internalToken.equals(jwt)
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            setupInternalAutomationAuth(request);
            chain.doFilter(request, response);
            return;
        }

        // 2. 尝试SSO Session认证
        String sessionId = request.getHeader("X-Session-Id");
        if ((sessionId == null || sessionId.isBlank()) && isSseEndpoint(request)) {
            sessionId = request.getParameter("sessionId");
        }
        log.info("[AuthFilter] Request URI: {}, X-Session-Id: {}", request.getRequestURI(), sessionId);
        if (sessionId != null && !sessionId.isBlank() && isSsoEnabled()) {
            SsoUser ssoUser = ssoSessionCache.get(sessionId);
            if (ssoUser != null) {
                log.info("[AuthFilter] Session valid (cached) for user: {}", ssoUser.getUsername());
                setupSsoAuth(request, ssoUser);
                chain.doFilter(request, response);
                return;
            }

            log.info("[AuthFilter] Session not in cache, validating via SSO: {}", sessionId);
            ssoUser = ssoClient.validateSession(sessionId);
            if (ssoUser != null) {
                log.info("[AuthFilter] Session valid (SSO) for user: {}", ssoUser.getUsername());
                ssoSessionCache.put(sessionId, ssoUser);
                setupSsoAuth(request, ssoUser);
                chain.doFilter(request, response);
                return;
            } else {
                log.warn("[AuthFilter] Session validation failed: {}", sessionId);
            }
        }

        // 3. 尝试API Token认证（服务间调用）
        String apiToken = extractApiToken(request);
        if (apiToken != null && !apiToken.isBlank() && isSsoEnabled()) {
            SsoUser ssoUser = ssoClient.validateApiToken(apiToken);
            if (ssoUser != null) {
                setupSsoAuth(request, ssoUser);
                chain.doFilter(request, response);
                return;
            }
        }

        // 4. 回退到JWT自验证（兼容模式）
        if (jwt != null && !jwt.isBlank() && isJwtEnabled()) {
            try {
                String username = jwtUtil.extractUsername(jwt);
                if (username != null && SecurityContextHolder.getContext().getAuthentication() == null) {
                    if (jwtUtil.validateToken(jwt)) {
                        setupJwtAuth(request, jwt, username);
                    }
                }
            } catch (io.jsonwebtoken.ExpiredJwtException e) {
                log.warn("JWT expired at {}, current time: {}", e.getClaims().getExpiration(), java.time.Instant.now());
            } catch (Exception e) {
                log.warn("JWT validation failed: {}", e.getMessage());
            }
        }

        chain.doFilter(request, response);
    }

    private String extractToken(HttpServletRequest request) {
        final String authorizationHeader = request.getHeader("Authorization");
        if (authorizationHeader != null && authorizationHeader.startsWith("Bearer ")) {
            return authorizationHeader.substring(7);
        }
        String tokenParam = request.getParameter("token");
        if (tokenParam != null && !tokenParam.isBlank()) {
            return tokenParam;
        }
        return null;
    }

    private String extractApiToken(HttpServletRequest request) {
        final String authorizationHeader = request.getHeader("Authorization");
        if (authorizationHeader != null && authorizationHeader.startsWith("Bearer ")) {
            return authorizationHeader.substring(7);
        }
        return null;
    }

    private void setupInternalAutomationAuth(HttpServletRequest request) {
        List<org.springframework.security.core.authority.SimpleGrantedAuthority> authorities = new ArrayList<>();
        String[] perms = new String[] {
                "project:read_global",
                "project:create",
                "project:update_global",
                "project:delete_global",
                "task:read_global",
                "task:create",
                "task:update_global",
                "task:delete_global",
                "task:execute",
                "task:claim",
                "task:update_progress",
                "task:submit_for_qa",
                "task:write_back",
                "task:approve",
                "task:reject",
                "task:approve_final",
                "task:reject_final",
                "task:update_status_internal"
        };
        for (String p : perms) {
            authorities.add(new org.springframework.security.core.authority.SimpleGrantedAuthority(p));
            authorities.add(new org.springframework.security.core.authority.SimpleGrantedAuthority(p.toUpperCase(java.util.Locale.ROOT)));
        }
        UserDetails userDetails = new User("internal-automation", "", authorities);
        UsernamePasswordAuthenticationToken usernamePasswordAuthenticationToken = new UsernamePasswordAuthenticationToken(
                userDetails, null, userDetails.getAuthorities());
        usernamePasswordAuthenticationToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
        SecurityContextHolder.getContext().setAuthentication(usernamePasswordAuthenticationToken);
        log.info("Internal automation auth enabled, authorities={}", authorities.stream().map(org.springframework.security.core.GrantedAuthority::getAuthority).toList());
    }

    private void setupSsoAuth(HttpServletRequest request, SsoUser ssoUser) {
        List<org.springframework.security.core.authority.SimpleGrantedAuthority> authorities = new ArrayList<>();

        // 添加SSO权限
        if (ssoUser.getPermissions() != null) {
            for (String perm : ssoUser.getPermissions()) {
                authorities.add(new org.springframework.security.core.authority.SimpleGrantedAuthority(perm));
                authorities.add(new org.springframework.security.core.authority.SimpleGrantedAuthority(perm.toUpperCase()));
            }
        }

        // 添加SSO角色
        if (ssoUser.getRoles() != null) {
            for (String role : ssoUser.getRoles()) {
                authorities.add(new org.springframework.security.core.authority.SimpleGrantedAuthority(role));
                if (!role.startsWith("ROLE_")) {
                    authorities.add(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_" + role));
                }
            }
        }

        UserDetails userDetails = new User(ssoUser.getUsername(), "", authorities);
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                userDetails, null, userDetails.getAuthorities());
        Map<String, String> authDetails = new HashMap<>();
        authDetails.put("userId", ssoUser.getUserId() != null ? ssoUser.getUserId() : "");
        authDetails.put("departmentId", ssoUser.getDepartmentId() != null ? ssoUser.getDepartmentId() : "");
        authDetails.put("departmentName", ssoUser.getDepartmentName() != null ? ssoUser.getDepartmentName() : "");
        auth.setDetails(authDetails);
        SecurityContextHolder.getContext().setAuthentication(auth);

        // 设置request属性供controller使用
        if (ssoUser.getUserId() != null) {
            request.setAttribute("userId", ssoUser.getUserId());
        }
        if (ssoUser.getDepartmentId() != null) {
            request.setAttribute("departmentId", ssoUser.getDepartmentId());
        }
        if (ssoUser.getDepartmentName() != null) {
            request.setAttribute("departmentName", ssoUser.getDepartmentName());
        }

        log.info("SSO auth user='{}', authorities={}", ssoUser.getUsername(), authorities.stream().map(org.springframework.security.core.GrantedAuthority::getAuthority).toList());
    }

    private void setupJwtAuth(HttpServletRequest request, String jwt, String username) {
        String userId = jwtUtil.extractUserId(jwt);
        if (userId != null) {
            request.setAttribute("userId", userId);
        }
        String departmentId = jwtUtil.extractDepartmentId(jwt);
        if (departmentId != null) {
            request.setAttribute("departmentId", departmentId);
        }
        String departmentName = jwtUtil.extractDepartmentName(jwt);
        if (departmentName != null) {
            request.setAttribute("departmentName", departmentName);
        }

        // Extract roles from token
        java.util.List<String> roles = jwtUtil.extractRoles(jwt);
        java.util.List<org.springframework.security.core.authority.SimpleGrantedAuthority> authorities = new ArrayList<>();
        if (roles != null) {
            for (String r : roles) {
                // Original authority as-is
                authorities.add(new org.springframework.security.core.authority.SimpleGrantedAuthority(r));
                // If it's a role without ROLE_ prefix, add prefixed variant
                if (r.matches("^[A-Z_]+$") && !r.startsWith("ROLE_")) {
                    authorities.add(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_" + r));
                }
                // If it's a permission like PROJECT:UPDATE ensure lowercase variant also exists
                if (r.contains(":")) {
                    authorities.add(new org.springframework.security.core.authority.SimpleGrantedAuthority(r.toLowerCase()));
                }
            }
        }

        // Log at INFO to aid field debugging
        log.info("JWT auth user='{}', authorities={}", username, authorities.stream().map(org.springframework.security.core.GrantedAuthority::getAuthority).toList());

        // In a real microservice architecture, we might fetch user details/roles from the User Service or from Claims
        // For now, we create a simple UserDetails object with the username
        UserDetails userDetails = new User(username, "", authorities);

        UsernamePasswordAuthenticationToken usernamePasswordAuthenticationToken = new UsernamePasswordAuthenticationToken(
                userDetails, null, userDetails.getAuthorities());
        Map<String, String> authDetails = new HashMap<>();
        authDetails.put("userId", userId != null ? userId : "");
        authDetails.put("departmentId", departmentId != null ? departmentId : "");
        authDetails.put("departmentName", departmentName != null ? departmentName : "");
        usernamePasswordAuthenticationToken.setDetails(authDetails);
        SecurityContextHolder.getContext().setAuthentication(usernamePasswordAuthenticationToken);
    }

    private boolean isSsoEnabled() {
        return "sso".equals(authMode) || "both".equals(authMode);
    }

    private boolean isJwtEnabled() {
        return "jwt".equals(authMode) || "both".equals(authMode);
    }

    private boolean isSseEndpoint(HttpServletRequest request) {
        return "/api/sse/subscribe".equals(request.getRequestURI());
    }
}
