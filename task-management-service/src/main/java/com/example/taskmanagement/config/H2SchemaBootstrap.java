package com.example.taskmanagement.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;

@Component
public class H2SchemaBootstrap implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(H2SchemaBootstrap.class);
    private final DataSource dataSource;
    private final JdbcTemplate jdbcTemplate;

    public H2SchemaBootstrap(DataSource dataSource, JdbcTemplate jdbcTemplate) {
        this.dataSource = dataSource;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!isH2()) return;

        createMeasurementUnits();
        insertMeasurementUnits();

        createProjectTypes();
        insertProjectTypes();

        createTaskTypeGroup();
        insertTaskTypeGroups();

        createTaskTypeDefinitions();
        insertTaskTypeDefinitions();

        createTaskAttachments();
        createActionAttachments();

        alterTasksAddColumns();
    }

    // ---------- measurement_unit_definitions ----------

    private void createMeasurementUnits() {
        exec("CREATE TABLE IF NOT EXISTS measurement_unit_definitions (" +
                "id UUID PRIMARY KEY, " +
                "code VARCHAR(32) NOT NULL UNIQUE, " +
                "name VARCHAR(32) NOT NULL UNIQUE, " +
                "builtin BOOLEAN NOT NULL DEFAULT FALSE, " +
                "enabled BOOLEAN NOT NULL DEFAULT TRUE, " +
                "base_unit_code VARCHAR(32), " +
                "conversion_factor DOUBLE, " +
                "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
                "updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" +
                ")");
        exec("ALTER TABLE measurement_unit_definitions ADD COLUMN IF NOT EXISTS base_unit_code VARCHAR(32)");
        exec("ALTER TABLE measurement_unit_definitions ADD COLUMN IF NOT EXISTS conversion_factor DOUBLE");
        exec("ALTER TABLE measurement_unit_definitions ADD CONSTRAINT IF NOT EXISTS fk_unit_base_unit " +
                "FOREIGN KEY (base_unit_code) REFERENCES measurement_unit_definitions(code)");
    }

    private void insertMeasurementUnits() {
        execUpsertUnit("11111111-1111-1111-1111-111111111110", "UNIT_M",       "米",     null, null);
        execUpsertUnit("11111111-1111-1111-1111-111111111112", "UNIT_CUBIC_M", "立方米", null, null);
        execUpsertUnit("11111111-1111-1111-1111-111111111113", "UNIT_KG",      "千克",   null, null);
        execUpsertUnit("11111111-1111-1111-1111-111111111114", "UNIT_COUNT",   "计数",   null, null);
        execUpsertUnit("33333333-3333-3333-3333-333333333333", "UNIT_SQ_M",    "平方米", null, null);

        execUpsertUnit("11111111-1111-1111-1111-111111111111", "UNIT_GE",      "个",       "UNIT_COUNT", 1.0);
        execUpsertUnit("22222222-2222-2222-2222-222222222222", "UNIT_SQ_KM",   "平方公里", "UNIT_SQ_M",  1000000.0);
        execUpsertUnit("44444444-4444-4444-4444-444444444444", "UNIT_POINT",   "点",       "UNIT_COUNT", 1.0);
        execUpsertUnit("55555555-5555-5555-5555-555555555555", "UNIT_FU",      "幅",       "UNIT_COUNT", 1.0);
        execUpsertUnit("66666666-6666-6666-6666-666666666666", "UNIT_ZHANG",   "张",       "UNIT_COUNT", 1.0);
        execUpsertUnit("77777777-7777-7777-7777-777777777777", "UNIT_BEN",     "本",       "UNIT_COUNT", 1.0);
        execUpsertUnit("88888888-8888-8888-8888-888888888888", "UNIT_KM",      "公里",     "UNIT_M",     1000.0);
        execUpsertUnit("99999999-9999-9999-9999-999999999999", "UNIT_PAGE",    "页",       "UNIT_COUNT", 1.0);
    }

    private void execUpsertUnit(String id, String code, String name, String baseUnitCode, Double conversionFactor) {
        String baseVal = baseUnitCode == null ? "NULL" : "'" + baseUnitCode + "'";
        String factorVal = conversionFactor == null ? "NULL" : String.valueOf(conversionFactor);
        exec("MERGE INTO measurement_unit_definitions (id, code, name, builtin, enabled, base_unit_code, conversion_factor, created_at, updated_at) KEY(code) VALUES ('" +
                id + "', '" + code + "', '" + name + "', TRUE, TRUE, " + baseVal + ", " + factorVal + ", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
    }

    // ---------- project_type_definitions ----------

    private void createProjectTypes() {
        exec("CREATE TABLE IF NOT EXISTS project_type_definitions (" +
                "id UUID PRIMARY KEY, " +
                "code VARCHAR(64) NOT NULL UNIQUE, " +
                "name VARCHAR(128) NOT NULL, " +
                "description VARCHAR(500), " +
                "source VARCHAR(32) NOT NULL DEFAULT 'CUSTOM', " +
                "enabled BOOLEAN NOT NULL DEFAULT TRUE, " +
                "reference_count INTEGER NOT NULL DEFAULT 0, " +
                "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
                "updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" +
                ")");
    }

    private void insertProjectTypes() {
        execUpsertProject("c0000001-0000-0000-0000-000000000001", "COMPREHENSIVE", "综合性项目", "跨领域综合生产项目");
        execUpsertProject("c0000001-0000-0000-0000-000000000002", "BASIC_SURVEY", "基础测绘", "基础测绘服务");
        execUpsertProject("c0000001-0000-0000-0000-000000000003", "NEW_BASIC_3D", "新型基础测绘和实景三维", "新型基础测绘与实景三维建设");
        execUpsertProject("c0000001-0000-0000-0000-000000000004", "SURVEY_DATUM", "测绘基准", "测绘基准建设与维护");
        execUpsertProject("c0000001-0000-0000-0000-000000000005", "TERRITORY_PLAN", "国土空间规划", "国土空间规划编制");
        execUpsertProject("c0000001-0000-0000-0000-000000000006", "ENGINEERING_SURVEY", "工程测量", "工程测量服务");
        execUpsertProject("c0000001-0000-0000-0000-000000000007", "REAL_ESTATE_SURVEY", "不动产测绘", "不动产登记测绘");
        execUpsertProject("c0000001-0000-0000-0000-000000000008", "EMERGENCY_SURVEY", "应急测绘", "应急测绘保障");
        execUpsertProject("c0000001-0000-0000-0000-000000000009", "LAND_APPROVAL", "土地报批", "土地报批服务");
        execUpsertProject("c0000001-0000-0000-0000-00000000000a", "SURVEY_MONITOR", "调查监测", "自然资源调查监测");
        execUpsertProject("c0000001-0000-0000-0000-00000000000b", "SMART_CITY", "智慧城市", "智慧城市相关服务");
        execUpsertProject("c0000001-0000-0000-0000-00000000000c", "MAP_COMPILATION", "地图编制", "地图编制服务");
        execUpsertProject("c0000001-0000-0000-0000-00000000000d", "OTHER", "其他", "未分类项目类型");
    }

    private void execUpsertProject(String id, String code, String name, String desc) {
        exec("MERGE INTO project_type_definitions (id, code, name, description, source, enabled, reference_count, created_at, updated_at) " +
                "KEY(code) VALUES ('" + id + "', '" + code + "', '" + name + "', '" + desc + "', 'BUILTIN', TRUE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
    }

    // ---------- task_type_group ----------

    private void createTaskTypeGroup() {
        exec("CREATE TABLE IF NOT EXISTS task_type_group (" +
                "id UUID PRIMARY KEY, " +
                "code VARCHAR(32) NOT NULL UNIQUE, " +
                "name VARCHAR(64) NOT NULL, " +
                "sort_order INTEGER NOT NULL DEFAULT 0, " +
                "enabled BOOLEAN NOT NULL DEFAULT TRUE, " +
                "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
                "updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" +
                ")");
    }

    private void insertTaskTypeGroups() {
        execUpsertGroup("a0000001-0000-0000-0000-000000000001", "DATA_COLLECTION", "数据采集", 1);
        execUpsertGroup("a0000002-0000-0000-0000-000000000002", "DATA_PROCESSING", "数据处理", 2);
        execUpsertGroup("a0000003-0000-0000-0000-000000000003", "PRODUCT_DEV", "产品制作与开发", 3);
        execUpsertGroup("a0000004-0000-0000-0000-000000000004", "DOC_COMPILATION", "文档编制", 4);
    }

    private void execUpsertGroup(String id, String code, String name, int sortOrder) {
        exec("MERGE INTO task_type_group (id, code, name, sort_order, enabled, created_at, updated_at) KEY(code) VALUES ('" +
                id + "', '" + code + "', '" + name + "', " + sortOrder + ", TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
    }

    // ---------- task_type_definitions ----------

    private void createTaskTypeDefinitions() {
        exec("CREATE TABLE IF NOT EXISTS task_type_definitions (" +
                "id UUID PRIMARY KEY, " +
                "code VARCHAR(64) NOT NULL UNIQUE, " +
                "name VARCHAR(128) NOT NULL, " +
                "group_id UUID NOT NULL, " +
                "description VARCHAR(500), " +
                "source VARCHAR(32) NOT NULL DEFAULT 'BUILTIN', " +
                "enabled BOOLEAN NOT NULL DEFAULT TRUE, " +
                "reference_count INTEGER NOT NULL DEFAULT 0, " +
                "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
                "updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" +
                ")");
    }

    private void insertTaskTypeDefinitions() {
        String dc = "a0000001-0000-0000-0000-000000000001";
        String dp = "a0000002-0000-0000-0000-000000000002";
        String pd = "a0000003-0000-0000-0000-000000000003";
        String doc = "a0000004-0000-0000-0000-000000000004";

        execUpsertTaskType("b0000001-0000-0000-0000-000000000001", "FIELD_MAPPING", "外业调绘", dc);
        execUpsertTaskType("b0000001-0000-0000-0000-000000000002", "AERIAL_SURVEY", "航空测量", dc);
        execUpsertTaskType("b0000001-0000-0000-0000-000000000003", "PHOTO_CONTROL", "像控测量", dc);
        execUpsertTaskType("b0000001-0000-0000-0000-000000000004", "UAV_SURVEY", "无人机测量", dc);
        execUpsertTaskType("b0000001-0000-0000-0000-000000000005", "FULL_FIELD", "全野外数据采集", dc);
        execUpsertTaskType("b0000001-0000-0000-0000-000000000006", "FIELD_INVEST", "野外调查", dc);
        execUpsertTaskType("b0000001-0000-0000-0000-000000000007", "CONTROL_BURIED", "控制点埋设", dc);
        execUpsertTaskType("b0000001-0000-0000-0000-000000000008", "LEVELING", "水准测量", dc);
        execUpsertTaskType("b0000001-0000-0000-0000-000000000009", "GNSS_OBS", "GNSS观测", dc);

        execUpsertTaskType("b0000002-0000-0000-0000-000000000001", "INDOOR_INTERP", "内业解译", dp);
        execUpsertTaskType("b0000002-0000-0000-0000-000000000002", "TOPO_MAP", "地形图编制", dp);
        execUpsertTaskType("b0000002-0000-0000-0000-000000000003", "DATA_DB", "数据建库", dp);
        execUpsertTaskType("b0000002-0000-0000-0000-000000000004", "OBLIQUE_MODEL", "倾斜摄影建模", dp);
        execUpsertTaskType("b0000002-0000-0000-0000-000000000005", "TGS_MODEL", "3DGS建模", dp);
        execUpsertTaskType("b0000002-0000-0000-0000-000000000006", "MODEL_ROUGH", "内业模型粗修", dp);
        execUpsertTaskType("b0000002-0000-0000-0000-000000000007", "MODEL_MONO", "内业单体建模", dp);
        execUpsertTaskType("b0000002-0000-0000-0000-000000000008", "LEVEL_CALC", "水准计算", dp);
        execUpsertTaskType("b0000002-0000-0000-0000-000000000009", "NETWORK_ADJ", "控制网解算", dp);

        execUpsertTaskType("b0000003-0000-0000-0000-000000000001", "DLG_MAKE", "DLG制作", pd);
        execUpsertTaskType("b0000003-0000-0000-0000-000000000002", "DEM_MAKE", "DEM制作", pd);
        execUpsertTaskType("b0000003-0000-0000-0000-000000000003", "DOM_MAKE", "DOM制作", pd);
        execUpsertTaskType("b0000003-0000-0000-0000-000000000004", "EMAP_MAKE", "电子地图制作", pd);
        execUpsertTaskType("b0000003-0000-0000-0000-000000000005", "ATLAS", "地图集制作", pd);
        execUpsertTaskType("b0000003-0000-0000-0000-000000000006", "MAP25D", "2.5维地图制作", pd);
        execUpsertTaskType("b0000003-0000-0000-0000-000000000007", "THEMATIC_MAP", "专题图制作", pd);
        execUpsertTaskType("b0000003-0000-0000-0000-000000000008", "SOFTWARE_DEV", "软件开发", pd);

        execUpsertTaskType("b0000004-0000-0000-0000-000000000001", "TECH_DESIGN", "专业技术设计书编写", doc);
        execUpsertTaskType("b0000004-0000-0000-0000-000000000002", "TECH_SUMMARY", "工作技术总结编写", doc);
        execUpsertTaskType("b0000004-0000-0000-0000-000000000003", "STANDARD_SPEC", "标准规范编制", doc);
    }

    private void execUpsertTaskType(String id, String code, String name, String groupId) {
        exec("MERGE INTO task_type_definitions (id, code, name, group_id, source, enabled, reference_count, created_at, updated_at) " +
                "KEY(code) VALUES ('" + id + "', '" + code + "', '" + name + "', '" + groupId + "', 'BUILTIN', TRUE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
    }

    // ---------- task_attachments ----------

    private void createTaskAttachments() {
        exec("CREATE TABLE IF NOT EXISTS task_attachments (" +
                "id UUID PRIMARY KEY, " +
                "task_id UUID NOT NULL, " +
                "file_name VARCHAR(255) NOT NULL, " +
                "stored_name VARCHAR(255) NOT NULL, " +
                "file_size BIGINT NOT NULL, " +
                "content_type VARCHAR(100) NOT NULL, " +
                "storage_path VARCHAR(500) NOT NULL, " +
                "uploaded_by UUID, " +
                "uploaded_by_name VARCHAR(128), " +
                "uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
                "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" +
                ")");
    }

    private void createActionAttachments() {
        exec("CREATE TABLE IF NOT EXISTS task_action_attachments (" +
                "id UUID PRIMARY KEY, " +
                "task_id UUID NOT NULL, " +
                "action VARCHAR(32) NOT NULL, " +
                "type VARCHAR(16) NOT NULL, " +
                "file_name VARCHAR(255), " +
                "stored_name VARCHAR(255), " +
                "file_size BIGINT, " +
                "content_type VARCHAR(100), " +
                "storage_path VARCHAR(500), " +
                "link_url VARCHAR(2000), " +
                "link_label VARCHAR(255), " +
                "inherited_from UUID, " +
                "uploaded_by UUID, " +
                "uploaded_by_name VARCHAR(128), " +
                "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" +
                ")");
    }

    // ---------- tasks columns ----------

    private void alterTasksAddColumns() {
        exec("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workload DOUBLE");
        exec("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workload_unit VARCHAR(32)");
        exec("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS composition_mode VARCHAR(16)");
        exec("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS weight INTEGER DEFAULT 1");
        exec("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workflow_status VARCHAR(32)");
        exec("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS remarks TEXT");
        exec("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachment_count INTEGER DEFAULT 0");
        exec("UPDATE tasks SET weight = 1 WHERE weight IS NULL AND parent_task_id IS NOT NULL");
    }

    // ---------- helpers ----------

    private boolean isH2() {
        try (Connection c = dataSource.getConnection()) {
            DatabaseMetaData meta = c.getMetaData();
            String name = meta.getDatabaseProductName();
            return name != null && name.toLowerCase().contains("h2");
        } catch (Exception e) {
            return false;
        }
    }

    private void exec(String sql) {
        try {
            jdbcTemplate.execute(sql);
        } catch (Exception e) {
            log.error("H2SchemaBootstrap SQL failed: {}", e.getMessage());
            log.debug("H2SchemaBootstrap SQL failed", e);
        }
    }
}
