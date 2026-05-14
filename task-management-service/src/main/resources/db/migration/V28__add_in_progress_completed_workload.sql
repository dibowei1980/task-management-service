ALTER TABLE tasks ADD COLUMN IF NOT EXISTS in_progress_completed_workload DOUBLE PRECISION DEFAULT 0;

ALTER TABLE tasks ALTER COLUMN in_progress_completed_workload SET DEFAULT 0;

UPDATE tasks SET in_progress_completed_workload = 0 WHERE in_progress_completed_workload IS NULL;