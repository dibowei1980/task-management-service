DELETE FROM task_type_definitions WHERE code = 'BRIDGE_REMOVAL_UNIT';

DELETE FROM task_type_definitions WHERE code = 'BRIDGE_REMOVAL_BATCH' AND source = 'BUILTIN';

DELETE FROM project_type_definitions WHERE code = 'BRIDGE_REMOVAL_BATCH';
