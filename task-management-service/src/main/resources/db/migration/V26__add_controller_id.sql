alter table tasks add column if not exists controller_id uuid;

update tasks
set controller_id = created_by_id
where controller_id is null
  and created_by_id is not null;
