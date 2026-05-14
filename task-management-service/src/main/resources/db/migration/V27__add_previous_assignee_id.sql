ALTER TABLE tasks ADD COLUMN IF NOT EXISTS previous_assignee_id UUID;

CREATE INDEX IF NOT EXISTS ix_tasks_previous_assignee_id ON tasks(previous_assignee_id);
