package com.example.taskmanagement.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

@Component("authzService")
public class AuthzService {
    private static Set<String> normalizedAuthorities(Authentication authentication) {
        Set<String> set = new HashSet<>();
        if (authentication == null || authentication.getAuthorities() == null) return set;
        for (GrantedAuthority ga : authentication.getAuthorities()) {
            String a = ga.getAuthority();
            if (a == null || a.isBlank()) continue;
            set.add(a);
            set.add(a.toLowerCase(Locale.ROOT));
        }
        return set;
    }

    private static boolean hasAny(Authentication authentication, String... candidates) {
        Set<String> set = normalizedAuthorities(authentication);
        for (String c : candidates) {
            if (c == null || c.isBlank()) continue;
            if (set.contains(c) || set.contains(c.toLowerCase(Locale.ROOT))) return true;
        }
        return false;
    }

    private static boolean hasDeveloperRole(Authentication authentication) {
        return hasAny(authentication,
                "ROLE_DEVELOPER",
                "ROLE_DEVLOPER",
                "ROLE_ADMIN",
                "ROLE_MANAGER"
        );
    }

    public boolean canRead(Authentication authentication) {
        if (hasDeveloperRole(authentication)) return true;
        return hasAny(authentication,
                "project:read_global",
                "project:read_department",
                "project:read_own",
                "project:read_participant",
                "task:read_global",
                "task:read_department",
                "task:read_project",
                "task:read_participant",
                "PROJECT:READ_GLOBAL",
                "PROJECT:READ_PARTICIPANT",
                "TASK:READ_GLOBAL",
                "TASK:READ_PARTICIPANT"
        );
    }

    public boolean canCreate(Authentication authentication) {
        if (hasDeveloperRole(authentication)) return true;
        return hasAny(authentication,
                "project:create",
                "task:create",
                "PROJECT:CREATE",
                "TASK:CREATE"
        );
    }

    public boolean canUpdate(Authentication authentication) {
        if (hasDeveloperRole(authentication)) return true;
        return hasAny(authentication,
                "project:update_global",
                "project:update_department",
                "project:update_own",
                "task:update_global",
                "task:update_department",
                "task:update_project",
                "PROJECT:UPDATE_GLOBAL",
                "TASK:UPDATE_GLOBAL"
        );
    }

    public boolean canUpdateOrParticipate(Authentication authentication) {
        if (hasDeveloperRole(authentication)) return true;
        return canUpdate(authentication) || hasAny(authentication,
                "project:read_participant",
                "task:read_participant",
                "PROJECT:READ_PARTICIPANT",
                "TASK:READ_PARTICIPANT"
        );
    }

    public boolean canDelete(Authentication authentication) {
        if (hasDeveloperRole(authentication)) return true;
        return hasAny(authentication,
                "project:delete_global",
                "project:delete_department",
                "task:delete_global",
                "task:delete_department",
                "task:delete_own",
                "PROJECT:DELETE_GLOBAL",
                "TASK:DELETE_GLOBAL"
        );
    }

    public boolean canExecute(Authentication authentication) {
        if (hasDeveloperRole(authentication)) return true;
        return hasAny(authentication,
                "task:execute",
                "TASK:EXECUTE",
                "project:update_global",
                "project:create",
                "project:update_department",
                "project:update_own"
        );
    }

    public boolean canUpdateStatus(Authentication authentication) {
        if (hasDeveloperRole(authentication)) return true;
        return hasAny(authentication,
                "task:update_global",
                "task:update_department",
                "task:update_project",
                "project:update_global",
                "project:update_department",
                "project:update_own",
                "task:execute",
                "task:claim",
                "task:update_progress",
                "task:submit_for_qa",
                "task:write_back",
                "task:approve",
                "task:reject",
                "task:approve_final",
                "task:reject_final",
                "task:update_status_internal",
                "quality:check",
                "quality:approve"
        );
    }

    public boolean canUpdateWorkflow(Authentication authentication) {
        if (hasDeveloperRole(authentication)) return true;
        return hasAny(authentication,
                "task:update_global",
                "task:update_department",
                "task:update_project",
                "task:execute",
                "task:claim",
                "task:update_progress",
                "task:submit_for_qa",
                "task:write_back",
                "task:approve",
                "task:reject",
                "task:approve_final",
                "task:reject_final",
                "task:update_status_internal",
                "quality:check",
                "quality:approve",
                "TASK:UPDATE_GLOBAL",
                "TASK:EXECUTE"
        );
    }

    public boolean canUpdateWorkflowOrParticipate(Authentication authentication) {
        if (hasDeveloperRole(authentication)) return true;
        return canUpdateWorkflow(authentication) || hasAny(authentication,
                "project:read_participant",
                "task:read_participant",
                "PROJECT:READ_PARTICIPANT",
                "TASK:READ_PARTICIPANT"
        );
    }

    public boolean canQualityCheck(Authentication authentication) {
        if (hasDeveloperRole(authentication)) return true;
        return hasAny(authentication,
                "quality:check",
                "quality:approve",
                "QUALITY:CHECK",
                "QUALITY:APPROVE"
        );
    }
}
