package com.example.taskmanagement.model;

public final class WorkflowStages {

    public static final String PENDING = "PENDING";
    public static final String ASSIGNED = "ASSIGNED";
    public static final String RECEIVED = "RECEIVED";
    public static final String IN_PROGRESS = "IN_PROGRESS";
    public static final String SUBMITTED_FOR_QA = "SUBMITTED_FOR_QA";
    public static final String QA_COMPLETING = "QA_COMPLETING";
    public static final String QA_COMPLETED = "QA_COMPLETED";
    public static final String COMPLETED = "COMPLETED";
    public static final String PAUSED = "PAUSED";
    public static final String FAILED = "FAILED";

    private WorkflowStages() {}

    public static final String[] LEAF_WORKFLOW_STAGES = {
        PENDING, ASSIGNED, RECEIVED, IN_PROGRESS, SUBMITTED_FOR_QA, QA_COMPLETING, QA_COMPLETED
    };

    public static boolean isLeafStage(String stage) {
        if (stage == null) return false;
        for (String s : LEAF_WORKFLOW_STAGES) {
            if (s.equals(stage)) return true;
        }
        return false;
    }

    public static int leafStageIndex(String stage) {
        if (stage == null) return -1;
        for (int i = 0; i < LEAF_WORKFLOW_STAGES.length; i++) {
            if (LEAF_WORKFLOW_STAGES[i].equals(stage)) return i;
        }
        return -1;
    }

    public static final String[] PROJECT_WORKFLOW_STAGES = {
        PENDING, ASSIGNED, IN_PROGRESS, SUBMITTED_FOR_QA, QA_COMPLETING, QA_COMPLETED, COMPLETED
    };

    public static boolean isProjectStage(String stage) {
        if (stage == null) return false;
        for (String s : PROJECT_WORKFLOW_STAGES) {
            if (s.equals(stage)) return true;
        }
        return false;
    }

    public static boolean canTransitionTo(String from, String to) {
        if (to == null) return false;
        if (from == null) return true;
        int fromIdx = -1;
        int toIdx = -1;
        for (int i = 0; i < PROJECT_WORKFLOW_STAGES.length; i++) {
            if (PROJECT_WORKFLOW_STAGES[i].equals(from)) fromIdx = i;
            if (PROJECT_WORKFLOW_STAGES[i].equals(to)) toIdx = i;
        }
        if (toIdx < 0) return false;
        if (fromIdx < 0) return true;
        return toIdx >= fromIdx;
    }
}
