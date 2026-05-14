UPDATE task_type_definitions SET code = 'FIELD_MAPPING', name = '外业调绘' WHERE code = 'FIELD_MAPPING_SQKM';
DELETE FROM task_type_definitions WHERE code = 'FIELD_MAPPING_FU';

UPDATE task_type_definitions SET code = 'AERIAL_SURVEY', name = '航空测量' WHERE code = 'AERIAL_SURVEY_SQKM';

UPDATE task_type_definitions SET code = 'PHOTO_CONTROL', name = '像控测量' WHERE code = 'PHOTO_CONTROL_PT';

UPDATE task_type_definitions SET code = 'UAV_SURVEY', name = '无人机测量' WHERE code = 'UAV_SURVEY_SQKM';

UPDATE task_type_definitions SET code = 'FULL_FIELD', name = '全野外数据采集' WHERE code = 'FULL_FIELD_SQKM';

UPDATE task_type_definitions SET code = 'FIELD_INVEST', name = '野外调查' WHERE code = 'FIELD_INVEST_SQKM';
DELETE FROM task_type_definitions WHERE code = 'FIELD_INVEST_FU';

UPDATE task_type_definitions SET code = 'CONTROL_BURIED', name = '控制点埋设' WHERE code = 'CONTROL_BURIED_PT';

UPDATE task_type_definitions SET code = 'LEVELING', name = '水准测量' WHERE code = 'LEVELING_KM';

UPDATE task_type_definitions SET code = 'GNSS_OBS', name = 'GNSS观测' WHERE code = 'GNSS_OBS_PT';

UPDATE task_type_definitions SET code = 'INDOOR_INTERP', name = '内业解译' WHERE code = 'INDOOR_INTERP_SQKM';
DELETE FROM task_type_definitions WHERE code = 'INDOOR_INTERP_FU';

UPDATE task_type_definitions SET code = 'TOPO_MAP', name = '地形图编制' WHERE code = 'TOPO_MAP_SQKM';

UPDATE task_type_definitions SET code = 'DATA_DB', name = '数据建库' WHERE code = 'DATA_DB_SQKM';
DELETE FROM task_type_definitions WHERE code = 'DATA_DB_FU';

UPDATE task_type_definitions SET code = 'OBLIQUE_MODEL', name = '倾斜摄影建模' WHERE code = 'OBLIQUE_MODEL_SQKM';

UPDATE task_type_definitions SET code = 'TGS_MODEL', name = '3DGS建模' WHERE code = 'TGS_MODEL_SQKM';

UPDATE task_type_definitions SET code = 'MODEL_ROUGH', name = '内业模型粗修' WHERE code = 'MODEL_ROUGH_SQKM';

UPDATE task_type_definitions SET code = 'MODEL_MONO', name = '内业单体建模' WHERE code = 'MODEL_MONO_GE';

UPDATE task_type_definitions SET code = 'LEVEL_CALC', name = '水准计算' WHERE code = 'LEVEL_CALC_KM';

UPDATE task_type_definitions SET code = 'NETWORK_ADJ', name = '控制网解算' WHERE code = 'NETWORK_ADJ_PT';

UPDATE task_type_definitions SET code = 'DLG_MAKE', name = 'DLG制作', group_id = (SELECT id FROM task_type_group WHERE code = 'PRODUCT_DEV') WHERE code = 'SOFTWARE_DEV_GE';

UPDATE task_type_definitions SET code = 'DEM_MAKE', name = 'DEM制作' WHERE code = 'DEM_MAKE_SQKM';
DELETE FROM task_type_definitions WHERE code = 'DEM_MAKE_FU';

UPDATE task_type_definitions SET code = 'DOM_MAKE', name = 'DOM制作' WHERE code = 'DOM_MAKE_SQKM';
DELETE FROM task_type_definitions WHERE code = 'DOM_MAKE_FU';

UPDATE task_type_definitions SET code = 'EMAP_MAKE', name = '电子地图制作' WHERE code = 'EMAP_MAKE_SQKM';
DELETE FROM task_type_definitions WHERE code = 'EMAP_MAKE_FU';

UPDATE task_type_definitions SET code = 'ATLAS', name = '地图集制作' WHERE code = 'ATLAS_PAGE';

UPDATE task_type_definitions SET code = 'MAP25D', name = '2.5维地图制作' WHERE code = 'MAP25D_SQKM';

UPDATE task_type_definitions SET code = 'THEMATIC_MAP', name = '专题图制作' WHERE code = 'THEMATIC_MAP_FU';

UPDATE task_type_definitions SET code = 'SOFTWARE_DEV', name = '软件开发', group_id = (SELECT id FROM task_type_group WHERE code = 'PRODUCT_DEV') WHERE code IN ('SOFTWARE_DEV_GE');

UPDATE task_type_definitions SET code = 'TECH_DESIGN', name = '专业技术设计书编写' WHERE code = 'TECH_DESIGN_BEN';

UPDATE task_type_definitions SET code = 'TECH_SUMMARY', name = '工作技术总结编写' WHERE code = 'TECH_SUMMARY_BEN';

UPDATE task_type_definitions SET code = 'STANDARD_SPEC', name = '标准规范编制' WHERE code = 'STANDARD_SPEC_BEN';

DELETE FROM task_type_definitions WHERE code = 'TASK_OTHER';

DELETE FROM task_type_group WHERE code = 'OTHER';

UPDATE tasks SET type = 'FIELD_MAPPING' WHERE type IN ('FIELD_MAPPING_SQKM', 'FIELD_MAPPING_FU');
UPDATE tasks SET type = 'AERIAL_SURVEY' WHERE type = 'AERIAL_SURVEY_SQKM';
UPDATE tasks SET type = 'PHOTO_CONTROL' WHERE type = 'PHOTO_CONTROL_PT';
UPDATE tasks SET type = 'UAV_SURVEY' WHERE type = 'UAV_SURVEY_SQKM';
UPDATE tasks SET type = 'FULL_FIELD' WHERE type = 'FULL_FIELD_SQKM';
UPDATE tasks SET type = 'FIELD_INVEST' WHERE type IN ('FIELD_INVEST_SQKM', 'FIELD_INVEST_FU');
UPDATE tasks SET type = 'CONTROL_BURIED' WHERE type = 'CONTROL_BURIED_PT';
UPDATE tasks SET type = 'LEVELING' WHERE type = 'LEVELING_KM';
UPDATE tasks SET type = 'GNSS_OBS' WHERE type = 'GNSS_OBS_PT';
UPDATE tasks SET type = 'INDOOR_INTERP' WHERE type IN ('INDOOR_INTERP_SQKM', 'INDOOR_INTERP_FU');
UPDATE tasks SET type = 'TOPO_MAP' WHERE type = 'TOPO_MAP_SQKM';
UPDATE tasks SET type = 'DATA_DB' WHERE type IN ('DATA_DB_SQKM', 'DATA_DB_FU');
UPDATE tasks SET type = 'OBLIQUE_MODEL' WHERE type = 'OBLIQUE_MODEL_SQKM';
UPDATE tasks SET type = 'TGS_MODEL' WHERE type = 'TGS_MODEL_SQKM';
UPDATE tasks SET type = 'MODEL_ROUGH' WHERE type = 'MODEL_ROUGH_SQKM';
UPDATE tasks SET type = 'MODEL_MONO' WHERE type = 'MODEL_MONO_GE';
UPDATE tasks SET type = 'LEVEL_CALC' WHERE type = 'LEVEL_CALC_KM';
UPDATE tasks SET type = 'NETWORK_ADJ' WHERE type = 'NETWORK_ADJ_PT';
UPDATE tasks SET type = 'DEM_MAKE' WHERE type IN ('DEM_MAKE_SQKM', 'DEM_MAKE_FU');
UPDATE tasks SET type = 'DOM_MAKE' WHERE type IN ('DOM_MAKE_SQKM', 'DOM_MAKE_FU');
UPDATE tasks SET type = 'EMAP_MAKE' WHERE type IN ('EMAP_MAKE_SQKM', 'EMAP_MAKE_FU');
UPDATE tasks SET type = 'ATLAS' WHERE type = 'ATLAS_PAGE';
UPDATE tasks SET type = 'MAP25D' WHERE type = 'MAP25D_SQKM';
UPDATE tasks SET type = 'THEMATIC_MAP' WHERE type = 'THEMATIC_MAP_FU';
UPDATE tasks SET type = 'SOFTWARE_DEV' WHERE type = 'SOFTWARE_DEV_GE';
UPDATE tasks SET type = 'TECH_DESIGN' WHERE type = 'TECH_DESIGN_BEN';
UPDATE tasks SET type = 'TECH_SUMMARY' WHERE type = 'TECH_SUMMARY_BEN';
UPDATE tasks SET type = 'STANDARD_SPEC' WHERE type = 'STANDARD_SPEC_BEN';
