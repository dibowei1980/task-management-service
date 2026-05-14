package com.example.taskmanagement.security;

import com.example.taskmanagement.model.Task;
import com.example.taskmanagement.model.TaskAssignment;
import com.example.taskmanagement.model.TaskAssignmentRole;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

public class TaskScopePolicyTest {
    private final TaskScopePolicy policy = new TaskScopePolicy();

    @Test
    void productionManager_canCreate_anyProjectInDept() {
        var auth = new UsernamePasswordAuthenticationToken("u", "n/a", List.of(new SimpleGrantedAuthority("project:read_global")));
        Task project = new Task();
        project.setDepartmentId("1");

        assertDoesNotThrow(() -> policy.assertCanCreate(auth, UUID.randomUUID(), "2", project, UUID.randomUUID(), null, List.of()));
    }

    @Test
    void departmentAdmin_canCreate_onlyOwnDepartment() {
        var auth = new UsernamePasswordAuthenticationToken("u", "n/a", List.of(new SimpleGrantedAuthority("project:read_department")));
        Task project = new Task();
        project.setDepartmentId("10");

        assertDoesNotThrow(() -> policy.assertCanCreate(auth, UUID.randomUUID(), "10", project, UUID.randomUUID(), null, List.of()));
        assertThrows(AccessDeniedException.class, () -> policy.assertCanCreate(auth, UUID.randomUUID(), "11", project, UUID.randomUUID(), null, List.of()));
    }

    @Test
    void projectManager_canCreate_onlyAssignedProject() {
        var auth = new UsernamePasswordAuthenticationToken("u", "n/a", List.of(new SimpleGrantedAuthority("project:read_own")));
        UUID pmId = UUID.randomUUID();
        Task project = new Task();
        project.setDepartmentId("1");
        project.setAssigneeId(pmId);

        assertDoesNotThrow(() -> policy.assertCanCreate(auth, pmId, "1", project, UUID.randomUUID(), null, List.of()));
        assertThrows(AccessDeniedException.class, () -> policy.assertCanCreate(auth, UUID.randomUUID(), "1", project, UUID.randomUUID(), null, List.of()));
    }

    @Test
    void projectManager_canCreate_ifParentTaskAssignee() {
        var auth = new UsernamePasswordAuthenticationToken("u", "n/a", List.of(new SimpleGrantedAuthority("project:read_own")));
        UUID userId = UUID.randomUUID();
        Task project = new Task();
        project.setDepartmentId("1");

        Task parentTask = new Task();
        parentTask.setAssigneeId(userId);

        assertDoesNotThrow(() -> policy.assertCanCreate(auth, userId, "1", project, UUID.randomUUID(), parentTask, List.of()));

        Task otherParent = new Task();
        otherParent.setAssigneeId(UUID.randomUUID());
        assertThrows(AccessDeniedException.class, () -> policy.assertCanCreate(auth, userId, "1", project, UUID.randomUUID(), otherParent, List.of()));
    }

    @Test
    void operator_canCreate_onlyUnderAssignedParentTask() {
        var auth = new UsernamePasswordAuthenticationToken("u", "n/a", List.of(new SimpleGrantedAuthority("task:execute")));
        UUID operatorId = UUID.randomUUID();
        UUID parentTaskId = UUID.randomUUID();
        Task project = new Task();
        project.setDepartmentId("1");

        List<TaskAssignment> assigned = List.of(new TaskAssignment(parentTaskId, operatorId, TaskAssignmentRole.OPERATOR));
        assertDoesNotThrow(() -> policy.assertCanCreate(auth, operatorId, "1", project, parentTaskId, null, assigned));

        List<TaskAssignment> notAssigned = List.of();
        assertThrows(AccessDeniedException.class, () -> policy.assertCanCreate(auth, operatorId, "1", project, parentTaskId, null, notAssigned));
        assertThrows(AccessDeniedException.class, () -> policy.assertCanCreate(auth, operatorId, "1", project, null, null, assigned));
    }

    @Test
    void otherRole_denied() {
        var auth = new UsernamePasswordAuthenticationToken("u", "n/a", List.of(new SimpleGrantedAuthority("quality:check")));
        Task project = new Task();
        project.setDepartmentId("1");

        assertThrows(AccessDeniedException.class, () -> policy.assertCanCreate(auth, UUID.randomUUID(), "1", project, UUID.randomUUID(), null, List.of()));
    }
}
