alter table tasks add column if not exists created_by_name varchar(128);
alter table tasks add column if not exists created_department_id varchar(64);
alter table tasks add column if not exists created_department_name varchar(255);

update tasks
set created_department_id = department_id
where created_department_id is null
  and department_id is not null;
