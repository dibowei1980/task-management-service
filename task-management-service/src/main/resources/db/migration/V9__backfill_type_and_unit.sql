insert into project_type_definitions (id, code, name, description, measurement_unit_code, source, enabled, reference_count)
values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'BRIDGE_REMOVAL_BATCH', '桥梁拆除批次', '历史项目类型-桥梁拆除批次', 'UNIT_GE', 'BUILTIN', true, 0),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02', 'DATA_COLLECTION', '数据采集', '历史任务类型-数据采集', 'UNIT_POINT', 'BUILTIN', true, 0),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03', 'DATA_PROCESSING', '数据处理', '历史任务类型-数据处理', 'UNIT_GE', 'BUILTIN', true, 0),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa04', 'QUALITY_ASSURANCE', '质量保证', '历史任务类型-质量保证', 'UNIT_GE', 'BUILTIN', true, 0),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa05', 'DATA_PUBLISHING', '数据发布', '历史任务类型-数据发布', 'UNIT_GE', 'BUILTIN', true, 0),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa06', 'UNKNOWN_PROJECT_TYPE', '未知项目类型', '历史项目类型-未知项目类型', 'UNIT_GE', 'BUILTIN', true, 0)
on conflict (code) do nothing;

update tasks
set type = 'UNKNOWN_PROJECT_TYPE'
where type is null
  and category = 'PROJECT';

update tasks
set type = 'DATA_PROCESSING'
where type is null
  and category = 'OPERATION_TASK';

update tasks
set type = 'QUALITY_ASSURANCE'
where type is null
  and category = 'QA_TASK';

update tasks
set type = 'DATA_PROCESSING'
where type is null;

alter table tasks alter column type set not null;

update tasks t
set workload_unit = pt.measurement_unit_code
from project_type_definitions pt
where t.type = pt.code
  and (t.workload_unit is null or t.workload_unit = '');

update project_type_definitions pt
set reference_count = (
    select count(*) from tasks t where t.type = pt.code
);
