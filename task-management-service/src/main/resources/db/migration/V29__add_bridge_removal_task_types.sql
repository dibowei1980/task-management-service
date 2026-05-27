INSERT INTO task_type_definitions (id, code, name, group_id, description, source, enabled, reference_count, created_at, updated_at)
VALUES
    ('b0000002-0000-0000-0000-000000000010', 'BRIDGE_REMOVAL_BATCH', '桥梁去除（批次）',
     (SELECT id FROM task_type_group WHERE code = 'DATA_PROCESSING'),
     '桥梁去除批次任务', 'BUILTIN', true, 0, now(), now()),
    ('b0000002-0000-0000-0000-000000000011', 'BRIDGE_REMOVAL_UNIT', '桥梁去除（单元）',
     (SELECT id FROM task_type_group WHERE code = 'DATA_PROCESSING'),
     '桥梁去除单元任务', 'BUILTIN', true, 0, now(), now())
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    source = EXCLUDED.source,
    updated_at = now();

INSERT INTO project_type_definitions (id, code, name, description, source, enabled, reference_count, created_at, updated_at)
VALUES
    ('c0000001-0000-0000-0000-00000000000e', 'BRIDGE_REMOVAL_BATCH', '桥梁去除（批次）', '桥梁去除项目', 'BUILTIN', true, 0, now(), now())
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = now();
