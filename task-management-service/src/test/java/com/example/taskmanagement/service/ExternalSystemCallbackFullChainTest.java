package com.example.taskmanagement.service;

import com.example.taskmanagement.dto.*;
import com.example.taskmanagement.model.ExternalSystemRegistration;
import com.example.taskmanagement.model.TaskCategory;
import com.example.taskmanagement.model.TaskStatus;
import com.example.taskmanagement.model.WorkflowStages;
import com.example.taskmanagement.model.WorkflowStatus;
import com.example.taskmanagement.repository.ExternalSystemRegistrationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZonedDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
@WithMockUser(authorities = {"ROLE_DEVELOPER"})
public class ExternalSystemCallbackFullChainTest {

    @Autowired
    private TaskService taskService;
    @Autowired
    private ExternalSystemRegistrationRepository registrationRepository;
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
    private UUID adminUserId;
    private UUID qaUserId;
    private String deptId;
    private String typeCode;
    private String unitCode;
    private String systemId;

    @BeforeEach
    void setUp() {
        adminUserId = UUID.randomUUID();
        qaUserId = UUID.randomUUID();

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
                        new SimpleGrantedAuthority("quality:check"),
                        new SimpleGrantedAuthority("quality:approve"),
                        new SimpleGrantedAuthority("TASK:CREATE"),
                        new SimpleGrantedAuthority("TASK:UPDATE_GLOBAL"),
                        new SimpleGrantedAuthority("TASK:EXECUTE"),
                        new SimpleGrantedAuthority("TASK:READ_GLOBAL"),
                        new SimpleGrantedAuthority("QUALITY:CHECK"),
                        new SimpleGrantedAuthority("QUALITY:APPROVE")
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

        deptId = "EXT_DEPT_" + System.nanoTime();

        MeasurementUnitRequest unitReq = new MeasurementUnitRequest();
        unitReq.setCode("EXTU_" + System.nanoTime());
        unitReq.setName("外部系统测试单位");
        unitReq.setEnabled(true);
        unitReq.setBaseUnitCode("UNIT_COUNT");
        unitReq.setConversionFactor(1.0);
        MeasurementUnitResponse unit = measurementUnitService.create(unitReq);
        unitCode = unit.getCode();

        ProjectTypeRequest ptReq = new ProjectTypeRequest();
        ptReq.setCode("EXTP_" + System.nanoTime());
        ptReq.setName("外部系统测试类型");
        ptReq.setEnabled(true);
        ProjectTypeResponse pt = projectTypeService.create(ptReq);
        typeCode = pt.getCode();

        TaskTypeGroupRequest groupReq = new TaskTypeGroupRequest();
        groupReq.setCode("EXTG_" + System.nanoTime());
        groupReq.setName("外部系统测试分组");
        groupReq.setEnabled(true);
        UUID groupId = taskTypeGroupService.create(groupReq).getId();

        TaskTypeRequest tTypeReq = new TaskTypeRequest();
        tTypeReq.setCode(typeCode);
        tTypeReq.setName("外部系统测试任务类型");
        tTypeReq.setGroupId(groupId);
        tTypeReq.setEnabled(true);
        taskTypeService.create(tTypeReq);

        systemId = "EXT_SYS_" + System.nanoTime();
        ExternalSystemRegistration reg = new ExternalSystemRegistration();
        reg.setSystemId(systemId);
        reg.setDisplayName("测试外部系统");
        reg.setServiceUrl("http://localhost:9999");
        reg.setSsoClientId("test-sso-client");
        reg.setSupportedTaskTypes(typeCode);
        reg.setCallbackPath("/api/callback");
        reg.setRegisteredAt(ZonedDateTime.now());
        registrationRepository.save(reg);
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

    private TaskResponse createExternalLeafTask(UUID parentId, String name, double workload) {
        TaskCreateRequest req = new TaskCreateRequest();
        req.setName(name);
        req.setCategory(TaskCategory.OPERATION_TASK);
        req.setType(typeCode);
        req.setWorkload(workload);
        req.setWorkloadUnit(unitCode);
        req.setProjectId(parentId);
        req.setParentTaskId(parentId);
        req.setExternalSystem(systemId);
        req.setExternalTaskId("ext-" + System.nanoTime());
        return taskService.createTask(req, adminAuth, deptId, adminUserId);
    }

    private Map<String, Double> parseSW(String json) {
        if (json == null || json.isBlank()) return new LinkedHashMap<>();
        try {
            com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
            return om.readValue(json, new com.fasterxml.jackson.core.type.TypeReference<LinkedHashMap<String, Double>>() {});
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    @Test
    void fullChain_progress100_mapsToSubmittedForQa_thenQaApprove_mapsToQaCompleted() {
        TaskResponse project = createProject("外部全链路项目", 100);
        TaskResponse leaf = createExternalLeafTask(project.getId(), "外部叶子任务", 100);

        assertEquals(TaskStatus.PENDING, leaf.getStatus());

        taskService.updateTaskStatus(leaf.getId(), TaskStatus.RECEIVED, adminAuth, deptId, adminUserId);
        taskService.updateTaskStatus(leaf.getId(), TaskStatus.IN_PROGRESS, adminAuth, deptId, adminUserId);

        TaskUpdateRequest updateReq = new TaskUpdateRequest();
        updateReq.setDepartmentId(deptId);
        updateReq.setProgress(100);
        TaskResponse afterProgress = taskService.updateTask(leaf.getId(), updateReq, adminAuth, deptId, adminUserId);

        assertEquals(TaskStatus.SUBMITTED_FOR_QA, afterProgress.getStatus(),
                "外部系统任务 progress=100 应自动推导为 SUBMITTED_FOR_QA");
        assertEquals(95, afterProgress.getProgress(),
                "SUBMITTED_FOR_QA × 0.95 = 95% 有效进度");

        Map<String, Double> sw = parseSW(afterProgress.getStatusWorkloads());
        assertEquals(100.0, sw.getOrDefault(WorkflowStages.SUBMITTED_FOR_QA, 0.0), 0.01,
                "progress=100 时全部工作量应在 SUBMITTED_FOR_QA 阶段");

        TaskResponse acceptedQa = taskService.acceptQa(leaf.getId(), qaAuth, deptId, qaUserId);
        assertEquals(TaskStatus.QA_COMPLETING, acceptedQa.getStatus());

        TaskResponse qaApproved = taskService.qaApprove(leaf.getId(), qaAuth, deptId, qaUserId);
        assertEquals(TaskStatus.QA_COMPLETED, qaApproved.getStatus());
    }

    @Test
    void fullChain_statusWorkload_submittedForQa_mapsToSubmittedForQa() {
        TaskResponse project = createProject("statusWorkload映射项目", 200);
        TaskResponse leaf = createExternalLeafTask(project.getId(), "statusWorkload叶子", 200);

        taskService.updateTaskStatus(leaf.getId(), TaskStatus.RECEIVED, adminAuth, deptId, adminUserId);
        taskService.updateTaskStatus(leaf.getId(), TaskStatus.IN_PROGRESS, adminAuth, deptId, adminUserId);

        Map<String, Double> sw = new LinkedHashMap<>();
        sw.put(WorkflowStages.SUBMITTED_FOR_QA, 200.0);
        TaskResponse afterSw = taskService.updateStatusWorkload(leaf.getId(), sw, adminAuth, deptId, adminUserId);

        assertEquals(TaskStatus.SUBMITTED_FOR_QA, afterSw.getStatus(),
                "全部工作量放入 SUBMITTED_FOR_QA 应推导为 SUBMITTED_FOR_QA 状态");
    }

    @Test
    void fullChain_qaReject_returnsToInProgress_andClearsCompletedWorkload() {
        TaskResponse project = createProject("质检驳回全链路项目", 100);
        TaskResponse leaf = createExternalLeafTask(project.getId(), "质检驳回叶子", 100);

        taskService.updateTaskStatus(leaf.getId(), TaskStatus.RECEIVED, adminAuth, deptId, adminUserId);
        taskService.updateTaskStatus(leaf.getId(), TaskStatus.IN_PROGRESS, adminAuth, deptId, adminUserId);

        TaskUpdateRequest updateReq = new TaskUpdateRequest();
        updateReq.setDepartmentId(deptId);
        updateReq.setProgress(100);
        TaskResponse submittedForQa = taskService.updateTask(leaf.getId(), updateReq, adminAuth, deptId, adminUserId);
        assertEquals(TaskStatus.SUBMITTED_FOR_QA, submittedForQa.getStatus());

        TaskResponse acceptedQa = taskService.acceptQa(leaf.getId(), qaAuth, deptId, qaUserId);
        assertEquals(TaskStatus.QA_COMPLETING, acceptedQa.getStatus());

        TaskResponse qaRejected = taskService.qaReject(leaf.getId(), qaAuth, deptId, qaUserId);
        assertEquals(TaskStatus.IN_PROGRESS, qaRejected.getStatus(),
                "质检不通过应退回 IN_PROGRESS");
        assertEquals(0.0, qaRejected.getInProgressCompletedWorkload(), 0.01,
                "质检不通过应清零 inProgressCompletedWorkload");
    }

    @Test
    void fullChain_qaCompleted_cannotDirectlyFail() {
        TaskResponse project = createProject("QA_COMPLETED禁止直接FAILED项目", 100);
        TaskResponse leaf = createExternalLeafTask(project.getId(), "QA_COMPLETED禁止FAILED叶子", 100);

        taskService.updateTaskStatus(leaf.getId(), TaskStatus.RECEIVED, adminAuth, deptId, adminUserId);
        taskService.updateTaskStatus(leaf.getId(), TaskStatus.IN_PROGRESS, adminAuth, deptId, adminUserId);

        TaskUpdateRequest updateReq = new TaskUpdateRequest();
        updateReq.setDepartmentId(deptId);
        updateReq.setProgress(100);
        taskService.updateTask(leaf.getId(), updateReq, adminAuth, deptId, adminUserId);

        taskService.acceptQa(leaf.getId(), qaAuth, deptId, qaUserId);
        TaskResponse qaCompleted = taskService.qaApprove(leaf.getId(), qaAuth, deptId, qaUserId);
        assertEquals(TaskStatus.QA_COMPLETED, qaCompleted.getStatus());

        assertThrows(Exception.class, () -> {
            taskService.updateTaskStatus(leaf.getId(), TaskStatus.FAILED, adminAuth, deptId, adminUserId);
        }, "QA_COMPLETED 后禁止直接转为 FAILED");
    }

    @Test
    void fullChain_progressIncrement_beforeCompletion() {
        TaskResponse project = createProject("增量进度项目", 100);
        TaskResponse leaf = createExternalLeafTask(project.getId(), "增量进度叶子", 100);

        taskService.updateTaskStatus(leaf.getId(), TaskStatus.RECEIVED, adminAuth, deptId, adminUserId);
        taskService.updateTaskStatus(leaf.getId(), TaskStatus.IN_PROGRESS, adminAuth, deptId, adminUserId);

        TaskUpdateRequest update50 = new TaskUpdateRequest();
        update50.setDepartmentId(deptId);
        update50.setProgress(50);
        TaskResponse at50 = taskService.updateTask(leaf.getId(), update50, adminAuth, deptId, adminUserId);

        assertEquals(48, at50.getProgress(),
                "50% 进度 × 0.95 = 47.5% → round = 48% 有效进度");
        Map<String, Double> sw50 = parseSW(at50.getStatusWorkloads());
        assertEquals(50.0, sw50.getOrDefault(WorkflowStages.SUBMITTED_FOR_QA, 0.0), 0.01,
                "50% 进度时 SUBMITTED_FOR_QA 工作量应为 50");

        TaskUpdateRequest update80 = new TaskUpdateRequest();
        update80.setDepartmentId(deptId);
        update80.setProgress(80);
        TaskResponse at80 = taskService.updateTask(leaf.getId(), update80, adminAuth, deptId, adminUserId);

        assertEquals(76, at80.getProgress(),
                "80% 进度 × 0.95 = 76% 有效进度");
        Map<String, Double> sw80 = parseSW(at80.getStatusWorkloads());
        assertEquals(80.0, sw80.getOrDefault(WorkflowStages.SUBMITTED_FOR_QA, 0.0), 0.01,
                "80% 进度时 SUBMITTED_FOR_QA 工作量应为 80");

        TaskUpdateRequest update100 = new TaskUpdateRequest();
        update100.setDepartmentId(deptId);
        update100.setProgress(100);
        TaskResponse at100 = taskService.updateTask(leaf.getId(), update100, adminAuth, deptId, adminUserId);

        assertEquals(TaskStatus.SUBMITTED_FOR_QA, at100.getStatus(),
                "progress=100 应推导为 SUBMITTED_FOR_QA");
    }

    @Test
    void fullChain_workflowStatusUpdate_withCompletionData() {
        TaskResponse project = createProject("workflowStatus完成数据项目", 150);
        TaskResponse leaf = createExternalLeafTask(project.getId(), "workflowStatus叶子", 150);

        taskService.updateTaskStatus(leaf.getId(), TaskStatus.RECEIVED, adminAuth, deptId, adminUserId);
        taskService.updateTaskStatus(leaf.getId(), TaskStatus.IN_PROGRESS, adminAuth, deptId, adminUserId);

        WorkflowStatusUpdateRequest wsReq = new WorkflowStatusUpdateRequest();
        wsReq.setWorkflowStatus(WorkflowStatus.PENDING_ACCEPTANCE);
        wsReq.setProgress(100);
        wsReq.setSystemId(systemId);
        wsReq.setCompletedWorkload(150.0);
        wsReq.setWorkloadUnit(unitCode);

        WorkflowStatusUpdateRequest.StageResponsible sr = new WorkflowStatusUpdateRequest.StageResponsible();
        sr.setStage("桥梁检测");
        sr.setUserId(adminUserId);
        sr.setUsername("test-admin");
        sr.setCompletedAt(ZonedDateTime.now().toString());
        wsReq.setStageResponsibles(List.of(sr));

        TaskResponse result = taskService.updateWorkflowStatus(leaf.getId(), wsReq, adminAuth, deptId, adminUserId);

        assertEquals(WorkflowStatus.PENDING_ACCEPTANCE, result.getWorkflowStatus(),
                "workflowStatus 应更新为 PENDING_ACCEPTANCE");
        assertEquals(100, result.getProgress());
    }
}