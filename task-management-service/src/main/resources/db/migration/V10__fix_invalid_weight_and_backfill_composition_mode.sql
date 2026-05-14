update tasks
set weight = 1
where weight < 1 or weight > 100;

update tasks
set weight = least(greatest(weight, 1), 100)
where weight is null;

update tasks
set composition_mode = 'HOMOGENEOUS'
where parent_task_id is not null
  and composition_mode is null
  and type is not null
  and type != ''
  and exists (
    select 1 from tasks sibling
    where sibling.parent_task_id = tasks.parent_task_id
      and sibling.type = tasks.type
      and sibling.id != tasks.id
  );

update tasks
set composition_mode = 'HETEROGENEOUS'
where parent_task_id is not null
  and composition_mode is null
  and type is not null
  and type != ''
  and exists (
    select 1 from tasks sibling
    where sibling.parent_task_id = tasks.parent_task_id
      and sibling.type != tasks.type
      and sibling.id != tasks.id
  );
