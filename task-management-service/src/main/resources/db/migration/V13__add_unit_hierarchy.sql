alter table measurement_unit_definitions add column if not exists base_unit_code varchar(32);
alter table measurement_unit_definitions add column if not exists conversion_factor double precision;

alter table measurement_unit_definitions
    add constraint fk_unit_base_unit
        foreign key (base_unit_code) references measurement_unit_definitions(code);

insert into measurement_unit_definitions (id, code, name, builtin, enabled, base_unit_code, conversion_factor, created_at, updated_at)
values
    ('11111111-1111-1111-1111-111111111110', 'UNIT_M',        '米',       true, true, null, null, now(), now()),
    ('11111111-1111-1111-1111-111111111112', 'UNIT_CUBIC_M',  '立方米',   true, true, null, null, now(), now()),
    ('11111111-1111-1111-1111-111111111113', 'UNIT_KG',       '千克',     true, true, null, null, now(), now()),
    ('11111111-1111-1111-1111-111111111114', 'UNIT_COUNT',    '计数',     true, true, null, null, now(), now())
on conflict (code) do nothing;

update measurement_unit_definitions set base_unit_code = 'UNIT_COUNT', conversion_factor = 1        where code = 'UNIT_GE';
update measurement_unit_definitions set base_unit_code = 'UNIT_COUNT', conversion_factor = 1        where code = 'UNIT_POINT';
update measurement_unit_definitions set base_unit_code = 'UNIT_COUNT', conversion_factor = 1        where code = 'UNIT_FU';
update measurement_unit_definitions set base_unit_code = 'UNIT_COUNT', conversion_factor = 1        where code = 'UNIT_ZHANG';
update measurement_unit_definitions set base_unit_code = 'UNIT_COUNT', conversion_factor = 1        where code = 'UNIT_BEN';
update measurement_unit_definitions set base_unit_code = 'UNIT_COUNT', conversion_factor = 1        where code = 'UNIT_PAGE';
update measurement_unit_definitions set base_unit_code = 'UNIT_M',     conversion_factor = 1000     where code = 'UNIT_KM';
update measurement_unit_definitions set base_unit_code = 'UNIT_SQ_M',  conversion_factor = 1000000  where code = 'UNIT_SQ_KM';
