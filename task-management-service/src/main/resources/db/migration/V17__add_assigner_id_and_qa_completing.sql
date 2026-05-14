ALTER TABLE tasks ADD COLUMN assigner_id UUID;
CREATE INDEX ix_tasks_assigner_id ON tasks (assigner_id);

UPDATE tasks SET status_workloads = (
    CASE
        WHEN status_workloads IS NOT NULL AND status_workloads NOT LIKE '%QA_COMPLETING%' THEN
            REPLACE(status_workloads, '"QA_COMPLETED"', '"QA_COMPLETING":0,"QA_COMPLETED"')
        ELSE status_workloads
    END
);

UPDATE tasks SET workflow_status = 'PENDING_ACCEPTANCE' WHERE status = 'PENDING_ACCEPTANCE' AND workflow_status IS NULL;
UPDATE tasks SET workflow_status = 'ACCEPTANCE_COMPLETED' WHERE status = 'ACCEPTANCE_COMPLETED' AND workflow_status IS NULL;
UPDATE tasks SET workflow_status = 'ARCHIVED' WHERE status = 'ARCHIVED' AND workflow_status IS NULL;

UPDATE tasks SET status = 'COMPLETED' WHERE status IN ('PENDING_ACCEPTANCE', 'ACCEPTANCE_COMPLETED', 'ARCHIVED');
