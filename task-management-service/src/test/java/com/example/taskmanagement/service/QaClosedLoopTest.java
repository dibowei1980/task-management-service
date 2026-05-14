package com.example.taskmanagement.service;

import com.example.taskmanagement.dto.AssignRequest;
import com.example.taskmanagement.dto.MeasurementUnitRequest;
import com.example.taskmanagement.dto.MeasurementUnitResponse;
import com.example.taskmanagement.dto.ProjectTypeRequest;
import com.example.taskmanagement.dto.ProjectTypeResponse;
import com.example.taskmanagement.dto.TaskCreateRequest;
import com.example.taskmanagement.dto.TaskResponse;
import com.example.taskmanagement.dto.TaskTypeGroupRequest;
import com.example.taskmanagement.dto.TaskTypeGroupResponse;
import com.example.taskmanagement.dto.TaskTypeRequest;
import com.example.taskmanagement.dto.TaskTypeResponse;
import com.example.taskmanagement.model.TaskCategory;
import com.example.taskmanagement.model.TaskStatus;
import com.example.taskmanagement.model.WorkflowStages;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
@WithMockUser(authorities = {"ROLE_DEVELOPER"})
public class QaClosedLoopTest {

    @Autowired
    private TaskService taskService;

    @Autowired
    private ProjectTypeService projectTypeService;

    @Autowired
    private MeasurementUnitService measurementUnitService;

    @Autowired
    private TaskTypeGroupService taskTypeGroupService;

    @Autowired
    private TaskTypeService taskTypeService;

    private Authentication adminAuth;
    private Authentication qaAuth;
    private Authentication executorAuth;
    private UUID executorUserId;
    private UUID qaUserId;
    private UUID adminUserId;
    private String deptId;
    private String typeCode;
    private String unitCode;

    @BeforeEach
    void setUp() {
        executorUserId = UUID.randomUUID();
        qaUserId = UUID.randomUUID();
        adminUserId = UUID.randomUUID();

        adminAuth = new UsernamePasswordAuthenticationToken(
                "test-admin", "n/a",
                List.of(
                        new SimpleGrantedAuthority("project:create"),
                        new SimpleGrantedAuthority("project:read_global"),
                        new SimpleGrantedAuthority("project:update_global"),
                        new SimpleGrantedAuthority("task:create"),
                        new SimpleGrantedAuthority("task:update_global"),
                        new SimpleGrantedAuthority("task:execute"),
                        new SimpleGrantedAuthority("task:read_global"),
                        new SimpleGrantedAuthority("TASK:CREATE"),
                        new SimpleGrantedAuthority("TASK:UPDATE_GLOBAL"),
                        new SimpleGrantedAuthority("TASK:EXECUTE")
                )
        );

        qaAuth = new UsernamePasswordAuthenticationToken(
                "qa-user", "n/a",
                List.of(
                        new SimpleGrantedAuthority("quality:check"),
                        new SimpleGrantedAuthority("quality:approve"),
                        new SimpleGrantedAuthority("QUALITY:CHECK"),
                        new SimpleGrantedAuthority("QUALITY:APPROVE"),
                        new SimpleGrantedAuthority("task:read_global")
                )
        );

        executorAuth = new UsernamePasswordAuthenticationToken(
                "executor-user", "n/a",
                List.of(
                        new SimpleGrantedAuthority("task:execute"),
                        new SimpleGrantedAuthority("TASK:EXECUTE"),
                        new SimpleGrantedAuthority("task:read_global")
                )
        );

        deptId = "QA_DEPT_" + System.nanoTime();

        MeasurementUnitRequest unitReq = new MeasurementUnitRequest();
        unitReq.setCode("QAU_" + System.nanoTime());
        unitReq.setName("qa测试单位");
        unitReq.setEnabled(true);
        unitReq.setBaseUnitCode("UNIT_COUNT");
        unitReq.setConversionFactor(1.0);
        MeasurementUnitResponse unit = measurementUnitService.create(unitReq);
        unitCode = unit.getCode();

        ProjectTypeRequest ptReq = new ProjectTypeRequest();
        ptReq.setCode("QAPT_" + System.nanoTime());
        ptReq.setName("qa测试类型");
        ptReq.setEnabled(true);
        ProjectTypeResponse pt = projectTypeService.create(ptReq);
        typeCode = pt.getCode();

        TaskTypeGroupRequest groupReq = new TaskTypeGroupRequest();
        groupReq.setCode("QAG_" + System.nanoTime());
        groupReq.setName("qa测试分组");
        groupReq.setEnabled(true);
        UUID groupId = taskTypeGroupService.create(groupReq).getId();

        TaskTypeRequest tTypeReq = new TaskTypeRequest();
        tTypeReq.setCode(typeCode);
        tTypeReq.setName("qa测试任务类型");
        tTypeReq.setGroupId(groupId);
        tTypeReq.setEnabled(true);
        taskTypeService.create(tTypeReq);
    }

    private TaskResponse createProject(String name, double workload) {
        TaskCreateRequest req = new TaskCreateRequest();
        req.setName(name);
        req.setCategory(TaskCategory.PROJECT);
        req.setType(typeCode);
        req.setDepartmentId(deptId);
        req.setCreatedByName("tester");
        req.setWorkload(workload);
        req.setWorkloadUnit(unitCode);
        return taskService.createTask(req, adminAuth, deptId, adminUserId);
    }

    private TaskResponse createLeafTask(UUID parentId, String name, double workload) {
        TaskCreateRequest req = new TaskCreateRequest();
        req.setName(name);
        req.setCategory(TaskCategory.OPERATION_TASK);
        req.setType(typeCode);
        req.setWorkload(workload);
        req.setWorkloadUnit(unitCode);
        req.setProjectId(parentId);
        req.setParentTaskId(parentId);
        return taskService.createTask(req, adminAuth, deptId, adminUserId);
    }

    private TaskResponse submitToQa(TaskResponse leaf) {
        Map<String, Double> update = new LinkedHashMap<>();
        update.put(WorkflowStages.SUBMITTED_FOR_QA, leaf.getWorkload());
        return taskService.updateStatusWorkload(leaf.getId(), update, adminAuth, deptId, null);
    }

    private Map<String, Double> parseSW(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
            com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>> ref = new com.fasterxml.jackson.core.type.TypeReference<>() {};
            Map<String, Object> raw = om.readValue(json, ref);
            Map<String, Double> result = new LinkedHashMap<>();
            for (String stage : WorkflowStages.LEAF_WORKFLOW_STAGES) {
                Object val = raw.get(stage);
                result.put(stage, val != null ? ((Number) val).doubleValue() : 0.0);
            }
            return result;
        } catch (Exception e) {
            return Map.of();
        }
    }

    @Test
    void acceptQa_transitionsToQaCompleting() {
        TaskResponse project = createProject("acceptQa项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);
        TaskResponse submitted = submitToQa(leaf);

        assertEquals(TaskStatus.SUBMITTED_FOR_QA, submitted.getStatus());

        TaskResponse accepted = taskService.acceptQa(leaf.getId(), qaAuth, deptId, qaUserId);
        assertEquals(TaskStatus.QA_COMPLETING, accepted.getStatus());

        Map<String, Double> sw = parseSW(accepted.getStatusWorkloads());
        assertEquals(0.0, sw.get(WorkflowStages.SUBMITTED_FOR_QA), 0.01);
        assertEquals(100.0, sw.get(WorkflowStages.QA_COMPLETING), 0.01);
        assertEquals(qaUserId, accepted.getAssigneeId());
    }

    @Test
    void acceptQa_rejectedWhenNotSubmittedForQa() {
        TaskResponse project = createProject("acceptQa拒绝项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        assertThrows(IllegalArgumentException.class, () ->
                taskService.acceptQa(leaf.getId(), qaAuth, deptId, qaUserId));
    }

    @Test
    void qaReject_transitionsBackToInProgress() {
        TaskResponse project = createProject("qaReject项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);
        submitToQa(leaf);
        taskService.acceptQa(leaf.getId(), qaAuth, deptId, qaUserId);

        TaskResponse rejected = taskService.qaReject(leaf.getId(), qaAuth, deptId, qaUserId);
        assertEquals(TaskStatus.IN_PROGRESS, rejected.getStatus());

        Map<String, Double> sw = parseSW(rejected.getStatusWorkloads());
        assertEquals(0.0, sw.get(WorkflowStages.QA_COMPLETING), 0.01);
        assertEquals(100.0, sw.get(WorkflowStages.IN_PROGRESS), 0.01);
    }

    @Test
    void qaReject_rejectedWhenNotQaCompleting() {
        TaskResponse project = createProject("qaReject拒绝项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);
        submitToQa(leaf);

        assertThrows(IllegalArgumentException.class, () ->
                taskService.qaReject(leaf.getId(), qaAuth, deptId, qaUserId));
    }

    @Test
    void revokeQa_transitionsFromSubmittedForQaBackToInProgress() {
        TaskResponse project = createProject("revokeQa项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        AssignRequest assignReq = new AssignRequest();
        assignReq.setDepartmentId(deptId);
        assignReq.setAssigneeId(executorUserId);
        taskService.assignTask(leaf.getId(), assignReq, adminAuth, deptId, adminUserId);

        submitToQa(leaf);

        TaskResponse revoked = taskService.revokeQa(leaf.getId(), executorAuth, deptId, executorUserId);
        assertEquals(TaskStatus.IN_PROGRESS, revoked.getStatus());

        Map<String, Double> sw = parseSW(revoked.getStatusWorkloads());
        assertEquals(0.0, sw.get(WorkflowStages.SUBMITTED_FOR_QA), 0.01);
        assertEquals(100.0, sw.get(WorkflowStages.IN_PROGRESS), 0.01);
    }

    @Test
    void revokeQa_rejectedWhenNotSubmittedForQa() {
        TaskResponse project = createProject("revokeQa拒绝项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        AssignRequest assignReq = new AssignRequest();
        assignReq.setDepartmentId(deptId);
        assignReq.setAssigneeId(executorUserId);
        taskService.assignTask(leaf.getId(), assignReq, adminAuth, deptId, adminUserId);

        assertThrows(IllegalArgumentException.class, () ->
                taskService.revokeQa(leaf.getId(), executorAuth, deptId, executorUserId));
    }

    @Test
    void revokeQa_rejectedAfterAcceptQa() {
        TaskResponse project = createProject("revokeQa后拒绝项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        AssignRequest assignReq = new AssignRequest();
        assignReq.setDepartmentId(deptId);
        assignReq.setAssigneeId(executorUserId);
        taskService.assignTask(leaf.getId(), assignReq, adminAuth, deptId, adminUserId);

        submitToQa(leaf);
        taskService.acceptQa(leaf.getId(), qaAuth, deptId, qaUserId);

        Authentication revokeAuth = new UsernamePasswordAuthenticationToken(
                "revoke-user", "n/a",
                List.of(
                        new SimpleGrantedAuthority("task:execute"),
                        new SimpleGrantedAuthority("TASK:EXECUTE"),
                        new SimpleGrantedAuthority("task:read_global")
                )
        );
        assertThrows(IllegalArgumentException.class, () ->
                taskService.revokeQa(leaf.getId(), revokeAuth, deptId, qaUserId));
    }

    @Test
    void fullQaClosedLoop_submitAcceptPass() {
        TaskResponse project = createProject("完整闭环通过项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        submitToQa(leaf);
        taskService.acceptQa(leaf.getId(), qaAuth, deptId, qaUserId);

        Map<String, Double> passUpdate = new LinkedHashMap<>();
        passUpdate.put(WorkflowStages.QA_COMPLETED, 100.0);
        TaskResponse passed = taskService.updateStatusWorkload(leaf.getId(), passUpdate, qaAuth, deptId, null);

        assertEquals(TaskStatus.COMPLETED, passed.getStatus());
        Map<String, Double> sw = parseSW(passed.getStatusWorkloads());
        assertEquals(100.0, sw.get(WorkflowStages.QA_COMPLETED), 0.01);
    }

    @Test
    void fullQaClosedLoop_submitAcceptRejectResubmit() {
        TaskResponse project = createProject("完整闭环驳回项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        submitToQa(leaf);
        taskService.acceptQa(leaf.getId(), qaAuth, deptId, qaUserId);
        taskService.qaReject(leaf.getId(), qaAuth, deptId, qaUserId);

        TaskResponse afterReject = taskService.getTaskById(leaf.getId(), adminAuth, deptId, null, null);
        assertEquals(TaskStatus.IN_PROGRESS, afterReject.getStatus());

        TaskResponse resubmitted = submitToQa(afterReject);
        assertEquals(TaskStatus.SUBMITTED_FOR_QA, resubmitted.getStatus());

        taskService.acceptQa(leaf.getId(), qaAuth, deptId, qaUserId);

        Map<String, Double> passUpdate = new LinkedHashMap<>();
        passUpdate.put(WorkflowStages.QA_COMPLETED, 100.0);
        TaskResponse passed = taskService.updateStatusWorkload(leaf.getId(), passUpdate, qaAuth, deptId, null);
        assertEquals(TaskStatus.COMPLETED, passed.getStatus());
    }

    @Test
    void fullQaClosedLoop_submitRevokeResubmit() {
        TaskResponse project = createProject("撤销后重新提交项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        AssignRequest assignReq = new AssignRequest();
        assignReq.setDepartmentId(deptId);
        assignReq.setAssigneeId(executorUserId);
        taskService.assignTask(leaf.getId(), assignReq, adminAuth, deptId, adminUserId);

        submitToQa(leaf);
        taskService.revokeQa(leaf.getId(), executorAuth, deptId, executorUserId);

        TaskResponse afterRevoke = taskService.getTaskById(leaf.getId(), adminAuth, deptId, null, null);
        assertEquals(TaskStatus.IN_PROGRESS, afterRevoke.getStatus());

        TaskResponse resubmitted = submitToQa(afterRevoke);
        assertEquals(TaskStatus.SUBMITTED_FOR_QA, resubmitted.getStatus());
    }

    @Test
    void acceptQa_requiresQualityCheckPermission() {
        TaskResponse project = createProject("权限校验项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);
        submitToQa(leaf);

        Authentication noQaAuth = new UsernamePasswordAuthenticationToken(
                "no-qa-user", "n/a",
                List.of(new SimpleGrantedAuthority("task:read_global"))
        );

        assertThrows(org.springframework.security.access.AccessDeniedException.class, () ->
                taskService.acceptQa(leaf.getId(), noQaAuth, deptId, qaUserId));
    }

    @Test
    void qaReject_workloadConservationAfterReject() {
        TaskResponse project = createProject("工作量守恒项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        Map<String, Double> ipUpdate = new LinkedHashMap<>();
        ipUpdate.put(WorkflowStages.IN_PROGRESS, 60.0);
        taskService.updateStatusWorkload(leaf.getId(), ipUpdate, adminAuth, deptId, null);

        Map<String, Double> qaUpdate = new LinkedHashMap<>();
        qaUpdate.put(WorkflowStages.SUBMITTED_FOR_QA, 60.0);
        taskService.updateStatusWorkload(leaf.getId(), qaUpdate, adminAuth, deptId, null);

        taskService.acceptQa(leaf.getId(), qaAuth, deptId, qaUserId);
        TaskResponse rejected = taskService.qaReject(leaf.getId(), qaAuth, deptId, qaUserId);

        Map<String, Double> sw = parseSW(rejected.getStatusWorkloads());
        double sum = sw.values().stream().mapToDouble(Double::doubleValue).sum();
        assertEquals(100.0, sum, 0.01, "驳回后各状态工作量之和必须等于总工作量");
    }
}
