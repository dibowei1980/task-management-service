alter table tasks add column if not exists category varchar(32) not null default 'OPERATION_TASK';
alter table tasks add column if not exists project_id uuid;
alter table tasks add column if not exists self_check_for_task_id uuid;
alter table tasks add column if not exists planned_due_at timestamptz;

update tasks set planned_due_at = due_at where planned_due_at is null and due_at is not null;

update tasks
set category = case
    when type = 'BRIDGE_REMOVAL_BATCH' then 'PROJECT'
    when type = 'QUALITY_ASSURANCE' then 'QA_TASK'
    else 'OPERATION_TASK'
end
where category is null or category = 'OPERATION_TASK';

with recursive task_tree as (
    select
        t.id as task_id,
        t.parent_task_id as parent_id,
        case when t.type = 'BRIDGE_REMOVAL_BATCH' then t.id else null end as project_id
    from tasks t
    union all
    select
        c.id as task_id,
        c.parent_task_id as parent_id,
        case when p.project_id is not null then p.project_id
             when c.type = 'BRIDGE_REMOVAL_BATCH' then c.id
             else null end as project_id
    from tasks c
    join task_tree p on p.task_id = c.parent_task_id
)
update tasks t
set project_id = tt.project_id
from (
    select task_id, max(project_id) as project_id
    from task_tree
    group by task_id
) tt
where t.id = tt.task_id
  and t.type <> 'BRIDGE_REMOVAL_BATCH'
  and t.project_id is null;

create unique index if not exists ux_tasks_self_check_for_task_id on tasks(self_check_for_task_id) where self_check_for_task_id is not null;
create index if not exists ix_tasks_project_id on tasks(project_id);

alter table tasks
    add constraint if not exists fk_tasks_project foreign key (project_id) references tasks(id) on delete cascade;
