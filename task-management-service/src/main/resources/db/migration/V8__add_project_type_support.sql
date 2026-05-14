create table if not exists measurement_unit_definitions (
    id uuid primary key,
    code varchar(32) not null unique,
    name varchar(32) not null unique,
    builtin boolean not null default false,
    enabled boolean not null default true,
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp
);

insert into measurement_unit_definitions (id, code, name, builtin, enabled)
values
    ('11111111-1111-1111-1111-111111111111', 'UNIT_GE', '个', true, true),
    ('22222222-2222-2222-2222-222222222222', 'UNIT_SQ_KM', '平方公里', true, true),
    ('33333333-3333-3333-3333-333333333333', 'UNIT_SQ_M', '平方米', true, true),
    ('44444444-4444-4444-4444-444444444444', 'UNIT_POINT', '点', true, true),
    ('55555555-5555-5555-5555-555555555555', 'UNIT_FU', '幅', true, true),
    ('66666666-6666-6666-6666-666666666666', 'UNIT_ZHANG', '张', true, true),
    ('77777777-7777-7777-7777-777777777777', 'UNIT_BEN', '本', true, true)
on conflict (code) do nothing;

create table if not exists project_type_definitions (
    id uuid primary key,
    code varchar(64) not null unique,
    name varchar(128) not null,
    description varchar(500),
    measurement_unit_code varchar(32) not null,
    source varchar(32) not null default 'CUSTOM',
    enabled boolean not null default true,
    reference_count integer not null default 0,
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp,
    constraint fk_project_type_measurement_unit
        foreign key (measurement_unit_code) references measurement_unit_definitions(code)
);

alter table tasks add column if not exists composition_mode varchar(16);

update tasks
set weight = 1
where weight is null and parent_task_id is not null;

alter table tasks
    alter column weight type integer using round(coalesce(weight, 1))::integer;

alter table tasks
    alter column weight set default 1;
