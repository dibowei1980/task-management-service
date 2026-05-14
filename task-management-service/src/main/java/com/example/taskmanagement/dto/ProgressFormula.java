package com.example.taskmanagement.dto;

import java.util.List;

public class ProgressFormula {

    private String formulaType;
    private String formulaExpression;
    private List<ContributionItem> contributions;
    private WeightDetail weightDetail;

    public static class WeightDetail {
        private double inProgressWeight;
        private double submittedForQaWeight;
        private double qaCompletingWeight;
        private double qaCompletedWeight;

        public double getInProgressWeight() { return inProgressWeight; }
        public void setInProgressWeight(double inProgressWeight) { this.inProgressWeight = inProgressWeight; }
        public double getSubmittedForQaWeight() { return submittedForQaWeight; }
        public void setSubmittedForQaWeight(double submittedForQaWeight) { this.submittedForQaWeight = submittedForQaWeight; }
        public double getQaCompletingWeight() { return qaCompletingWeight; }
        public void setQaCompletingWeight(double qaCompletingWeight) { this.qaCompletingWeight = qaCompletingWeight; }
        public double getQaCompletedWeight() { return qaCompletedWeight; }
        public void setQaCompletedWeight(double qaCompletedWeight) { this.qaCompletedWeight = qaCompletedWeight; }
    }

    public static class ContributionItem {
        private String taskId;
        private String taskName;
        private Integer progress;
        private Double weight;
        private Double workload;
        private String workloadUnit;
        private Double workloadBase;
        private Double contribution;

        public String getTaskId() { return taskId; }
        public void setTaskId(String taskId) { this.taskId = taskId; }
        public String getTaskName() { return taskName; }
        public void setTaskName(String taskName) { this.taskName = taskName; }
        public Integer getProgress() { return progress; }
        public void setProgress(Integer progress) { this.progress = progress; }
        public Double getWeight() { return weight; }
        public void setWeight(Double weight) { this.weight = weight; }
        public Double getWorkload() { return workload; }
        public void setWorkload(Double workload) { this.workload = workload; }
        public String getWorkloadUnit() { return workloadUnit; }
        public void setWorkloadUnit(String workloadUnit) { this.workloadUnit = workloadUnit; }
        public Double getWorkloadBase() { return workloadBase; }
        public void setWorkloadBase(Double workloadBase) { this.workloadBase = workloadBase; }
        public Double getContribution() { return contribution; }
        public void setContribution(Double contribution) { this.contribution = contribution; }
    }

    public String getFormulaType() { return formulaType; }
    public void setFormulaType(String formulaType) { this.formulaType = formulaType; }
    public String getFormulaExpression() { return formulaExpression; }
    public void setFormulaExpression(String formulaExpression) { this.formulaExpression = formulaExpression; }
    public List<ContributionItem> getContributions() { return contributions; }
    public void setContributions(List<ContributionItem> contributions) { this.contributions = contributions; }
    public WeightDetail getWeightDetail() { return weightDetail; }
    public void setWeightDetail(WeightDetail weightDetail) { this.weightDetail = weightDetail; }
}
