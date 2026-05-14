alter table tasks add column if not exists workload double precision;
alter table tasks add column if not exists workload_unit varchar(32);
alter table tasks add column if not exists weight double precision;
