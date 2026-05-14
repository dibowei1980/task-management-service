ALTER TABLE tasks ADD COLUMN source_task_id UUID;
ALTER TABLE tasks ADD COLUMN qa_batch_no INTEGER;
CREATE INDEX idx_tasks_source_task_id ON tasks(source_task_id);
