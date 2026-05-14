ALTER TABLE external_system_registrations ADD COLUMN sso_client_id VARCHAR(128);
ALTER TABLE external_system_registrations ADD COLUMN dashboard_url VARCHAR(512);

UPDATE external_system_registrations SET sso_client_id = 'default' WHERE sso_client_id IS NULL;

ALTER TABLE external_system_registrations ALTER COLUMN sso_client_id SET NOT NULL;

ALTER TABLE external_system_registrations DROP COLUMN IF EXISTS auth_type;
ALTER TABLE external_system_registrations DROP COLUMN IF EXISTS auth_token;
