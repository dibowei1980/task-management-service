ALTER TABLE tasks ADD COLUMN status_workloads TEXT;
ALTER TABLE tasks ADD COLUMN in_progress_weight DOUBLE PRECISION DEFAULT 0.5;
ALTER TABLE tasks ADD COLUMN qa_department_id VARCHAR(64);
ALTER TABLE tasks ADD COLUMN qa_assignee_id UUID;

UPDATE tasks SET in_progress_weight = 0.5 WHERE in_progress_weight IS NULL;

UPDATE tasks SET status_workloads = (
    CASE
        WHEN category IN ('OPERATION_TASK', 'QA_TASK', 'SYSTEM_TASK') THEN
            CASE
                WHEN status = 'PENDING' THEN
                    '{"PENDING":' || COALESCE(workload, 0) || ',"ASSIGNED":0,"RECEIVED":0,"IN_PROGRESS":0,"SUBMITTED_FOR_QA":0,"QA_COMPLETED":0}'
                WHEN status = 'ASSIGNED' THEN
                    '{"PENDING":0,"ASSIGNED":' || COALESCE(workload, 0) || ',"RECEIVED":0,"IN_PROGRESS":0,"SUBMITTED_FOR_QA":0,"QA_COMPLETED":0}'
                WHEN status = 'RECEIVED' THEN
                    '{"PENDING":0,"ASSIGNED":0,"RECEIVED":' || COALESCE(workload, 0) || ',"IN_PROGRESS":0,"SUBMITTED_FOR_QA":0,"QA_COMPLETED":0}'
                WHEN status = 'IN_PROGRESS' THEN
                    '{"PENDING":0,"ASSIGNED":0,"RECEIVED":0,"IN_PROGRESS":' || COALESCE(workload, 0) || ',"SUBMITTED_FOR_QA":0,"QA_COMPLETED":0}'
                WHEN status = 'PAUSED' THEN
                    '{"PENDING":0,"ASSIGNED":0,"RECEIVED":0,"IN_PROGRESS":' || COALESCE(workload, 0) || ',"SUBMITTED_FOR_QA":0,"QA_COMPLETED":0}'
                WHEN status = 'COMPLETED' THEN
                    '{"PENDING":0,"ASSIGNED":0,"RECEIVED":0,"IN_PROGRESS":0,"SUBMITTED_FOR_QA":0,"QA_COMPLETED":' || COALESCE(workload, 0) || '}'
                WHEN status = 'FAILED' THEN
                    '{"PENDING":0,"ASSIGNED":0,"RECEIVED":0,"IN_PROGRESS":' || COALESCE(workload, 0) || ',"SUBMITTED_FOR_QA":0,"QA_COMPLETED":0}'
                ELSE
                    '{"PENDING":' || COALESCE(workload, 0) || ',"ASSIGNED":0,"RECEIVED":0,"IN_PROGRESS":0,"SUBMITTED_FOR_QA":0,"QA_COMPLETED":0}'
            END
        ELSE NULL
    END
);
