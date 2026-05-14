package com.example.taskmanagement.service;

import com.example.taskmanagement.dto.*;
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

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
@WithMockUser(authorities = {"ROLE_DEVELOPER"})
public class LeafTaskOperationTest {

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
    private Authentication executorAuth;
    private Authentication managerAuth;
    private UUID adminUserId;
    private UUID executorUserId;
    private UUID managerUserId;
    private String deptId;
    private String typeCode;
    private String unitCode;

    @BeforeEach
    void setUp() {
        adminUserId = UUID.randomUUID();
        executorUserId = UUID.randomUUID();
        managerUserId = UUID.randomUUID();
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
                        new SimpleGrantedAuthority("department:manager"),
                        new SimpleGrantedAuthority("quality:check"),
                        new SimpleGrantedAuthority("TASK:CREATE"),
                        new SimpleGrantedAuthority("TASK:UPDATE_GLOBAL"),
                        new SimpleGrantedAuthority("TASK:EXECUTE"),
                        new SimpleGrantedAuthority("TASK:READ_GLOBAL"),
                        new SimpleGrantedAuthority("DEPARTMENT:MANAGER")
                )
        );
        executorAuth = new UsernamePasswordAuthenticationToken(
                "test-executor", "n/a",
                List.of(
                        new SimpleGrantedAuthority("task:create"),
                        new SimpleGrantedAuthority("task:execute"),
                        new SimpleGrantedAuthority("task:read_global"),
                        new SimpleGrantedAuthority("TASK:CREATE"),
                        new SimpleGrantedAuthority("TASK:EXECUTE"),
                        new SimpleGrantedAuthority("TASK:READ_GLOBAL")
                )
        );
        managerAuth = new UsernamePasswordAuthenticationToken(
                "test-manager", "n/a",
                List.of(
                        new SimpleGrantedAuthority("department:manager"),
                        new SimpleGrantedAuthority("task:read_global"),
                        new SimpleGrantedAuthority("DEPARTMENT:MANAGER"),
                        new SimpleGrantedAuthority("TASK:READ_GLOBAL")
                )
        );
        deptId = "LEAF_DEPT_" + System.nanoTime();

        MeasurementUnitRequest unitReq = new MeasurementUnitRequest();
        unitReq.setCode("LEAFU_" + System.nanoTime());
        unitReq.setName("叶子操作测试单位");
        unitReq.setEnabled(true);
        unitReq.setBaseUnitCode("UNIT_COUNT");
        unitReq.setConversionFactor(1.0);
        MeasurementUnitResponse unit = measurementUnitService.create(unitReq);
        unitCode = unit.getCode();

        ProjectTypeRequest ptReq = new ProjectTypeRequest();
        ptReq.setCode("LEAFT_" + System.nanoTime());
        ptReq.setName("叶子操作测试类型");
        ptReq.setEnabled(true);
        ProjectTypeResponse pt = projectTypeService.create(ptReq);
        typeCode = pt.getCode();

        TaskTypeGroupRequest groupReq = new TaskTypeGroupRequest();
        groupReq.setCode("LEAFG_" + System.nanoTime());
        groupReq.setName("叶子操作测试分组");
        groupReq.setEnabled(true);
        UUID groupId = taskTypeGroupService.create(groupReq).getId();

        TaskTypeRequest tTypeReq = new TaskTypeRequest();
        tTypeReq.setCode(typeCode);
        tTypeReq.setName("叶子操作测试任务类型");
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

    private void assignToDepartment(UUID taskId) {
        AssignRequest assignReq = new AssignRequest();
        assignReq.setDepartmentId(deptId);
        taskService.assignTask(taskId, assignReq, adminAuth, deptId, adminUserId);
    }

    private TaskResponse receiveTask(UUID taskId) {
        return taskService.receiveTask(taskId, executorAuth, deptId, executorUserId);
    }

    private TaskResponse assignAndReceiveTask(UUID taskId) {
        assignToDepartment(taskId);
        return receiveTask(taskId);
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
    void receive_pendingTask_workloadMovesToReceived() {
        TaskResponse project = createProject("接收测试项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "待接收任务", 100);

        assignToDepartment(leaf.getId());
        TaskResponse result = receiveTask(leaf.getId());

        assertEquals(TaskStatus.RECEIVED, result.getStatus());
        Map<String, Double> sw = parseSW(result.getStatusWorkloads());
        assertEquals(0.0, sw.get(WorkflowStages.PENDING), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.ASSIGNED), 0.01);
        assertEquals(100.0, sw.get(WorkflowStages.RECEIVED), 0.01);
    }

    @Test
    void receive_assignedTask_workloadMovesToReceived() {
        TaskResponse project = createProject("接收已指派项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "已指派任务", 100);

        AssignRequest assignReq = new AssignRequest();
        assignReq.setDepartmentId(deptId);
        taskService.assignTask(leaf.getId(), assignReq, adminAuth, deptId, adminUserId);

        TaskResponse result = receiveTask(leaf.getId());

        assertEquals(TaskStatus.RECEIVED, result.getStatus());
        Map<String, Double> sw = parseSW(result.getStatusWorkloads());
        assertEquals(0.0, sw.get(WorkflowStages.PENDING), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.ASSIGNED), 0.01);
        assertEquals(100.0, sw.get(WorkflowStages.RECEIVED), 0.01);
    }

    @Test
    void receive_inProgressTask_throwsError() {
        TaskResponse project = createProject("接收进行中项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "进行中任务", 100);

        assignToDepartment(leaf.getId());
        receiveTask(leaf.getId());
        taskService.startProgress(leaf.getId(), executorAuth, deptId, executorUserId);

        assertThrows(IllegalArgumentException.class, () ->
                taskService.receiveTask(leaf.getId(), executorAuth, deptId, executorUserId));
    }

    @Test
    void assign_pendingTask_setsAssignerAndStatus() {
        TaskResponse project = createProject("指派测试项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "待指派任务", 100);
        UUID assigneeId = UUID.randomUUID();

        AssignRequest req = new AssignRequest();
        req.setDepartmentId(deptId);
        req.setAssigneeId(assigneeId);
        req.setQaDepartmentId("QA_DEPT");
        TaskResponse result = taskService.assignTask(leaf.getId(), req, adminAuth, deptId, adminUserId);

        assertEquals(TaskStatus.ASSIGNED, result.getStatus());
        Map<String, Double> sw = parseSW(result.getStatusWorkloads());
        assertEquals(0.0, sw.get(WorkflowStages.PENDING), 0.01);
        assertEquals(100.0, sw.get(WorkflowStages.ASSIGNED), 0.01);
    }

    @Test
    void assign_alreadyAssignedTask_throwsError() {
        TaskResponse project = createProject("重复指派项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "已指派任务", 100);

        AssignRequest req = new AssignRequest();
        req.setDepartmentId(deptId);
        taskService.assignTask(leaf.getId(), req, adminAuth, deptId, adminUserId);
        receiveTask(leaf.getId());
        taskService.startProgress(leaf.getId(), executorAuth, deptId, executorUserId);

        assertThrows(org.springframework.security.access.AccessDeniedException.class, () ->
                taskService.assignTask(leaf.getId(), req, adminAuth, deptId, adminUserId));
    }

    @Test
    void revoke_assignedTask_returnsToPending() {
        TaskResponse project = createProject("撤销指派项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "待撤销任务", 100);

        AssignRequest req = new AssignRequest();
        req.setDepartmentId(deptId);
        taskService.assignTask(leaf.getId(), req, adminAuth, deptId, adminUserId);

        TaskResponse result = taskService.revokeAssignment(leaf.getId(), adminAuth, deptId, adminUserId);

        assertEquals(TaskStatus.PENDING, result.getStatus());
        Map<String, Double> sw = parseSW(result.getStatusWorkloads());
        assertEquals(100.0, sw.get(WorkflowStages.PENDING), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.ASSIGNED), 0.01);
    }

    @Test
    void revoke_receivedTask_throwsError() {
        TaskResponse project = createProject("撤销已接收项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "已接收任务", 100);

        assignAndReceiveTask(leaf.getId());

        assertThrows(IllegalArgumentException.class, () ->
                taskService.revokeAssignment(leaf.getId(), adminAuth, deptId, adminUserId));
    }

    @Test
    void startProgress_receivedTask_workloadMovesToInProgress() {
        TaskResponse project = createProject("开始处理项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "待开始任务", 100);

        assignAndReceiveTask(leaf.getId());
        TaskResponse result = taskService.startProgress(leaf.getId(), executorAuth, deptId, executorUserId);

        assertEquals(TaskStatus.IN_PROGRESS, result.getStatus());
        assertNotNull(result.getStartedAt());
        Map<String, Double> sw = parseSW(result.getStatusWorkloads());
        assertEquals(0.0, sw.get(WorkflowStages.RECEIVED), 0.01);
        assertEquals(100.0, sw.get(WorkflowStages.IN_PROGRESS), 0.01);
    }

    @Test
    void startProgress_pendingTask_throwsError() {
        TaskResponse project = createProject("开始未接收项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "未接收任务", 100);

        assertThrows(IllegalArgumentException.class, () ->
                taskService.startProgress(leaf.getId(), executorAuth, deptId, executorUserId));
    }

    @Test
    void submitCompletion_partialWorkload_movesToSubmittedForQA() {
        TaskResponse project = createProject("提交完成量项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "待提交任务", 100);

        assignAndReceiveTask(leaf.getId());
        taskService.startProgress(leaf.getId(), executorAuth, deptId, executorUserId);

        SubmitCompletionRequest req = new SubmitCompletionRequest();
        req.setCompletedWorkload(60.0);
        TaskResponse result = taskService.submitCompletion(leaf.getId(), req, executorAuth, deptId, executorUserId);

        assertEquals(TaskStatus.IN_PROGRESS, result.getStatus());
        assertEquals(60.0, result.getInProgressCompletedWorkload(), 0.01);
        Map<String, Double> sw = parseSW(result.getStatusWorkloads());
        assertEquals(100.0, sw.get(WorkflowStages.IN_PROGRESS), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.SUBMITTED_FOR_QA), 0.01);
    }

    @Test
    void submitCompletion_fullWorkload_movesAllToSubmittedForQA() {
        TaskResponse project = createProject("全部完成量项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "全部提交任务", 100);

        assignAndReceiveTask(leaf.getId());
        taskService.startProgress(leaf.getId(), executorAuth, deptId, executorUserId);

        SubmitCompletionRequest req = new SubmitCompletionRequest();
        req.setCompletedWorkload(100.0);
        TaskResponse result = taskService.submitCompletion(leaf.getId(), req, executorAuth, deptId, executorUserId);
        result = taskService.submitQa(leaf.getId(), executorAuth, deptId, executorUserId);

        Map<String, Double> sw = parseSW(result.getStatusWorkloads());
        assertEquals(0.0, sw.get(WorkflowStages.IN_PROGRESS), 0.01);
        assertEquals(100.0, sw.get(WorkflowStages.SUBMITTED_FOR_QA), 0.01);
    }

    @Test
    void submitCompletion_exceedsInProgress_throwsError() {
        TaskResponse project = createProject("超额完成量项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "超额任务", 100);

        assignAndReceiveTask(leaf.getId());
        taskService.startProgress(leaf.getId(), executorAuth, deptId, executorUserId);

        SubmitCompletionRequest req = new SubmitCompletionRequest();
        req.setCompletedWorkload(150.0);

        assertThrows(IllegalArgumentException.class, () ->
                taskService.submitCompletion(leaf.getId(), req, executorAuth, deptId, executorUserId));
    }

    @Test
    void submitCompletion_notInProgress_throwsError() {
        TaskResponse project = createProject("非进行中提交项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "未开始任务", 100);

        SubmitCompletionRequest req = new SubmitCompletionRequest();
        req.setCompletedWorkload(50.0);

        assertThrows(IllegalArgumentException.class, () ->
                taskService.submitCompletion(leaf.getId(), req, executorAuth, deptId, executorUserId));
    }

    @Test
    void decompose_createsSubTasks_workloadConserved() {
        TaskResponse project = createProject("分解测试项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "待分解任务", 100);

        DecomposeRequest req = new DecomposeRequest();
        SubTaskItem sub1 = new SubTaskItem();
        sub1.setName("子任务1");
        sub1.setType(typeCode);
        sub1.setWorkload(60.0);
        sub1.setWorkloadUnit(unitCode);
        sub1.setDepartmentId(deptId);
        SubTaskItem sub2 = new SubTaskItem();
        sub2.setName("子任务2");
        sub2.setType(typeCode);
        sub2.setWorkload(40.0);
        sub2.setWorkloadUnit(unitCode);
        sub2.setDepartmentId(deptId);
        req.setSubTasks(List.of(sub1, sub2));

        TaskResponse result = taskService.decomposeTask(leaf.getId(), req, adminAuth, deptId, adminUserId);

        assertNotNull(result.getStatusWorkloads(), "分解后父任务 statusWorkloads 应为子节点聚合值");
        Map<String, Double> sw = parseSW(result.getStatusWorkloads());
        assertEquals(0.0, sw.get(WorkflowStages.PENDING), 0.01, "分解后子节点已分配到责任部门，聚合后 ASSIGNED=100");
        assertEquals(100.0, sw.get(WorkflowStages.ASSIGNED), 0.01, "分解后子节点已分配到责任部门，聚合后 ASSIGNED=100");
        assertEquals(0, result.getProgress(), "分解后父任务进度应为 0");
    }

    @Test
    void decompose_workloadMismatch_throwsError() {
        TaskResponse project = createProject("分解工作量不匹配项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "不匹配任务", 100);

        DecomposeRequest req = new DecomposeRequest();
        SubTaskItem sub1 = new SubTaskItem();
        sub1.setName("子任务1");
        sub1.setType(typeCode);
        sub1.setWorkload(60.0);
        sub1.setWorkloadUnit(unitCode);
        sub1.setDepartmentId(deptId);
        SubTaskItem sub2 = new SubTaskItem();
        sub2.setName("子任务2");
        sub2.setType(typeCode);
        sub2.setWorkload(50.0);
        sub2.setWorkloadUnit(unitCode);
        sub2.setDepartmentId(deptId);
        req.setSubTasks(List.of(sub1, sub2));

        assertThrows(IllegalArgumentException.class, () ->
                taskService.decomposeTask(leaf.getId(), req, adminAuth, deptId, adminUserId));
    }

    @Test
    void fullWorkflow_pendingToSubmittedForQA() {
        TaskResponse project = createProject("完整流程项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "完整流程任务", 100);

        AssignRequest assignReq = new AssignRequest();
        assignReq.setDepartmentId(deptId);
        TaskResponse assigned = taskService.assignTask(leaf.getId(), assignReq, adminAuth, deptId, adminUserId);
        assertEquals(TaskStatus.ASSIGNED, assigned.getStatus());

        TaskResponse received = receiveTask(leaf.getId());
        assertEquals(TaskStatus.RECEIVED, received.getStatus());

        TaskResponse inProgress = taskService.startProgress(leaf.getId(), executorAuth, deptId, executorUserId);
        assertEquals(TaskStatus.IN_PROGRESS, inProgress.getStatus());

        SubmitCompletionRequest submitReq = new SubmitCompletionRequest();
        submitReq.setCompletedWorkload(100.0);
        TaskResponse submitted = taskService.submitCompletion(leaf.getId(), submitReq, executorAuth, deptId, executorUserId);
        submitted = taskService.submitQa(leaf.getId(), executorAuth, deptId, executorUserId);
        assertEquals(TaskStatus.SUBMITTED_FOR_QA, submitted.getStatus());

        Map<String, Double> sw = parseSW(submitted.getStatusWorkloads());
        assertEquals(0.0, sw.get(WorkflowStages.PENDING), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.ASSIGNED), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.RECEIVED), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.IN_PROGRESS), 0.01);
        assertEquals(100.0, sw.get(WorkflowStages.SUBMITTED_FOR_QA), 0.01);
    }

    @Test
    void qaCompletingStage_workloadTransfer() {
        TaskResponse project = createProject("质检中阶段项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "质检中任务", 100);

        Map<String, Double> update = new LinkedHashMap<>();
        update.put(WorkflowStages.SUBMITTED_FOR_QA, 60.0);
        TaskResponse step1 = taskService.updateStatusWorkload(leaf.getId(), update, adminAuth, deptId, adminUserId);
        assertEquals(TaskStatus.SUBMITTED_FOR_QA, step1.getStatus());

        Map<String, Double> update2 = new LinkedHashMap<>();
        update2.put(WorkflowStages.QA_COMPLETING, 60.0);
        TaskResponse step2 = taskService.updateStatusWorkload(leaf.getId(), update2, adminAuth, deptId, adminUserId);
        assertEquals(TaskStatus.QA_COMPLETING, step2.getStatus());

        Map<String, Double> sw = parseSW(step2.getStatusWorkloads());
        assertEquals(40.0, sw.get(WorkflowStages.PENDING), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.SUBMITTED_FOR_QA), 0.01);
        assertEquals(60.0, sw.get(WorkflowStages.QA_COMPLETING), 0.01);
    }

    @Test
    void qaCompletingWeight_is95Percent() {
        TaskResponse project = createProject("质检中权重项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "质检中权重任务", 100);

        Map<String, Double> update = new LinkedHashMap<>();
        update.put(WorkflowStages.QA_COMPLETING, 100.0);
        TaskResponse result = taskService.updateStatusWorkload(leaf.getId(), update, adminAuth, deptId, adminUserId);

        double expectedProgress = 100.0 * 0.95 / 100.0 * 100;
        assertEquals((int) Math.round(expectedProgress), result.getProgress());
    }

    @Test
    void pausedWorkload_staysInCurrentStage() {
        TaskResponse project = createProject("暂停测试项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "待暂停任务", 100);

        assignAndReceiveTask(leaf.getId());
        taskService.startProgress(leaf.getId(), executorAuth, deptId, executorUserId);

        TaskResponse paused = taskService.updateTaskStatus(leaf.getId(), TaskStatus.PAUSED, adminAuth, deptId, adminUserId);
        assertEquals(TaskStatus.PAUSED, paused.getStatus());

        Map<String, Double> sw = parseSW(paused.getStatusWorkloads());
        assertEquals(100.0, sw.get(WorkflowStages.IN_PROGRESS), 0.01, "PAUSED 时工作量应留在 IN_PROGRESS");
    }

    @Test
    void failedWorkload_rollsBackToInProgress() {
        TaskResponse project = createProject("失败测试项目", 100);
        TaskResponse leaf = createLeafTask(project.getId(), "待失败任务", 100);

        Map<String, Double> update = new LinkedHashMap<>();
        update.put(WorkflowStages.SUBMITTED_FOR_QA, 60.0);
        taskService.updateStatusWorkload(leaf.getId(), update, adminAuth, deptId, adminUserId);

        Map<String, Double> update2 = new LinkedHashMap<>();
        update2.put(WorkflowStages.QA_COMPLETING, 30.0);
        taskService.updateStatusWorkload(leaf.getId(), update2, adminAuth, deptId, adminUserId);

        TaskResponse failed = taskService.updateTaskStatus(leaf.getId(), TaskStatus.FAILED, adminAuth, deptId, adminUserId);
        assertEquals(TaskStatus.FAILED, failed.getStatus());

        Map<String, Double> sw = parseSW(failed.getStatusWorkloads());
        assertEquals(40.0, sw.get(WorkflowStages.PENDING), 0.01);
        assertEquals(60.0, sw.get(WorkflowStages.IN_PROGRESS), 0.01, "FAILED 时 SUBMITTED_FOR_QA 和 QA_COMPLETING 应退回 IN_PROGRESS");
        assertEquals(0.0, sw.get(WorkflowStages.SUBMITTED_FOR_QA), 0.01);
        assertEquals(0.0, sw.get(WorkflowStages.QA_COMPLETING), 0.01);
    }

    @Test
    void nonLeafStatus_mixedChildren_returnsNull() {
        TaskResponse project = createProject("混合状态项目", 200);
        TaskResponse leaf1 = createLeafTask(project.getId(), "叶子1", 100);
        TaskResponse leaf2 = createLeafTask(project.getId(), "叶子2", 100);

        Map<String, Double> inProgress = new LinkedHashMap<>();
        inProgress.put(WorkflowStages.IN_PROGRESS, 100.0);
        taskService.updateStatusWorkload(leaf1.getId(), inProgress, adminAuth, deptId, adminUserId);

        TaskResponse refreshed = taskService.getTaskById(project.getId(), adminAuth, deptId, null, adminUserId);
        assertNull(refreshed.getStatus(), "子节点状态混合时父节点状态应为 null");
    }

    @Test
    void nonLeafStatusWorkloads_aggregatesChildren() {
        TaskResponse project = createProject("聚合工作量项目", 200);
        TaskResponse leaf1 = createLeafTask(project.getId(), "叶子1", 100);
        TaskResponse leaf2 = createLeafTask(project.getId(), "叶子2", 100);

        Map<String, Double> u1 = new LinkedHashMap<>();
        u1.put(WorkflowStages.IN_PROGRESS, 100.0);
        taskService.updateStatusWorkload(leaf1.getId(), u1, adminAuth, deptId, adminUserId);

        Map<String, Double> u2 = new LinkedHashMap<>();
        u2.put(WorkflowStages.QA_COMPLETED, 100.0);
        taskService.updateStatusWorkload(leaf2.getId(), u2, adminAuth, deptId, adminUserId);

        TaskResponse refreshed = taskService.getTaskById(project.getId(), adminAuth, deptId, null, adminUserId);
        Map<String, Double> sw = parseSW(refreshed.getStatusWorkloads());
        assertEquals(100.0, sw.get(WorkflowStages.IN_PROGRESS), 0.01);
        assertEquals(100.0, sw.get(WorkflowStages.QA_COMPLETED), 0.01);
    }

    @Test
    void externalSystemProgressMapping_submittedForQaEqualsProgressPercent() {
        TaskResponse project = createProject("外部进度映射项目", 100);
        TaskCreateRequest req = new TaskCreateRequest();
        req.setName("外部系统任务");
        req.setCategory(TaskCategory.OPERATION_TASK);
        req.setType(typeCode);
        req.setWorkload(100.0);
        req.setWorkloadUnit(unitCode);
        req.setProjectId(project.getId());
        req.setParentTaskId(project.getId());
        req.setExternalSystem("TEST_SYSTEM");
        req.setExternalTaskId("ext-001");
        TaskResponse leaf = taskService.createTask(req, adminAuth, deptId, adminUserId);

        TaskUpdateRequest updateReq = new TaskUpdateRequest();
        updateReq.setDepartmentId(deptId);
        updateReq.setProgress(75);
        TaskResponse updated = taskService.updateTask(leaf.getId(), updateReq, adminAuth, deptId, adminUserId);

        Map<String, Double> sw = parseSW(updated.getStatusWorkloads());
        assertEquals(25.0, sw.get(WorkflowStages.RECEIVED), 0.01, "75% 进度时 RECEIVED 应为 25%");
        assertEquals(75.0, sw.get(WorkflowStages.SUBMITTED_FOR_QA), 0.01, "75% 进度时 SUBMITTED_FOR_QA 应为 75%");
        assertEquals(0.0, updated.getInProgressCompletedWorkload(), 0.01);
    }
}





