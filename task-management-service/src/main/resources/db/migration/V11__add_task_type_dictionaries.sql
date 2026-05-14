insert into measurement_unit_definitions (id, code, name, builtin, enabled)
values
    ('88888888-8888-8888-8888-888888888888', 'UNIT_KM', '公里', true, true),
    ('99999999-9999-9999-9999-999999999999', 'UNIT_PAGE', '页', true, true)
on conflict (code) do nothing;

create table if not exists task_type_group (
    id uuid primary key,
    code varchar(32) not null unique,
    name varchar(64) not null,
    sort_order integer not null default 0,
    enabled boolean not null default true,
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp
);

insert into task_type_group (id, code, name, sort_order, enabled)
values
    ('a0000001-0000-0000-0000-000000000001', 'DATA_COLLECTION', '数据采集', 1, true),
    ('a0000002-0000-0000-0000-000000000002', 'DATA_PROCESSING', '数据处理', 2, true),
    ('a0000003-0000-0000-0000-000000000003', 'PRODUCT_DEV', '产品制作与开发', 3, true),
    ('a0000004-0000-0000-0000-000000000004', 'DOC_COMPILATION', '文档编制', 4, true),
    ('a0000005-0000-0000-0000-000000000005', 'OTHER', '其他', 5, true)
on conflict (code) do nothing;

create table if not exists task_type_definitions (
    id uuid primary key,
    code varchar(64) not null unique,
    name varchar(128) not null,
    group_id uuid not null,
    measurement_unit_code varchar(32) not null,
    description varchar(500),
    source varchar(32) not null default 'BUILTIN',
    enabled boolean not null default true,
    reference_count integer not null default 0,
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp,
    constraint fk_task_type_group foreign key (group_id) references task_type_group(id),
    constraint fk_task_type_measurement_unit foreign key (measurement_unit_code) references measurement_unit_definitions(code)
);

insert into task_type_definitions (id, code, name, group_id, measurement_unit_code, enabled)
values
    ('b0000001-0000-0000-0000-000000000001', 'FIELD_MAPPING_SQKM', '外业调绘（平方公里）', 'a0000001-0000-0000-0000-000000000001', 'UNIT_SQ_KM', true),
    ('b0000001-0000-0000-0000-000000000002', 'FIELD_MAPPING_FU', '外业调绘（幅）', 'a0000001-0000-0000-0000-000000000001', 'UNIT_FU', true),
    ('b0000001-0000-0000-0000-000000000003', 'AERIAL_SURVEY_SQKM', '航空测量（平方公里）', 'a0000001-0000-0000-0000-000000000001', 'UNIT_SQ_KM', true),
    ('b0000001-0000-0000-0000-000000000004', 'PHOTO_CONTROL_PT', '像控测量（点）', 'a0000001-0000-0000-0000-000000000001', 'UNIT_POINT', true),
    ('b0000001-0000-0000-0000-000000000005', 'UAV_SURVEY_SQKM', '无人机测量（平方公里）', 'a0000001-0000-0000-0000-000000000001', 'UNIT_SQ_KM', true),
    ('b0000001-0000-0000-0000-000000000006', 'FULL_FIELD_SQKM', '全野外数据采集（平方公里）', 'a0000001-0000-0000-0000-000000000001', 'UNIT_SQ_KM', true),
    ('b0000001-0000-0000-0000-000000000007', 'FIELD_INVEST_SQKM', '野外调查（平方公里）', 'a0000001-0000-0000-0000-000000000001', 'UNIT_SQ_KM', true),
    ('b0000001-0000-0000-0000-000000000008', 'FIELD_INVEST_FU', '野外调查（幅）', 'a0000001-0000-0000-0000-000000000001', 'UNIT_FU', true),
    ('b0000001-0000-0000-0000-000000000009', 'CONTROL_BURIED_PT', '控制点埋设（点）', 'a0000001-0000-0000-0000-000000000001', 'UNIT_POINT', true),
    ('b0000001-0000-0000-0000-000000000010', 'LEVELING_KM', '水准测量（公里）', 'a0000001-0000-0000-0000-000000000001', 'UNIT_KM', true),
    ('b0000001-0000-0000-0000-000000000011', 'GNSS_OBS_PT', 'GNSS观测（点）', 'a0000001-0000-0000-0000-000000000001', 'UNIT_POINT', true),
    ('b0000002-0000-0000-0000-000000000001', 'INDOOR_INTERP_SQKM', '内业解译（平方公里）', 'a0000002-0000-0000-0000-000000000002', 'UNIT_SQ_KM', true),
    ('b0000002-0000-0000-0000-000000000002', 'INDOOR_INTERP_FU', '内业解译（幅）', 'a0000002-0000-0000-0000-000000000002', 'UNIT_FU', true),
    ('b0000002-0000-0000-0000-000000000003', 'TOPO_MAP_SQKM', '地形图编制（平方公里）', 'a0000002-0000-0000-0000-000000000002', 'UNIT_SQ_KM', true),
    ('b0000002-0000-0000-0000-000000000004', 'DATA_DB_SQKM', '数据建库（平方公里）', 'a0000002-0000-0000-0000-000000000002', 'UNIT_SQ_KM', true),
    ('b0000002-0000-0000-0000-000000000005', 'DATA_DB_FU', '数据建库（幅）', 'a0000002-0000-0000-0000-000000000002', 'UNIT_FU', true),
    ('b0000002-0000-0000-0000-000000000006', 'OBLIQUE_MODEL_SQKM', '倾斜摄影建模（平方公里）', 'a0000002-0000-0000-0000-000000000002', 'UNIT_SQ_KM', true),
    ('b0000002-0000-0000-0000-000000000007', 'TGS_MODEL_SQKM', '3DGS建模（平方公里）', 'a0000002-0000-0000-0000-000000000002', 'UNIT_SQ_KM', true),
    ('b0000002-0000-0000-0000-000000000008', 'MODEL_ROUGH_SQKM', '内业模型粗修（平方公里）', 'a0000002-0000-0000-0000-000000000002', 'UNIT_SQ_KM', true),
    ('b0000002-0000-0000-0000-000000000009', 'MODEL_MONO_GE', '内业单体建模（个）', 'a0000002-0000-0000-0000-000000000002', 'UNIT_GE', true),
    ('b0000002-0000-0000-0000-000000000010', 'LEVEL_CALC_KM', '水准计算（公里）', 'a0000002-0000-0000-0000-000000000002', 'UNIT_KM', true),
    ('b0000002-0000-0000-0000-000000000011', 'NETWORK_ADJ_PT', '控制网解算（点）', 'a0000002-0000-0000-0000-000000000002', 'UNIT_POINT', true),
    ('b0000003-0000-0000-0000-000000000001', 'SOFTWARE_DEV_GE', '软件开发（个）', 'a0000003-0000-0000-0000-000000000003', 'UNIT_GE', true),
    ('b0000003-0000-0000-0000-000000000002', 'DEM_MAKE_SQKM', 'DEM制作（平方公里）', 'a0000003-0000-0000-0000-000000000003', 'UNIT_SQ_KM', true),
    ('b0000003-0000-0000-0000-000000000003', 'DEM_MAKE_FU', 'DEM制作（幅）', 'a0000003-0000-0000-0000-000000000003', 'UNIT_FU', true),
    ('b0000003-0000-0000-0000-000000000004', 'DOM_MAKE_SQKM', 'DOM制作（平方公里）', 'a0000003-0000-0000-0000-000000000003', 'UNIT_SQ_KM', true),
    ('b0000003-0000-0000-0000-000000000005', 'DOM_MAKE_FU', 'DOM制作（幅）', 'a0000003-0000-0000-0000-000000000003', 'UNIT_FU', true),
    ('b0000003-0000-0000-0000-000000000006', 'EMAP_MAKE_SQKM', '电子地图制作（平方公里）', 'a0000003-0000-0000-0000-000000000003', 'UNIT_SQ_KM', true),
    ('b0000003-0000-0000-0000-000000000007', 'EMAP_MAKE_FU', '电子地图制作（幅）', 'a0000003-0000-0000-0000-000000000003', 'UNIT_FU', true),
    ('b0000003-0000-0000-0000-000000000008', 'ATLAS_PAGE', '地图集制作（页）', 'a0000003-0000-0000-0000-000000000003', 'UNIT_PAGE', true),
    ('b0000003-0000-0000-0000-000000000009', 'MAP25D_SQKM', '2.5维地图制作（平方公里）', 'a0000003-0000-0000-0000-000000000003', 'UNIT_SQ_KM', true),
    ('b0000003-0000-0000-0000-000000000010', 'THEMATIC_MAP_FU', '专题图制作（幅）', 'a0000003-0000-0000-0000-000000000003', 'UNIT_FU', true),
    ('b0000004-0000-0000-0000-000000000001', 'TECH_DESIGN_BEN', '专业技术设计书编写（本）', 'a0000004-0000-0000-0000-000000000004', 'UNIT_BEN', true),
    ('b0000004-0000-0000-0000-000000000002', 'TECH_SUMMARY_BEN', '工作技术总结编写（本）', 'a0000004-0000-0000-0000-000000000004', 'UNIT_BEN', true),
    ('b0000004-0000-0000-0000-000000000003', 'STANDARD_SPEC_BEN', '标准规范编制（本）', 'a0000004-0000-0000-0000-000000000004', 'UNIT_BEN', true),
    ('b0000005-0000-0000-0000-000000000001', 'TASK_OTHER', '其他任务', 'a0000005-0000-0000-0000-000000000005', 'UNIT_GE', true)
on conflict (code) do nothing;
