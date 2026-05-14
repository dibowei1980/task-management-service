package com.example.taskmanagement.service;

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
import com.example.taskmanagement.model.Task;
import com.example.taskmanagement.model.TaskCategory;
import com.example.taskmanagement.model.TaskStatus;
import com.example.taskmanagement.model.WorkflowStages;
import com.example.taskmanagement.repository.TaskRepository;
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
public class V14StatusWorkloadTest {

    @Autowired
    private TaskService taskService;

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private ProjectTypeService projectTypeService;

    @Autowired
    private MeasurementUnitService measurementUnitService;

    @Autowired
    private TaskTypeGroupService taskTypeGroupService;

    @Autowired
    private TaskTypeService taskTypeService;

    private Authentication adminAuth;
    private String deptId;
    private String typeCode;
    private String unitCode;

    @BeforeEach
    void setUp() {
        adminAuth = new UsernamePasswordAuthenticationToken(
                "test-admin", "n/a",
                List.of(
                        new SimpleGrantedAuthority("project:create"),
                        new SimpleGrantedAuthority("project:read_global"),
                        new SimpleGrantedAuthority("project:update_global"),
                        new SimpleGrantedAuthority("PROJECT:CREATE"),
                        new SimpleGrantedAuthority("PROJECT:READ_GLOBAL"),
                        new SimpleGrantedAuthority("PROJECT:UPDATE_GLOBAL"),
                        new SimpleGrantedAuthority("task:create"),
                        new SimpleGrantedAuthority("task:update_global"),
                        new SimpleGrantedAuthority("task:execute"),
                        new SimpleGrantedAuthority("task:read_global"),
                        new SimpleGrantedAuthority("quality:check"),
                        new SimpleGrantedAuthority("TASK:CREATE"),
                        new SimpleGrantedAuthority("TASK:UPDATE_GLOBAL"),
                        new SimpleGrantedAuthority("TASK:EXECUTE")
                )
        );
        deptId = "V14_DEPT_" + System.nanoTime();

        MeasurementUnitRequest unitReq = new MeasurementUnitRequest();
        unitReq.setCode("V14U_" + System.nanoTime());
        unitReq.setName("v14测试单位");
        unitReq.setEnabled(true);
        unitReq.setBaseUnitCode("UNIT_COUNT");
        unitReq.setConversionFactor(1.0);
        MeasurementUnitResponse unit = measurementUnitService.create(unitReq);
        unitCode = unit.getCode();

        ProjectTypeRequest ptReq = new ProjectTypeRequest();
        ptReq.setCode("V14T_" + System.nanoTime());
        ptReq.setName("v14测试类型");
        ptReq.setEnabled(true);
        ProjectTypeResponse pt = projectTypeService.create(ptReq);
        typeCode = pt.getCode();

        TaskTypeGroupRequest groupReq = new TaskTypeGroupRequest();
        groupReq.setCode("V14G_" + System.nanoTime());
        groupReq.setName("v14测试分组");
        groupReq.setEnabled(true);
        UUID groupId = taskTypeGroupService.create(groupReq).getId();

        TaskTypeRequest tTypeReq = new TaskTypeRequest();
        tTypeReq.setCode(typeCode);
        tTypeReq.setName("v14测试任务类型");
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
        return taskService.createTask(req, adminAuth, deptId, null);
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
        return taskService.createTask(req, adminAuth, deptId, null);
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
    void T1_1_leafTaskCreatedWithDefaultStatusWorkloads() {
        TaskResponse project = createProject("T1_1项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        assertNotNull(leaf.getStatusWorkloads());
        Map<String, Double> sw = parseSW(leaf.getStatusWorkloads());
        assertEquals(100.0, sw.get(WorkflowStages.PENDING), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.ASSIGNED), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.RECEIVED), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.IN_PROGRESS), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.SUBMITTED_FOR_QA), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.QA_COMPLETED), 0.01);
    }

    @Test
    void T1_2_waterfallFlow_IN_PROGRESS() {
        TaskResponse project = createProject("T1_2项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        Map<String, Double> update = new LinkedHashMap<>();
        update.put(WorkflowStages.IN_PROGRESS, 40.0);
        TaskResponse updated = taskService.updateStatusWorkload(leaf.getId(), update, adminAuth, deptId, null);

        Map<String, Double> sw = parseSW(updated.getStatusWorkloads());
        assertEquals(60.0, sw.get(WorkflowStages.PENDING), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.ASSIGNED), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.RECEIVED), 0.01);
        assertEquals(40.0, sw.get(WorkflowStages.IN_PROGRESS), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.SUBMITTED_FOR_QA), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.QA_COMPLETED), 0.01);
    }

    @Test
    void T1_3_waterfallFlow_QA_COMPLETED() {
        TaskResponse project = createProject("T1_3项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        Map<String, Double> update = new LinkedHashMap<>();
        update.put(WorkflowStages.QA_COMPLETED, 100.0);
        TaskResponse updated = taskService.updateStatusWorkload(leaf.getId(), update, adminAuth, deptId, null);

        Map<String, Double> sw = parseSW(updated.getStatusWorkloads());
        assertEquals(0.0, sw.get(WorkflowStages.PENDING), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.ASSIGNED), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.RECEIVED), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.IN_PROGRESS), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.SUBMITTED_FOR_QA), 0.01);
        assertEquals(100.0, sw.get(WorkflowStages.QA_COMPLETED), 0.01);
        assertEquals(TaskStatus.COMPLETED, updated.getStatus());
    }

    @Test
    void T1_4_waterfallFlow_insufficientUpstream() {
        TaskResponse project = createProject("T1_4项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        Map<String, Double> update = new LinkedHashMap<>();
        update.put(WorkflowStages.IN_PROGRESS, 150.0);

        assertThrows(IllegalArgumentException.class, () ->
                taskService.updateStatusWorkload(leaf.getId(), update, adminAuth, deptId, null));
    }

    @Test
    void T1_5_waterfallFlow_partialSubmit() {
        TaskResponse project = createProject("T1_5项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        Map<String, Double> update1 = new LinkedHashMap<>();
        update1.put(WorkflowStages.IN_PROGRESS, 60.0);
        TaskResponse step1 = taskService.updateStatusWorkload(leaf.getId(), update1, adminAuth, deptId, null);

        Map<String, Double> update2 = new LinkedHashMap<>();
        update2.put(WorkflowStages.SUBMITTED_FOR_QA, 30.0);
        TaskResponse step2 = taskService.updateStatusWorkload(leaf.getId(), update2, adminAuth, deptId, null);

        Map<String, Double> sw = parseSW(step2.getStatusWorkloads());
        assertEquals(40.0, sw.get(WorkflowStages.PENDING), 0.01);
        assertEquals(30.0, sw.get(WorkflowStages.IN_PROGRESS), 0.01);
        assertEquals(30.0, sw.get(WorkflowStages.SUBMITTED_FOR_QA), 0.01);
    }

    @Test
    void T2_1_leafProgress_withDefaultWeight() {
        TaskResponse project = createProject("T2_1项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        Map<String, Double> update = new LinkedHashMap<>();
        update.put(WorkflowStages.IN_PROGRESS, 60.0);
        TaskResponse updated = taskService.updateStatusWorkload(leaf.getId(), update, adminAuth, deptId, null);

        assertEquals(0, updated.getProgress());
    }

    @Test
    void T2_2_leafProgress_withCustomWeight() {
        TaskResponse project = createProject("T2_2项目", 100);
        TaskCreateRequest req = new TaskCreateRequest();
        req.setName("自定义权重叶子");
        req.setCategory(TaskCategory.OPERATION_TASK);
        req.setType(typeCode);
        req.setWorkload(100.0);
        req.setWorkloadUnit(unitCode);
        req.setProjectId(project.getId());
        req.setParentTaskId(project.getId());
        req.setInProgressWeight(0.8);
        TaskResponse leaf = taskService.createTask(req, adminAuth, deptId, null);

        Map<String, Double> update = new LinkedHashMap<>();
        update.put(WorkflowStages.IN_PROGRESS, 50.0);
        TaskResponse updated = taskService.updateStatusWorkload(leaf.getId(), update, adminAuth, deptId, null);

        assertEquals(0, updated.getProgress());
    }

    @Test
    void T2_3_leafProgress_QA_COMPLETED_is100() {
        TaskResponse project = createProject("T2_3项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        Map<String, Double> update = new LinkedHashMap<>();
        update.put(WorkflowStages.QA_COMPLETED, 100.0);
        TaskResponse updated = taskService.updateStatusWorkload(leaf.getId(), update, adminAuth, deptId, null);

        assertEquals(100, updated.getProgress());
    }

    @Test
    void T3_1_nonLeafStatusDerived_allCompleted() {
        TaskResponse project = createProject("T3_1项目", 200);
        TaskResponse leaf1 = createLeafTask(project.getId(), "叶子1", 100);
        TaskResponse leaf2 = createLeafTask(project.getId(), "叶子2", 100);

        Map<String, Double> complete = new LinkedHashMap<>();
        complete.put(WorkflowStages.QA_COMPLETED, 100.0);
        taskService.updateStatusWorkload(leaf1.getId(), complete, adminAuth, deptId, null);
        taskService.updateStatusWorkload(leaf2.getId(), complete, adminAuth, deptId, null);

        TaskResponse refreshed = taskService.getTaskById(project.getId(), adminAuth, deptId, null, null);
        assertEquals(TaskStatus.QA_COMPLETED, refreshed.getStatus(), "根项目所有叶子完成应推导为QA_COMPLETED");
    }

    @Test
    void T3_2_nonLeafStatusDerived_mixedStates() {
        TaskResponse project = createProject("T3_2项目", 200);
        TaskResponse leaf1 = createLeafTask(project.getId(), "叶子1", 100);
        TaskResponse leaf2 = createLeafTask(project.getId(), "叶子2", 100);

        Map<String, Double> inProgress = new LinkedHashMap<>();
        inProgress.put(WorkflowStages.IN_PROGRESS, 100.0);
        taskService.updateStatusWorkload(leaf1.getId(), inProgress, adminAuth, deptId, null);

        TaskResponse refreshed = taskService.getTaskById(project.getId(), adminAuth, deptId, null, null);
        assertNull(refreshed.getStatus(), "子节点状态混合时父节点状态应为 null");
    }

    @Test
    void T3_3_nonLeafStatusDerived_allPending() {
        TaskResponse project = createProject("T3_3项目", 200);
        createLeafTask(project.getId(), "叶子1", 100);
        createLeafTask(project.getId(), "叶子2", 100);

        TaskResponse refreshed = taskService.getTaskById(project.getId(), adminAuth, deptId, null, null);
        assertEquals(TaskStatus.ASSIGNED, refreshed.getStatus());
    }

    @Test
    void T4_1_rootProjectAutoTransition_allLeavesQACompleted() {
        TaskResponse project = createProject("T4_1项目", 200);
        TaskResponse leaf1 = createLeafTask(project.getId(), "叶子1", 100);
        TaskResponse leaf2 = createLeafTask(project.getId(), "叶子2", 100);

        Map<String, Double> complete = new LinkedHashMap<>();
        complete.put(WorkflowStages.QA_COMPLETED, 100.0);
        taskService.updateStatusWorkload(leaf1.getId(), complete, adminAuth, deptId, null);
        taskService.updateStatusWorkload(leaf2.getId(), complete, adminAuth, deptId, null);

        TaskResponse refreshed = taskService.getTaskById(project.getId(), adminAuth, deptId, null, null);
        assertEquals(TaskStatus.QA_COMPLETED, refreshed.getStatus());
    }

    @Test
    void T4_2_rootProjectAutoTransition_partialQACompleted() {
        TaskResponse project = createProject("T4_2项目", 200);
        TaskResponse leaf1 = createLeafTask(project.getId(), "叶子1", 100);
        TaskResponse leaf2 = createLeafTask(project.getId(), "叶子2", 100);

        Map<String, Double> complete = new LinkedHashMap<>();
        complete.put(WorkflowStages.QA_COMPLETED, 100.0);
        taskService.updateStatusWorkload(leaf1.getId(), complete, adminAuth, deptId, null);

        TaskResponse refreshed = taskService.getTaskById(project.getId(), adminAuth, deptId, null, null);
        assertNotEquals(TaskStatus.QA_COMPLETED, refreshed.getStatus());
    }

    @Test
    void T5_1_selfCheckTaskCreationBlocked() {
        TaskCreateRequest req = new TaskCreateRequest();
        req.setName("自检任务");
        req.setCategory(TaskCategory.SELF_CHECK_TASK);
        req.setType(typeCode);
        req.setDepartmentId(deptId);
        req.setWorkload(10.0);
        req.setWorkloadUnit(unitCode);

        assertThrows(IllegalArgumentException.class, () ->
                taskService.createTask(req, adminAuth, deptId, null));
    }

    @Test
    void T5_2_operationTaskNoLongerCreatesSelfCheck() {
        TaskResponse project = createProject("T5_2项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "操作任务", 100);

        java.util.Optional<Task> selfCheck = taskRepository.findBySelfCheckForTaskId(leaf.getId());
        assertTrue(selfCheck.isEmpty(), "v1.4 不再自动创建自检任务");
    }

    @Test
    void T6_1_qaDepartmentAndAssigneeSet() {
        TaskResponse project = createProject("T6_1项目", 100);
        UUID qaAssignee = UUID.randomUUID();

        TaskCreateRequest req = new TaskCreateRequest();
        req.setName("质检指定任务");
        req.setCategory(TaskCategory.OPERATION_TASK);
        req.setType(typeCode);
        req.setWorkload(100.0);
        req.setWorkloadUnit(unitCode);
        req.setProjectId(project.getId());
        req.setParentTaskId(project.getId());
        req.setQaDepartmentId("QA_DEPT_001");
        req.setQaAssigneeId(qaAssignee);
        TaskResponse leaf = taskService.createTask(req, adminAuth, deptId, null);

        assertEquals("QA_DEPT_001", leaf.getQaDepartmentId());
        assertEquals(qaAssignee, leaf.getQaAssigneeId());
    }

    @Test
    void T7_1_autoTransferOnStatusChange() {
        TaskResponse project = createProject("T7_1项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        taskService.updateTaskStatus(leaf.getId(), TaskStatus.IN_PROGRESS, adminAuth, deptId, null);

        TaskResponse refreshed = taskService.getTaskById(leaf.getId(), adminAuth, deptId, null, null);
        Map<String, Double> sw = parseSW(refreshed.getStatusWorkloads());
        assertEquals(0.0, sw.get(WorkflowStages.PENDING), 0.01);
        assertTrue(sw.get(WorkflowStages.IN_PROGRESS) > 0, "状态变更应自动搬移工作量到 IN_PROGRESS");
    }

    @Test
    void T7_2_autoTransferOnAssign() {
        TaskResponse project = createProject("T7_2项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        taskService.updateTaskStatus(leaf.getId(), TaskStatus.ASSIGNED, adminAuth, deptId, null);

        TaskResponse refreshed = taskService.getTaskById(leaf.getId(), adminAuth, deptId, null, null);
        Map<String, Double> sw = parseSW(refreshed.getStatusWorkloads());
        assertEquals(0.0, sw.get(WorkflowStages.PENDING), 0.01);
        assertTrue(sw.get(WorkflowStages.ASSIGNED) > 0, "状态变更应自动搬移工作量到 ASSIGNED");
    }

    @Test
    void T8_1_conservationConstraint() {
        TaskResponse project = createProject("T8_1项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        Map<String, Double> update = new LinkedHashMap<>();
        update.put(WorkflowStages.IN_PROGRESS, 40.0);
        update.put(WorkflowStages.SUBMITTED_FOR_QA, 30.0);
        TaskResponse updated = taskService.updateStatusWorkload(leaf.getId(), update, adminAuth, deptId, null);

        Map<String, Double> sw = parseSW(updated.getStatusWorkloads());
        double sum = sw.values().stream().mapToDouble(Double::doubleValue).sum();
        assertEquals(100.0, sum, 0.01, "各状态工作量之和必须等于总工作量");
    }

    @Test
    void T8_2_negativeWorkloadRejected() {
        TaskResponse project = createProject("T8_2项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        Map<String, Double> update = new LinkedHashMap<>();
        update.put(WorkflowStages.IN_PROGRESS, -10.0);

        assertThrows(IllegalArgumentException.class, () ->
                taskService.updateStatusWorkload(leaf.getId(), update, adminAuth, deptId, null));
    }

    @Test
    void T9_1_rootProjectStatusWorkloadUpdateAppliesWaterfallFlow() {
        TaskResponse project = createProject("T9_1项目", 100);

        Map<String, Double> update = new LinkedHashMap<>();
        update.put(WorkflowStages.IN_PROGRESS, 50.0);
        TaskResponse updated = taskService.updateStatusWorkload(project.getId(), update, adminAuth, deptId, null);

        Map<String, Double> sw = parseSW(updated.getStatusWorkloads());
        assertEquals(50.0, sw.get(WorkflowStages.IN_PROGRESS), 0.01);
        assertEquals(50.0, sw.get(WorkflowStages.ASSIGNED), 0.01);
    }

    @Test
    void T10_1_inProgressWeightDefault() {
        TaskResponse project = createProject("T10_1项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        assertEquals(0.95, leaf.getInProgressWeight(), 0.001, "默认 IN_PROGRESS 已完成量权重应为 0.95");
    }

    @Test
    void T10_2_inProgressWeightCustom() {
        TaskResponse project = createProject("T10_2项目", 100);
        TaskCreateRequest req = new TaskCreateRequest();
        req.setName("自定义权重");
        req.setCategory(TaskCategory.OPERATION_TASK);
        req.setType(typeCode);
        req.setWorkload(100.0);
        req.setWorkloadUnit(unitCode);
        req.setProjectId(project.getId());
        req.setParentTaskId(project.getId());
        req.setInProgressWeight(0.7);
        TaskResponse leaf = taskService.createTask(req, adminAuth, deptId, null);

        assertEquals(0.7, leaf.getInProgressWeight(), 0.001);
    }

    @Test
    void T11_1_waterfallFlow_multiStepProgression() {
        TaskResponse project = createProject("T11_1项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "叶子任务", 100);

        Map<String, Double> u1 = new LinkedHashMap<>();
        u1.put(WorkflowStages.ASSIGNED, 100.0);
        TaskResponse s1 = taskService.updateStatusWorkload(leaf.getId(), u1, adminAuth, deptId, null);
        assertEquals(TaskStatus.ASSIGNED, s1.getStatus());

        Map<String, Double> u2 = new LinkedHashMap<>();
        u2.put(WorkflowStages.RECEIVED, 100.0);
        TaskResponse s2 = taskService.updateStatusWorkload(leaf.getId(), u2, adminAuth, deptId, null);
        assertEquals(TaskStatus.RECEIVED, s2.getStatus());

        Map<String, Double> u3 = new LinkedHashMap<>();
        u3.put(WorkflowStages.IN_PROGRESS, 50.0);
        TaskResponse s3 = taskService.updateStatusWorkload(leaf.getId(), u3, adminAuth, deptId, null);
        assertEquals(TaskStatus.IN_PROGRESS, s3.getStatus());

        Map<String, Double> sw = parseSW(s3.getStatusWorkloads());
        assertEquals(50.0, sw.get(WorkflowStages.RECEIVED), 0.01);
        assertEquals(50.0, sw.get(WorkflowStages.IN_PROGRESS), 0.01);
    }

    @Test
    void T12_1_parentProgressAggregation() {
        TaskResponse project = createProject("T12_1项目", 200);
        TaskResponse leaf1 = createLeafTask(project.getId(), "叶子1", 100);
        TaskResponse leaf2 = createLeafTask(project.getId(), "叶子2", 100);

        Map<String, Double> halfDone = new LinkedHashMap<>();
        halfDone.put(WorkflowStages.IN_PROGRESS, 100.0);
        taskService.updateStatusWorkload(leaf1.getId(), halfDone, adminAuth, deptId, null);

        Map<String, Double> complete = new LinkedHashMap<>();
        complete.put(WorkflowStages.QA_COMPLETED, 100.0);
        taskService.updateStatusWorkload(leaf2.getId(), complete, adminAuth, deptId, null);

        TaskResponse refreshed = taskService.getTaskById(project.getId(), adminAuth, deptId, null, null);
        assertTrue(refreshed.getProgress() > 0, "父节点进度应大于0");
        assertTrue(refreshed.getProgress() < 100, "父节点进度应小于100");
    }
}
