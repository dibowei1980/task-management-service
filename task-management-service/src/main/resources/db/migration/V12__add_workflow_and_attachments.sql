alter table tasks add column if not exists workflow_status varchar(32);
alter table tasks add column if not exists remarks text;
alter table tasks add column if not exists attachment_count integer not null default 0;

create table if not exists task_attachments (
    id uuid primary key,
    task_id uuid not null,
    file_name varchar(255) not null,
    stored_name varchar(255) not null,
    file_size bigint not null,
    content_type varchar(100) not null,
    storage_path varchar(500) not null,
    uploaded_by UUID,
    uploaded_by_name varchar(128),
    uploaded_at timestamptz not null default current_timestamp,
    created_at timestamptz not null default current_timestamp,
    constraint fk_task_attachments_task foreign key (task_id) references tasks(id) on delete cascade
);

create index ix_task_attachments_task on task_attachments(task_id);
