package com.example.taskmanagement.service;

import com.example.taskmanagement.dto.MeasurementUnitRequest;
import com.example.taskmanagement.dto.MeasurementUnitResponse;
import com.example.taskmanagement.dto.ProjectTypeRequest;
import com.example.taskmanagement.dto.ProjectTypeResponse;
import com.example.taskmanagement.repository.MeasurementUnitDefinitionRepository;
import com.example.taskmanagement.repository.ProjectTypeDefinitionRepository;
import com.example.taskmanagement.repository.TaskRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
@WithMockUser(authorities = {"ROLE_DEVELOPER"})
public class ProjectTypeAndMeasurementUnitServiceTest {

    @Autowired
    private MeasurementUnitService measurementUnitService;

    @Autowired
    private ProjectTypeService projectTypeService;

    @Autowired
    private MeasurementUnitDefinitionRepository measurementUnitRepo;

    @Autowired
    private ProjectTypeDefinitionRepository projectTypeRepo;

    @Autowired
    private TaskRepository taskRepository;

    @BeforeEach
    void setUp() {
    }

    private MeasurementUnitRequest makeDerivedRequest(String code, String name) {
        MeasurementUnitRequest req = new MeasurementUnitRequest();
        req.setCode(code);
        req.setName(name);
        req.setEnabled(true);
        req.setBaseUnitCode("UNIT_COUNT");
        req.setConversionFactor(1.0);
        return req;
    }

    @Test
    void measurementUnitCreate_andList() {
        MeasurementUnitRequest req = makeDerivedRequest("MU_LIST_" + System.nanoTime(), "列表测试单位");
        MeasurementUnitResponse created = measurementUnitService.create(req);

        assertNotNull(created.getId());
        assertEquals(req.getCode(), created.getCode());
        assertEquals(req.getName(), created.getName());
        assertTrue(created.isEnabled());
        assertFalse(created.isBuiltin());

        List<MeasurementUnitResponse> all = measurementUnitService.listAll();
        assertTrue(all.stream().anyMatch(u -> u.getCode().equals(req.getCode())));
    }

    @Test
    void measurementUnitDuplicateCodeRejected() {
        MeasurementUnitRequest req1 = makeDerivedRequest("MU_DUP_" + System.nanoTime(), "单位A");
        measurementUnitService.create(req1);

        MeasurementUnitRequest req2 = makeDerivedRequest(req1.getCode(), "单位B");

        assertThrows(IllegalArgumentException.class, () -> measurementUnitService.create(req2));
    }

    @Test
    void measurementUnitDuplicateNameRejected() {
        String sharedName = "同名单位_" + System.nanoTime();
        MeasurementUnitRequest req1 = makeDerivedRequest("MU_ND1_" + System.nanoTime(), sharedName);
        measurementUnitService.create(req1);

        MeasurementUnitRequest req2 = makeDerivedRequest("MU_ND2_" + System.nanoTime(), sharedName);

        assertThrows(IllegalArgumentException.class, () -> measurementUnitService.create(req2));
    }

    @Test
    void measurementUnitUpdateNonBuiltin() {
        MeasurementUnitRequest req = makeDerivedRequest("MU_UPD_" + System.nanoTime(), "更新前名称");
        MeasurementUnitResponse created = measurementUnitService.create(req);

        MeasurementUnitRequest updateReq = makeDerivedRequest("MU_UPD_NEW_" + System.nanoTime(), "更新后名称");
        updateReq.setEnabled(false);
        MeasurementUnitResponse updated = measurementUnitService.update(created.getId(), updateReq);

        assertEquals(updateReq.getCode(), updated.getCode());
        assertEquals(updateReq.getName(), updated.getName());
        assertFalse(updated.isEnabled());
    }

    @Test
    void measurementUnitSetEnabled() {
        MeasurementUnitRequest req = makeDerivedRequest("MU_EN_" + System.nanoTime(), "启停单位");
        MeasurementUnitResponse created = measurementUnitService.create(req);

        MeasurementUnitResponse disabled = measurementUnitService.setEnabled(created.getId(), false);
        assertFalse(disabled.isEnabled());

        MeasurementUnitResponse reEnabled = measurementUnitService.setEnabled(created.getId(), true);
        assertTrue(reEnabled.isEnabled());
    }

    @Test
    void projectTypeCreate_andList() {
        ProjectTypeRequest req = new ProjectTypeRequest();
        req.setCode("PT_LIST_" + System.nanoTime());
        req.setName("列表测试类型");
        req.setEnabled(true);
        ProjectTypeResponse created = projectTypeService.create(req);

        assertNotNull(created.getId());
        assertEquals(req.getCode(), created.getCode());
        assertEquals(req.getName(), created.getName());
        assertTrue(created.isEnabled());
        assertEquals(0, created.getReferenceCount());

        List<ProjectTypeResponse> all = projectTypeService.listAll();
        assertTrue(all.stream().anyMatch(t -> t.getCode().equals(req.getCode())));
    }

    @Test
    void projectTypeDuplicateCodeRejected() {
        ProjectTypeRequest req1 = new ProjectTypeRequest();
        req1.setCode("PT_DUP_" + System.nanoTime());
        req1.setName("类型A");
        req1.setEnabled(true);
        projectTypeService.create(req1);

        ProjectTypeRequest req2 = new ProjectTypeRequest();
        req2.setCode(req1.getCode());
        req2.setName("类型B");
        req2.setEnabled(true);

        assertThrows(IllegalArgumentException.class, () -> projectTypeService.create(req2));
    }

    @Test
    void projectTypeDuplicateNameRejected() {
        ProjectTypeRequest req1 = new ProjectTypeRequest();
        req1.setCode("PT_ND1_" + System.nanoTime());
        req1.setName("同名类型_" + System.nanoTime());
        req1.setEnabled(true);
        projectTypeService.create(req1);

        ProjectTypeRequest req2 = new ProjectTypeRequest();
        req2.setCode("PT_ND2_" + System.nanoTime());
        req2.setName(req1.getName());
        req2.setEnabled(true);

        assertThrows(IllegalArgumentException.class, () -> projectTypeService.create(req2));
    }

    @Test
    void projectTypeUpdate() {
        ProjectTypeRequest req = new ProjectTypeRequest();
        req.setCode("PT_UPD_" + System.nanoTime());
        req.setName("更新前类型");
        req.setEnabled(true);
        ProjectTypeResponse created = projectTypeService.create(req);

        ProjectTypeRequest updateReq = new ProjectTypeRequest();
        updateReq.setCode("PT_UPD_NEW_" + System.nanoTime());
        updateReq.setName("更新后类型");
        updateReq.setEnabled(false);
        ProjectTypeResponse updated = projectTypeService.update(created.getId(), updateReq);

        assertEquals(updateReq.getCode(), updated.getCode());
        assertEquals(updateReq.getName(), updated.getName());
        assertFalse(updated.isEnabled());
    }

    @Test
    void projectTypeSetEnabled_andValidateTypeCodeUsable() {
        ProjectTypeRequest req = new ProjectTypeRequest();
        req.setCode("PT_EN_" + System.nanoTime());
        req.setName("启停类型");
        req.setEnabled(true);
        ProjectTypeResponse created = projectTypeService.create(req);

        projectTypeService.validateTypeCodeUsable(req.getCode());

        projectTypeService.setEnabled(created.getId(), false);
        assertThrows(IllegalArgumentException.class, () -> projectTypeService.validateTypeCodeUsable(req.getCode()));
    }

    @Test
    void projectTypeGetByCode() {
        ProjectTypeRequest req = new ProjectTypeRequest();
        req.setCode("PT_GET_" + System.nanoTime());
        req.setName("按编码查询类型");
        req.setEnabled(true);
        projectTypeService.create(req);

        ProjectTypeResponse found = projectTypeService.getByCode(req.getCode());
        assertNotNull(found);
        assertEquals(req.getCode(), found.getCode());
        assertEquals(req.getName(), found.getName());
    }

    @Test
    void projectTypeGetByCodeNotFound() {
        assertThrows(IllegalArgumentException.class, () -> projectTypeService.getByCode("NONEXISTENT_TYPE"));
    }

    @Test
    void projectTypeDeleteUnreferenced() {
        ProjectTypeRequest req = new ProjectTypeRequest();
        req.setCode("PT_DEL_" + System.nanoTime());
        req.setName("可删除类型");
        req.setEnabled(true);
        ProjectTypeResponse created = projectTypeService.create(req);

        projectTypeService.delete(created.getId());

        assertThrows(IllegalArgumentException.class, () -> projectTypeService.getByCode(req.getCode()));
    }

    @Test
    void projectTypeDefaultSourceIsCustom() {
        ProjectTypeRequest req = new ProjectTypeRequest();
        req.setCode("PT_SRC_" + System.nanoTime());
        req.setName("默认来源类型");
        req.setEnabled(true);
        req.setSource(null);
        ProjectTypeResponse created = projectTypeService.create(req);

        assertEquals("CUSTOM", created.getSource());
    }
}
