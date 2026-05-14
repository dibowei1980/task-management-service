UPDATE tasks SET department_id = 'DEFAULT_DEPT' WHERE department_id IS NULL;
ALTER TABLE tasks ALTER COLUMN department_id SET NOT NULL;
