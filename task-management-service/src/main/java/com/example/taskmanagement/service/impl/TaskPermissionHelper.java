package com.example.taskmanagement.service.impl;

import com.example.taskmanagement.model.Task;
import com.example.taskmanagement.model.TaskAssignment;
import com.example.taskmanagement.model.TaskAssignmentRole;
import com.example.taskmanagement.model.TaskCategory;
import com.example.taskmanagement.model.TaskStatus;
import com.example.taskmanagement.repository.TaskAssignmentRepository;
import com.example.taskmanagement.repository.TaskRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

@Component
public class TaskPermissionHelper {

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private TaskAssignmentRepository taskAssignmentRepository;

    @Autowired
    private com.example.taskmanagement.upm.UpmClient upmClient;

    static boolean hasAny(Authentication authentication, String... authorities) {
        if (authentication == null || authentication.getAuthorities() == null) return false;
        List<String> actual = authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .filter(a -> a != null && !a.isBlank())
                .toList();
        for (String expected : authorities) {
            if (expected == null || expected.isBlank()) continue;
            for (String a : actual) {
                if (a.equals(expected) || a.equalsIgnoreCase(expected)) return true;
            }
        }
        return false;
    }

    void enforceDepartmentAccess(Task task, String departmentId) {
        if (departmentId == null) return;
        if (departmentId.equals(task.getDepartmentId())) return;
        if (departmentId.equals(task.getCreatedDepartmentId())) return;
        throw new AccessDeniedException("Forbidden");
    }

    void enforceCreatedDepartmentAccess(Task task, String departmentId, String departmentName) {
        if (!isCreatedDepartmentAllowed(task, departmentId, departmentName)) {
            throw new AccessDeniedException("仅创建部门可修改");
        }
    }

    boolean isCreatedDepartmentAllowed(Task task, String departmentId, String departmentName) {
        if (task == null) return false;
        String taskDept = task.getDepartmentId();
        String createdDept = task.getCreatedDepartmentId();
        String createdDeptName = task.getCreatedDepartmentName();
        if (departmentId != null && !departmentId.isBlank()) {
            if (departmentId.equals(taskDept)) return true;
            return createdDept != null && !createdDept.isBlank() && departmentId.equals(createdDept);
        }
        if (departmentName != null && !departmentName.isBlank()) {
            if (departmentName.equals(taskDept)) return true;
            return createdDeptName != null && !createdDeptName.isBlank() && departmentName.equals(createdDeptName);
        }
        return false;
    }

    boolean canReadTask(Task task, Authentication authentication, String departmentId, String departmentName, UUID userId) {
        if (task == null) return false;
        if (hasAny(authentication, "project:read_global", "PROJECT:READ_GLOBAL")) {
            return true;
        }
        if (hasAny(authentication, "project:read_department", "PROJECT:READ_DEPARTMENT", "task:read_department", "TASK:READ_DEPARTMENT")) {
            return isCreatedDepartmentAllowed(task, departmentId, departmentName);
        }
        if (hasAny(authentication, "project:read_own", "PROJECT:READ_OWN", "task:read_project", "TASK:READ_PROJECT")) {
            return isProjectLeaderScopeAllowed(task, userId, departmentId);
        }
        if (hasAny(authentication, "department:manager") && task.getDepartmentId() != null
                && task.getDepartmentId().equals(departmentId)) {
            return true;
        }
        if (userId != null && isAncestorAssignee(task, userId)) {
            return true;
        }
        if (userId != null && isAncestorParticipant(task, userId)) {
            return true;
        }
        if (hasAny(authentication, "task:execute", "TASK:EXECUTE") && userId != null) {
            List<TaskAssignment> assignments = taskAssignmentRepository.findByIdTaskId(task.getId());
            boolean assigned = assignments.stream().anyMatch(a ->
                    TaskAssignmentRole.OPERATOR.name().equalsIgnoreCase(a.getId().getAssignmentRole())
                            && userId.equals(a.getId().getUserId()));
            if (assigned) return true;
        }
        return false;
    }

    boolean canUpdateTask(Task task, Authentication authentication, String departmentId, String departmentName, UUID userId) {
        if (task == null) return false;
        if (userId != null && userId.equals(task.getCreatedById())) {
            return true;
        }
        return false;
    }

    boolean canDeleteTask(Task task, Authentication authentication, String departmentId, String departmentName, UUID userId) {
        if (task == null) return false;
        if (hasAny(authentication, "system:admin", "SYSTEM:ADMIN")) {
            return true;
        }
        if (hasAny(authentication, "project:delete_global", "task:delete_global", "PROJECT:DELETE_GLOBAL", "TASK:DELETE_GLOBAL")) {
            return true;
        }
        if (task.getCategory() == TaskCategory.PROJECT) {
            if (hasAny(authentication, "project:delete_department", "PROJECT:DELETE_DEPARTMENT")) {
                return isCreatedByDepartment(task, departmentId, departmentName);
            }
            return false;
        }
        if (hasAny(authentication, "task:delete_department", "TASK:DELETE_DEPARTMENT")) {
            return isCreatedByDepartment(task, departmentId, departmentName);
        }
        if (hasAny(authentication, "task:delete_own", "TASK:DELETE_OWN")) {
            return isCreatedByCurrentUser(task, authentication);
        }
        return false;
    }

    boolean isCreatedByDepartment(Task task, String departmentId, String departmentName) {
        if (task == null) return false;
        if (departmentId != null && !departmentId.isBlank()) {
            String createdDeptId = task.getCreatedDepartmentId();
            return createdDeptId != null && !createdDeptId.isBlank() && departmentId.equals(createdDeptId);
        }
        if (departmentName != null && !departmentName.isBlank()) {
            String createdDeptName = task.getCreatedDepartmentName();
            return createdDeptName != null && !createdDeptName.isBlank() && departmentName.equals(createdDeptName);
        }
        return false;
    }

    boolean isCreatedByCurrentUser(Task task, Authentication authentication) {
        if (task == null || authentication == null) return false;
        String creator = task.getCreatedByName();
        if (creator == null || creator.isBlank()) return false;
        String current = authentication.getName();
        return current != null && !current.isBlank() && creator.equals(current);
    }

    boolean isProjectLeaderScopeAllowed(Task task, UUID userId, String departmentId) {
        if (userId == null && departmentId == null) return false;
        if (task.getCategory() == TaskCategory.PROJECT) {
            if (userId != null && userId.equals(task.getAssigneeId())) {
                return true;
            }
            if (task.getAssigneeId() == null && departmentId != null && departmentId.equals(task.getDepartmentId())) {
                return true;
            }
        }
        UUID projectId = task.getProjectId();
        if (projectId == null) {
            return false;
        }
        Task project = taskRepository.findById(projectId).orElse(null);
        if (project == null) return false;
        if (project.getCategory() != TaskCategory.PROJECT) return false;
        if (userId != null && userId.equals(project.getAssigneeId())) {
            return true;
        }
        return project.getAssigneeId() == null && departmentId != null && departmentId.equals(project.getDepartmentId());
    }

    boolean isAncestorAssignee(Task task, UUID userId) {
        if (userId == null || task == null) return false;
        UUID currentId = task.getParentTaskId();
        int depth = 0;
        while (currentId != null && depth < 10) {
            Task ancestor = taskRepository.findById(currentId).orElse(null);
            if (ancestor == null) break;
            if (userId.equals(ancestor.getAssigneeId())) {
                return true;
            }
            currentId = ancestor.getParentTaskId();
            depth++;
        }
        return false;
    }

    boolean isAncestorParticipant(Task task, UUID userId) {
        if (userId == null || task == null) return false;
        UUID currentId = task.getParentTaskId();
        int depth = 0;
        while (currentId != null && depth < 10) {
            List<TaskAssignment> assignments = taskAssignmentRepository.findByIdTaskId(currentId);
            boolean isParticipant = assignments.stream().anyMatch(a ->
                    userId.equals(a.getId().getUserId()));
            if (isParticipant) return true;
            Task ancestor = taskRepository.findById(currentId).orElse(null);
            if (ancestor == null) break;
            currentId = ancestor.getParentTaskId();
            depth++;
        }
        return false;
    }

    boolean canParticipantClaim(Task task, Authentication authentication, UUID userId) {
        if (!hasAny(authentication,
                "project:read_participant",
                "task:read_participant",
                "PROJECT:READ_PARTICIPANT",
                "TASK:READ_PARTICIPANT")) {
            return false;
        }
        if (userId == null || task == null) return false;
        Task project = task;
        if (task.getCategory() != TaskCategory.PROJECT) {
            UUID projectId = task.getProjectId();
            if (projectId == null) return false;
            project = taskRepository.findById(projectId).orElse(null);
            if (project == null) return false;
        }
        List<TaskAssignment> assignments = taskAssignmentRepository.findByIdTaskId(project.getId());
        return assignments.stream().anyMatch(a ->
                TaskAssignmentRole.OPERATOR.name().equalsIgnoreCase(a.getId().getAssignmentRole())
                        && userId.equals(a.getId().getUserId()));
    }

    String resolveCreatedDepartmentId(Task task) {
        if (task.getCreatedDepartmentId() != null && !task.getCreatedDepartmentId().isBlank()) {
            return task.getCreatedDepartmentId();
        }
        if (task.getDepartmentId() != null && !task.getDepartmentId().isBlank()) {
            return task.getDepartmentId();
        }
        return null;
    }

    void validateProjectLeader(UUID projectLeaderId, String departmentId, Authentication authentication) {
        if (projectLeaderId == null) return;
        try {
            java.util.List<java.util.Map<String, Object>> leaders =
                    upmClient.searchUsers(null, departmentId, "project:create", null, null, true, null, null);
            boolean found = leaders.stream().anyMatch(u -> projectLeaderId.toString().equals(String.valueOf(u.get("id"))));
            if (!found) {
                throw new IllegalArgumentException("项目负责人必须属于负责部门且具有 project:create 权限");
            }
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("验证项目负责人失败: " + e.getMessage(), e);
        }
    }

    void validateAssigneeByHierarchy(UUID assigneeId, String departmentId, Authentication authentication) {
        if (assigneeId == null) return;
        try {
            boolean hasProjectUpdateGlobal = hasAny(authentication, "project:update_global", "PROJECT:UPDATE_GLOBAL");
            boolean hasManager = hasAny(authentication, "department:manager", "DEPARTMENT:MANAGER");
            boolean hasProjectCreate = hasAny(authentication, "project:create", "PROJECT:CREATE");

            java.util.Set<String> higherIds = new java.util.HashSet<>();
            java.util.List<java.util.Map<String, Object>> candidateUsers;

            if (hasProjectUpdateGlobal) {
                candidateUsers = upmClient.searchUsers(null, null, "department:manager", null, null, true, null, null);
            } else if (hasManager) {
                java.util.List<java.util.Map<String, Object>> deptManagers =
                        upmClient.searchUsers(null, null, "department:manager", null, null, true, null, null);
                for (java.util.Map<String, Object> u : deptManagers) {
                    higherIds.add(String.valueOf(u.get("id")));
                }
                java.util.List<java.util.Map<String, Object>> projCreate =
                        upmClient.searchUsers(null, null, "project:create", null, null, true, null, null);
                java.util.List<java.util.Map<String, Object>> taskCreate =
                        upmClient.searchUsers(null, null, "task:create", null, null, true, null, null);
                candidateUsers = new java.util.ArrayList<>();
                for (java.util.Map<String, Object> u : projCreate) {
                    if (!higherIds.contains(String.valueOf(u.get("id")))) candidateUsers.add(u);
                }
                for (java.util.Map<String, Object> u : taskCreate) {
                    String uid = String.valueOf(u.get("id"));
                    if (!higherIds.contains(uid) && candidateUsers.stream().noneMatch(c -> String.valueOf(c.get("id")).equals(uid))) {
                        candidateUsers.add(u);
                    }
                }
            } else if (hasProjectCreate) {
                java.util.List<java.util.Map<String, Object>> deptManagers =
                        upmClient.searchUsers(null, null, "department:manager", null, null, true, null, null);
                java.util.List<java.util.Map<String, Object>> projCreate =
                        upmClient.searchUsers(null, null, "project:create", null, null, true, null, null);
                for (java.util.Map<String, Object> u : deptManagers) higherIds.add(String.valueOf(u.get("id")));
                for (java.util.Map<String, Object> u : projCreate) higherIds.add(String.valueOf(u.get("id")));
                candidateUsers = new java.util.ArrayList<>();
                java.util.List<java.util.Map<String, Object>> taskCreate =
                        upmClient.searchUsers(null, null, "task:create", null, null, true, null, null);
                for (java.util.Map<String, Object> u : taskCreate) {
                    if (!higherIds.contains(String.valueOf(u.get("id")))) candidateUsers.add(u);
                }
            } else {
                java.util.List<java.util.Map<String, Object>> deptManagers =
                        upmClient.searchUsers(null, null, "department:manager", null, null, true, null, null);
                java.util.List<java.util.Map<String, Object>> projCreate =
                        upmClient.searchUsers(null, null, "project:create", null, null, true, null, null);
                java.util.List<java.util.Map<String, Object>> taskCreate =
                        upmClient.searchUsers(null, null, "task:create", null, null, true, null, null);
                for (java.util.Map<String, Object> u : deptManagers) higherIds.add(String.valueOf(u.get("id")));
                for (java.util.Map<String, Object> u : projCreate) higherIds.add(String.valueOf(u.get("id")));
                for (java.util.Map<String, Object> u : taskCreate) higherIds.add(String.valueOf(u.get("id")));
                candidateUsers = new java.util.ArrayList<>();
                java.util.List<java.util.Map<String, Object>> taskExecute =
                        upmClient.searchUsers(null, null, "task:execute", null, null, true, null, null);
                for (java.util.Map<String, Object> u : taskExecute) {
                    if (!higherIds.contains(String.valueOf(u.get("id")))) candidateUsers.add(u);
                }
            }

            boolean found = candidateUsers.stream().anyMatch(u -> {
                String uid = u.get("id") != null ? u.get("id").toString() : "";
                String dept = u.get("departmentId") != null ? u.get("departmentId").toString() : "";
                return uid.equals(assigneeId.toString()) && dept.equals(departmentId);
            });
            if (!found) {
                throw new IllegalArgumentException("被指派人不符合当前权限层级的指派要求");
            }
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(TaskPermissionHelper.class)
                    .warn("UPM 不可用，跳过被指派人层级校验: {}", e.getMessage());
        }
    }

    boolean isDepartmentManager(UUID userId) {
        try {
            java.util.List<java.util.Map<String, Object>> managers =
                    upmClient.searchUsers(null, null, "department:manager", null, null, true, null, null);
            return managers.stream().anyMatch(u -> {
                String uid = u.get("id") != null ? u.get("id").toString() : "";
                return uid.equals(userId.toString());
            });
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(TaskPermissionHelper.class)
                    .warn("UPM 不可用，跳过部门管理者校验: {}", e.getMessage());
            return false;
        }
    }
}
