create table if not exists tasks (
    id uuid primary key,
    name varchar(255) not null,
    type varchar(64) not null,
    category varchar(32) not null,
    status varchar(32) not null,
    priority integer,
    assignee_id uuid,
    project_id uuid,
    self_check_for_task_id uuid,
    progress integer,
    input_params text,
    output_results text,
    parent_task_id uuid,
    department_id varchar(64),
    created_at timestamptz,
    started_at timestamptz,
    due_at timestamptz,
    planned_due_at timestamptz,
    completed_at timestamptz,
    version integer
);

create unique index if not exists ux_tasks_self_check_for_task_id on tasks(self_check_for_task_id) where self_check_for_task_id is not null;
create index if not exists ix_tasks_parent_task_id on tasks(parent_task_id);
create index if not exists ix_tasks_project_id on tasks(project_id);
create index if not exists ix_tasks_department_id on tasks(department_id);
create index if not exists ix_tasks_assignee_id on tasks(assignee_id);

alter table tasks
    add constraint if not exists fk_tasks_parent_task foreign key (parent_task_id) references tasks(id) on delete cascade;

alter table tasks
    add constraint if not exists fk_tasks_project foreign key (project_id) references tasks(id) on delete cascade;

create table if not exists task_dependencies (
    id uuid primary key,
    predecessor_id uuid not null,
    successor_id uuid not null,
    dependency_type varchar(32),
    constraint ux_task_dependencies_pair unique (predecessor_id, successor_id),
    constraint fk_task_dependencies_predecessor foreign key (predecessor_id) references tasks(id) on delete cascade,
    constraint fk_task_dependencies_successor foreign key (successor_id) references tasks(id) on delete cascade
);

create index if not exists ix_task_dependencies_predecessor on task_dependencies(predecessor_id);
create index if not exists ix_task_dependencies_successor on task_dependencies(successor_id);

create table if not exists task_assignments (
    task_id uuid not null,
    user_id uuid not null,
    assignment_role varchar(32) not null,
    primary key (task_id, user_id, assignment_role),
    constraint fk_task_assignments_task foreign key (task_id) references tasks(id) on delete cascade
);

create index if not exists ix_task_assignments_task on task_assignments(task_id);
create index if not exists ix_task_assignments_user on task_assignments(user_id);
