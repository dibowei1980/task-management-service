package com.example.taskmanagement.model;

public enum CallbackField {
    TASK_ID("任务ID", true),
    STATUS("任务状态", true),
    NAME("任务名称", true),
    OPERATOR("操作员", true),
    WORKLOAD("任务量", true),
    UNIT("任务计量单位", true),
    START_TIME("开始时间", false),
    END_TIME("完成时间", false),
    LOCATION("位置信息", false),
    REMARKS("备注信息", false);

    private final String label;
    private final boolean required;

    CallbackField(String label, boolean required) {
        this.label = label;
        this.required = required;
    }

    public String getLabel() { return label; }
    public boolean isRequired() { return required; }
}
