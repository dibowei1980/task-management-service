package com.example.taskmanagement.security;

import com.example.taskmanagement.model.Task;
import com.example.taskmanagement.model.TaskAssignment;
import com.example.taskmanagement.model.TaskAssignmentRole;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

@Component
public class TaskScopePolicy {
    public void assertCanCreate(Authentication authentication, UUID userId, String departmentId, Task project, UUID parentTaskId, Task parentTask, List<TaskAssignment> parentAssignments) {
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            return;
        }
        if (hasAny(authentication, "task:read_department", "TASK:READ_DEPARTMENT", "project:read_department", "PROJECT:READ_DEPARTMENT")) {
            if (departmentId == null || !departmentId.equals(project.getDepartmentId())) {
                throw new AccessDeniedException("Forbidden");
            }
            return;
        }
        if (hasAny(authentication, "task:read_project", "TASK:READ_PROJECT", "project:read_own", "PROJECT:READ_OWN")) {
            if (userId != null && project.getAssigneeId() != null && project.getAssigneeId().equals(userId)) {
                return;
            }
            if (parentTask != null && userId != null && parentTask.getAssigneeId() != null && parentTask.getAssigneeId().equals(userId)) {
                return;
            }
            throw new AccessDeniedException("Forbidden");
        }
        if (hasAny(authentication, "task:execute", "TASK:EXECUTE")) {
            if (parentTaskId == null || userId == null) {
                throw new AccessDeniedException("Forbidden");
            }
            boolean assigned = parentAssignments.stream().anyMatch(a ->
                    TaskAssignmentRole.OPERATOR.name().equalsIgnoreCase(a.getId().getAssignmentRole())
                            && userId.equals(a.getId().getUserId()));
            if (!assigned) {
                throw new AccessDeniedException("Forbidden");
            }
            return;
        }
        throw new AccessDeniedException("Forbidden");
    }

    private static boolean hasAny(Authentication authentication, String... authorities) {
        if (authentication == null || authentication.getAuthorities() == null) return false;
        for (GrantedAuthority ga : authentication.getAuthorities()) {
            String a = ga.getAuthority();
            if (a == null) continue;
            for (String expected : authorities) {
                if (expected == null) continue;
                if (a.equals(expected) || a.equalsIgnoreCase(expected)) return true;
            }
        }
        return false;
    }
}
