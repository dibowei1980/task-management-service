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
import com.example.taskmanagement.model.CompositionMode;
import com.example.taskmanagement.model.Task;
import com.example.taskmanagement.model.TaskCategory;
import com.example.taskmanagement.model.TaskStatus;
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

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
@WithMockUser(authorities = {"ROLE_DEVELOPER"})
public class TaskTreeConstraintAndProgressTest {

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
    private String typeCode2;
    private String unitCode;
    private String unitCode2;

    @BeforeEach
    void setUp() {
        adminAuth = new UsernamePasswordAuthenticationToken(
                "test-admin", "n/a",
                List.of(
                        new SimpleGrantedAuthority("project:create"),
                        new SimpleGrantedAuthority("project:read_global"),
                        new SimpleGrantedAuthority("project:read_department"),
                        new SimpleGrantedAuthority("project:update_global"),
                        new SimpleGrantedAuthority("project:update_department"),
                        new SimpleGrantedAuthority("PROJECT:CREATE"),
                        new SimpleGrantedAuthority("PROJECT:READ_GLOBAL"),
                        new SimpleGrantedAuthority("PROJECT:READ_DEPARTMENT"),
                        new SimpleGrantedAuthority("PROJECT:UPDATE_GLOBAL"),
                        new SimpleGrantedAuthority("PROJECT:UPDATE_DEPARTMENT"),
                        new SimpleGrantedAuthority("task:create"),
                        new SimpleGrantedAuthority("task:update_global"),
                        new SimpleGrantedAuthority("task:update_department"),
                        new SimpleGrantedAuthority("task:execute"),
                        new SimpleGrantedAuthority("task:read_global"),
                        new SimpleGrantedAuthority("task:read_department"),
                        new SimpleGrantedAuthority("TASK:CREATE"),
                        new SimpleGrantedAuthority("TASK:UPDATE_GLOBAL"),
                        new SimpleGrantedAuthority("TASK:UPDATE_DEPARTMENT"),
                        new SimpleGrantedAuthority("TASK:EXECUTE")
                )
        );
        deptId = "TEST_DEPT_" + System.nanoTime();

        MeasurementUnitRequest unitReq = new MeasurementUnitRequest();
        unitReq.setCode("TU_" + System.nanoTime());
        unitReq.setName("测试单位");
        unitReq.setEnabled(true);
        unitReq.setBaseUnitCode("UNIT_COUNT");
        unitReq.setConversionFactor(1.0);
        MeasurementUnitResponse unit = measurementUnitService.create(unitReq);
        unitCode = unit.getCode();

        MeasurementUnitRequest unitReq2 = new MeasurementUnitRequest();
        unitReq2.setCode("TU2_" + System.nanoTime());
        unitReq2.setName("测试单位2");
        unitReq2.setEnabled(true);
        unitReq2.setBaseUnitCode("UNIT_SQ_M");
        unitReq2.setConversionFactor(1.0);
        MeasurementUnitResponse unit2 = measurementUnitService.create(unitReq2);
        unitCode2 = unit2.getCode();

        ProjectTypeRequest ptReq1 = new ProjectTypeRequest();
        ptReq1.setCode("TT1_" + System.nanoTime());
        ptReq1.setName("测试类型1");
        ptReq1.setEnabled(true);
        ProjectTypeResponse pt1 = projectTypeService.create(ptReq1);
        typeCode = pt1.getCode();

        ProjectTypeRequest ptReq2 = new ProjectTypeRequest();
        ptReq2.setCode("TT2_" + System.nanoTime());
        ptReq2.setName("测试类型2");
        ptReq2.setEnabled(true);
        ProjectTypeResponse pt2 = projectTypeService.create(ptReq2);
        typeCode2 = pt2.getCode();

        TaskTypeGroupRequest groupReq = new TaskTypeGroupRequest();
        groupReq.setCode("TG_" + System.nanoTime());
        groupReq.setName("测试分组");
        groupReq.setEnabled(true);
        UUID groupId = taskTypeGroupService.create(groupReq).getId();

        TaskTypeRequest tTypeReq1 = new TaskTypeRequest();
        tTypeReq1.setCode(typeCode);
        tTypeReq1.setName("测试任务类型1");
        tTypeReq1.setGroupId(groupId);
        tTypeReq1.setEnabled(true);
        taskTypeService.create(tTypeReq1);

        TaskTypeRequest tTypeReq2 = new TaskTypeRequest();
        tTypeReq2.setCode(typeCode2);
        tTypeReq2.setName("测试任务类型2");
        tTypeReq2.setGroupId(groupId);
        tTypeReq2.setEnabled(true);
        taskTypeService.create(tTypeReq2);
    }

    private TaskResponse createProject(String name) {
        TaskCreateRequest req = new TaskCreateRequest();
        req.setName(name);
        req.setCategory(TaskCategory.PROJECT);
        req.setType(typeCode);
        req.setDepartmentId(deptId);
        req.setCreatedByName("tester");
        req.setWorkload(100.0);
        req.setWorkloadUnit(unitCode);
        return taskService.createTask(req, adminAuth, deptId, null);
    }

    private TaskResponse createChildTask(UUID parentId, String name, String type, Double workload, Double weight) {
        return createChildTask(parentId, name, type, workload, unitCode, weight);
    }

    private TaskResponse createChildTask(UUID parentId, String name, String type, Double workload, String workloadUnit, Double weight) {
        TaskCreateRequest req = new TaskCreateRequest();
        req.setName(name);
        req.setCategory(TaskCategory.OPERATION_TASK);
        req.setType(type);
        req.setParentTaskId(parentId);
        req.setDepartmentId(deptId);
        req.setWorkload(workload);
        req.setWorkloadUnit(workloadUnit);
        req.setWeight(weight);
        return taskService.createTask(req, adminAuth, deptId, null);
    }

    private Task makeTaskDirectly(String name, String type, TaskCategory category, UUID parentId, UUID projectId,
                                  Double workload, Double weight, Integer progress) {
        return makeTaskDirectly(name, type, category, parentId, projectId, workload, unitCode, weight, progress);
    }

    private Task makeTaskDirectly(String name, String type, TaskCategory category, UUID parentId, UUID projectId,
                                  Double workload, String workloadUnit, Double weight, Integer progress) {
        Task t = new Task();
        t.setName(name);
        t.setType(type);
        t.setCategory(category);
        t.setStatus(TaskStatus.PENDING);
        t.setPriority(1);
        t.setDepartmentId(deptId);
        t.setParentTaskId(parentId);
        t.setProjectId(projectId);
        t.setWorkload(workload);
        t.setWorkloadUnit(workloadUnit);
        t.setWeight(weight != null ? weight : 1.0);
        t.setProgress(progress != null ? progress : 0);
        return taskRepository.save(t);
    }

    @Test
    void depthLimitBlocksCreation() {
        TaskResponse project = createProject("深度测试项目");
        Task l1 = makeTaskDirectly("L1", typeCode, TaskCategory.OPERATION_TASK, project.getId(), project.getId(), 100.0, 1.0, 0);
        Task l2 = makeTaskDirectly("L2", typeCode, TaskCategory.OPERATION_TASK, l1.getId(), project.getId(), 100.0, 1.0, 0);
        Task l3 = makeTaskDirectly("L3", typeCode, TaskCategory.OPERATION_TASK, l2.getId(), project.getId(), 100.0, 1.0, 0);
        Task l4 = makeTaskDirectly("L4", typeCode, TaskCategory.OPERATION_TASK, l3.getId(), project.getId(), 100.0, 1.0, 0);
        Task l5 = makeTaskDirectly("L5", typeCode, TaskCategory.OPERATION_TASK, l4.getId(), project.getId(), 100.0, 1.0, 0);

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> createChildTask(l5.getId(), "L6_BLOCKED", typeCode, 100.0, 1.0));
        assertTrue(ex.getMessage().contains("上限"));
    }

    @Test
    void homogeneousProgress_workloadWeighted() {
        TaskResponse project = createProject("同质进度项目");
        makeTaskDirectly("子1", typeCode, TaskCategory.OPERATION_TASK, project.getId(), project.getId(), 60.0, 1.0, 100);
        makeTaskDirectly("子2", typeCode, TaskCategory.OPERATION_TASK, project.getId(), project.getId(), 40.0, 1.0, 0);

        taskService.updateTaskStatus(
                taskRepository.findByParentTaskId(project.getId()).get(0).getId(),
                TaskStatus.COMPLETED, adminAuth, deptId, null);

        TaskResponse updated = taskService.getTaskById(project.getId(), adminAuth, deptId, "测试部", null);
        assertEquals(60, updated.getProgress());
        assertEquals(CompositionMode.HOMOGENEOUS, updated.getCompositionMode());
    }

    @Test
    void heterogeneousProgress_weightedAverage() {
        TaskResponse project = createProject("异质进度项目");
        Task c1 = makeTaskDirectly("子1", typeCode, TaskCategory.OPERATION_TASK, project.getId(), project.getId(), 10.0, 3.0, 100);
        Task c2 = makeTaskDirectly("子2", typeCode2, TaskCategory.OPERATION_TASK, project.getId(), project.getId(), 20.0, unitCode2, 2.0, 0);

        taskService.updateTaskStatus(c1.getId(), TaskStatus.COMPLETED, adminAuth, deptId, null);

        TaskResponse updated = taskService.getTaskById(project.getId(), adminAuth, deptId, "测试部", null);
        int expected = (int) Math.round((100.0 * 3 + 0.0 * 2) / (3.0 + 2.0));
        assertEquals(expected, updated.getProgress());
        assertEquals(CompositionMode.HETEROGENEOUS, updated.getCompositionMode());
    }

    @Test
    void homogeneousWorkloadMustEqualParent() {
        TaskResponse project = createProject("工作量校验项目");
        Task parent = taskRepository.findById(project.getId()).orElseThrow();
        parent.setType(typeCode);
        parent.setWorkload(50.0);
        parent.setWorkloadUnit(unitCode);
        taskRepository.save(parent);

        createChildTask(project.getId(), "子1", typeCode, 30.0, 1.0);
        createChildTask(project.getId(), "子2", typeCode, 20.0, 1.0);

        TaskResponse child3 = createChildTask(project.getId(), "子3", typeCode, 10.0, 1.0);
        assertNotNull(child3.getId(), "同质任务工作量不一致时仅警告不阻止创建");
    }

    @Test
    void homogeneousChildWorkloadRequired() {
        TaskResponse project = createProject("同质工作量必填项目");
        createChildTask(project.getId(), "子1", typeCode, 10.0, 1.0);

        TaskCreateRequest req = new TaskCreateRequest();
        req.setName("无工作量子2");
        req.setCategory(TaskCategory.OPERATION_TASK);
        req.setType(typeCode);
        req.setParentTaskId(project.getId());
        req.setDepartmentId(deptId);
        req.setWorkload(null);
        req.setWeight(1.0);

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> taskService.createTask(req, adminAuth, deptId, null));
        assertTrue(ex.getMessage().contains("工作量"));
    }

    @Test
    void mixedSiblingTypesRejected() {
        TaskResponse project = createProject("混合类型项目");
        createChildTask(project.getId(), "子1", typeCode, 10.0, 1.0);
        createChildTask(project.getId(), "子2", typeCode2, 20.0, unitCode2, 1.0);

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> createChildTask(project.getId(), "子3", typeCode, 10.0, 1.0));
        assertTrue(ex.getMessage().contains("全相同") || ex.getMessage().contains("全不同"));
    }

    @Test
    void sameTypeScatteringAcrossSiblingDirectoriesAllowed() {
        TaskResponse project = createProject("同类型分散项目");
        TaskResponse dir1 = createChildTask(project.getId(), "目录1", typeCode, 30.0, 1.0);
        createChildTask(dir1.getId(), "子1", typeCode, 30.0, 1.0);

        TaskResponse dir2 = createChildTask(project.getId(), "目录2", typeCode2, 30.0, unitCode2, 1.0);
        createChildTask(dir2.getId(), "子2", typeCode2, 30.0, unitCode2, 1.0);

        TaskResponse child = createChildTask(dir1.getId(), "子3_同类型分散", typeCode2, 30.0, unitCode2, 1.0);
        assertNotNull(child);
    }

    @Test
    void weightRangeValidation() {
        TaskResponse project = createProject("权重范围项目");

        TaskCreateRequest req = new TaskCreateRequest();
        req.setName("非法权重0");
        req.setCategory(TaskCategory.OPERATION_TASK);
        req.setType(typeCode);
        req.setParentTaskId(project.getId());
        req.setDepartmentId(deptId);
        req.setWorkload(10.0);
        req.setWeight(0.0);

        assertThrows(IllegalArgumentException.class,
                () -> taskService.createTask(req, adminAuth, deptId, null));

        TaskCreateRequest req2 = new TaskCreateRequest();
        req2.setName("非法权重101");
        req2.setCategory(TaskCategory.OPERATION_TASK);
        req2.setType(typeCode2);
        req2.setParentTaskId(project.getId());
        req2.setDepartmentId(deptId);
        req2.setWorkload(10.0);
        req2.setWeight(101.0);

        assertThrows(IllegalArgumentException.class,
                () -> taskService.createTask(req2, adminAuth, deptId, null));
    }

    @Test
    void progressRecalculatesUpTheTree() {
        TaskResponse project = createProject("级联进度项目");
        Task c1 = makeTaskDirectly("子1", typeCode, TaskCategory.OPERATION_TASK, project.getId(), project.getId(), 50.0, 1.0, 0);
        Task c2 = makeTaskDirectly("子2", typeCode, TaskCategory.OPERATION_TASK, project.getId(), project.getId(), 50.0, 1.0, 0);

        taskService.updateTaskStatus(c1.getId(), TaskStatus.COMPLETED, adminAuth, deptId, null);
        TaskResponse after1 = taskService.getTaskById(project.getId(), adminAuth, deptId, "测试部", null);
        assertEquals(50, after1.getProgress());

        taskService.updateTaskStatus(c2.getId(), TaskStatus.COMPLETED, adminAuth, deptId, null);
        TaskResponse after2 = taskService.getTaskById(project.getId(), adminAuth, deptId, "测试部", null);
        assertEquals(100, after2.getProgress());
    }

    @Test
    void compositionModeAutoDetected() {
        TaskResponse project = createProject("自动检测组合模式");
        createChildTask(project.getId(), "子1", typeCode, 10.0, 1.0);

        TaskResponse after1 = taskService.getTaskById(project.getId(), adminAuth, deptId, "测试部", null);
        assertEquals(CompositionMode.HOMOGENEOUS, after1.getCompositionMode());

        createChildTask(project.getId(), "子2", typeCode2, 20.0, unitCode2, 1.0);
        TaskResponse after2 = taskService.getTaskById(project.getId(), adminAuth, deptId, "测试部", null);
        assertEquals(CompositionMode.HETEROGENEOUS, after2.getCompositionMode());
    }

    @Test
    void typeRequiredForOperationTask() {
        TaskResponse project = createProject("类型必填项目");

        TaskCreateRequest req = new TaskCreateRequest();
        req.setName("无类型任务");
        req.setCategory(TaskCategory.OPERATION_TASK);
        req.setType(null);
        req.setDepartmentId(deptId);
        req.setParentTaskId(project.getId());

        assertThrows(IllegalArgumentException.class,
                () -> taskService.createTask(req, adminAuth, deptId, null));
    }

    @Test
    void disabledProjectTypeRejected() {
        ProjectTypeRequest ptReq = new ProjectTypeRequest();
        ptReq.setCode("PT_DIS_" + System.nanoTime());
        ptReq.setName("禁用类型");
        ptReq.setEnabled(true);
        ProjectTypeResponse pt = projectTypeService.create(ptReq);

        projectTypeService.setEnabled(pt.getId(), false);

        TaskResponse project = createProject("禁用类型项目");
        TaskCreateRequest req = new TaskCreateRequest();
        req.setName("禁用类型子任务");
        req.setCategory(TaskCategory.OPERATION_TASK);
        req.setType(pt.getCode());
        req.setParentTaskId(project.getId());
        req.setDepartmentId(deptId);
        req.setWorkload(10.0);
        req.setWeight(1.0);

        assertThrows(IllegalArgumentException.class,
                () -> taskService.createTask(req, adminAuth, deptId, null));
    }

    @Test
    void homogeneousProgress_withDifferentWeights() {
        TaskResponse project = createProject("同质不同权重项目");
        makeTaskDirectly("子1", typeCode, TaskCategory.OPERATION_TASK, project.getId(), project.getId(), 60.0, 2.0, 100);
        makeTaskDirectly("子2", typeCode, TaskCategory.OPERATION_TASK, project.getId(), project.getId(), 40.0, 1.0, 0);

        List<Task> children = taskRepository.findByParentTaskId(project.getId());
        taskService.updateTaskStatus(children.get(0).getId(), TaskStatus.COMPLETED, adminAuth, deptId, null);

        TaskResponse updated = taskService.getTaskById(project.getId(), adminAuth, deptId, "测试部", null);
        int expected = (int) Math.round((100.0 * 2 * 60.0 + 0.0 * 1 * 40.0) / (2 * 60.0 + 1 * 40.0));
        assertEquals(expected, updated.getProgress());
    }

    @Test
    void heterogeneousProgress_allCompleted() {
        TaskResponse project = createProject("异质全部完成项目");
        Task c1 = makeTaskDirectly("子1", typeCode, TaskCategory.OPERATION_TASK, project.getId(), project.getId(), 10.0, 3.0, 0);
        Task c2 = makeTaskDirectly("子2", typeCode2, TaskCategory.OPERATION_TASK, project.getId(), project.getId(), 20.0, unitCode2, 2.0, 0);

        taskService.updateTaskStatus(c1.getId(), TaskStatus.COMPLETED, adminAuth, deptId, null);
        taskService.updateTaskStatus(c2.getId(), TaskStatus.COMPLETED, adminAuth, deptId, null);

        TaskResponse updated = taskService.getTaskById(project.getId(), adminAuth, deptId, "测试部", null);
        assertEquals(100, updated.getProgress());
    }
}
