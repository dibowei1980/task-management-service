UPDATE tasks SET in_progress_weight = 0.95 WHERE in_progress_weight = 0.5 OR in_progress_weight IS NULL;

ALTER TABLE tasks ALTER COLUMN in_progress_weight SET DEFAULT 0.95;
