package com.example.taskmanagement.service.impl;

import com.example.taskmanagement.dto.ProgressFormula;
import com.example.taskmanagement.model.CompositionMode;
import com.example.taskmanagement.model.Task;
import com.example.taskmanagement.model.TaskCategory;
import com.example.taskmanagement.model.TaskStatus;
import com.example.taskmanagement.model.WorkflowStages;
import com.example.taskmanagement.model.WorkflowStatus;
import com.example.taskmanagement.repository.TaskRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Component
public class ProgressCalculationHelper {

    private static final Logger logger = LoggerFactory.getLogger(ProgressCalculationHelper.class);

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private StatusWorkloadHelper statusWorkloadHelper;

    @Autowired
    private com.example.taskmanagement.service.UnitConversionService unitConversionService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${task.tree.max-depth:5}")
    private int maxTreeDepth;

    int calculateLeafProgress(Task task, Map<String, Double> statusWorkloads) {
        double totalWorkload = task.getWorkload() != null ? task.getWorkload() : 0.0;
        if (totalWorkload <= 0) return 0;

        double inProgressWeight = task.getInProgressWeight() != null ? task.getInProgressWeight() : 0.95;
        double inProgressCompletedWorkload = task.getInProgressCompletedWorkload() != null ? task.getInProgressCompletedWorkload() : 0.0;

        double completedWorkload = statusWorkloads.getOrDefault(WorkflowStages.QA_COMPLETED, 0.0);
        double qaCompletingWorkload = statusWorkloads.getOrDefault(WorkflowStages.QA_COMPLETING, 0.0);
        double submittedWorkload = statusWorkloads.getOrDefault(WorkflowStages.SUBMITTED_FOR_QA, 0.0);

        double effectiveCompleted = completedWorkload
                + qaCompletingWorkload * 0.95
                + submittedWorkload * 0.95
                + inProgressCompletedWorkload * inProgressWeight;

        int progress = (int) Math.round(effectiveCompleted / totalWorkload * 100);
        return Math.max(0, Math.min(100, progress));
    }

    ProgressFormula buildProgressFormula(Task task) {
        boolean isLeaf = !taskRepository.existsByParentTaskId(task.getId());
        if (isLeaf) {
            return buildLeafProgressFormula(task);
        } else {
            return buildNonLeafProgressFormula(task);
        }
    }

    private ProgressFormula buildLeafProgressFormula(Task task) {
        ProgressFormula formula = new ProgressFormula();
        formula.setFormulaType("LEAF_WEIGHTED");

        Map<String, Double> sw = statusWorkloadHelper.parseStatusWorkloads(task.getStatusWorkloads());
        double totalWorkload = task.getWorkload() != null ? task.getWorkload() : 0.0;
        double wIp = task.getInProgressWeight() != null ? task.getInProgressWeight() : 0.95;
        double ipCompleted = task.getInProgressCompletedWorkload() != null ? task.getInProgressCompletedWorkload() : 0.0;

        ProgressFormula.WeightDetail wd = new ProgressFormula.WeightDetail();
        wd.setInProgressWeight(wIp);
        wd.setSubmittedForQaWeight(0.95);
        wd.setQaCompletingWeight(0.95);
        wd.setQaCompletedWeight(1.0);
        formula.setWeightDetail(wd);

        if (sw == null || totalWorkload <= 0) {
            formula.setFormulaExpression("progress = 0 (no workload data)");
            return formula;
        }

        double inProgressVal = sw.getOrDefault(WorkflowStages.IN_PROGRESS, 0.0);
        double submittedVal = sw.getOrDefault(WorkflowStages.SUBMITTED_FOR_QA, 0.0);
        double qaCompletingVal = sw.getOrDefault(WorkflowStages.QA_COMPLETING, 0.0);
        double qaCompletedVal = sw.getOrDefault(WorkflowStages.QA_COMPLETED, 0.0);

        double effectiveCompleted = qaCompletedVal
                + qaCompletingVal * 0.95
                + submittedVal * 0.95
                + ipCompleted * wIp;

        StringBuilder expr = new StringBuilder();
        expr.append("progress = (");
        expr.append(String.format("%.1f×0.95", submittedVal));
        expr.append(String.format(" + %.1f×0.95", qaCompletingVal));
        expr.append(String.format(" + %.1f×1.0", qaCompletedVal));
        if (ipCompleted > 0.001) {
            expr.append(String.format(" + %.1f×%.2f", ipCompleted, wIp));
        }
        expr.append(String.format(") / %.1f = %d%%", totalWorkload, task.getProgress() != null ? task.getProgress() : 0));

        formula.setFormulaExpression(expr.toString());

        List<ProgressFormula.ContributionItem> contributions = new java.util.ArrayList<>();
        addContribution(contributions, "IN_PROGRESS_COMPLETED", ipCompleted, ipCompleted * wIp);
        addContribution(contributions, "IN_PROGRESS", inProgressVal - ipCompleted, 0.0);
        addContribution(contributions, "SUBMITTED_FOR_QA", submittedVal, submittedVal * 0.95);
        addContribution(contributions, "QA_COMPLETING", qaCompletingVal, qaCompletingVal * 0.95);
        addContribution(contributions, "QA_COMPLETED", qaCompletedVal, qaCompletedVal * 1.0);
        formula.setContributions(contributions);

        return formula;
    }

    private void addContribution(List<ProgressFormula.ContributionItem> list, String stage, double workload, double contribution) {
        if (workload < 0.001 && contribution < 0.001) return;
        ProgressFormula.ContributionItem item = new ProgressFormula.ContributionItem();
        item.setTaskName(stage);
        item.setWorkload(workload);
        item.setContribution(contribution);
        list.add(item);
    }

    private ProgressFormula buildNonLeafProgressFormula(Task task) {
        ProgressFormula formula = new ProgressFormula();
        List<Task> children = taskRepository.findByParentTaskId(task.getId()).stream()
                .filter(item -> item.getCategory() != TaskCategory.SELF_CHECK_TASK)
                .toList();

        CompositionMode mode = task.getCompositionMode();
        if (mode == null) {
            mode = calculateCompositionMode(children);
        }

        if (mode == CompositionMode.HOMOGENEOUS) {
            formula.setFormulaType("HOMOGENEOUS");
            formula.setFormulaExpression("progress = Σ(child_progress × child_weight × child_workload_base) / Σ(child_weight × child_workload_base)");
        } else {
            formula.setFormulaType("HETEROGENEOUS");
            formula.setFormulaExpression("progress = Σ(child_progress × child_weight) / Σ(child_weight)");
        }

        List<ProgressFormula.ContributionItem> contributions = new java.util.ArrayList<>();
        double totalWeight = 0.0;
        for (Task child : children) {
            double weight = child.getWeight() != null ? child.getWeight() : 1.0;
            double workload = child.getWorkload() != null ? child.getWorkload() : 0.0;
            double workloadBase = workload;
            if (mode == CompositionMode.HOMOGENEOUS) {
                workloadBase = workload * unitConversionService.getConversionFactor(child.getWorkloadUnit());
            }
            double factor = (mode == CompositionMode.HOMOGENEOUS) ? weight * workloadBase : weight;
            totalWeight += factor;

            ProgressFormula.ContributionItem item = new ProgressFormula.ContributionItem();
            item.setTaskId(child.getId() != null ? child.getId().toString() : null);
            item.setTaskName(child.getName());
            item.setProgress(child.getProgress());
            item.setWeight(weight);
            item.setWorkload(workload);
            item.setWorkloadUnit(child.getWorkloadUnit());
            if (mode == CompositionMode.HOMOGENEOUS) {
                item.setWorkloadBase(workloadBase);
            }
            item.setContribution(factor);
            contributions.add(item);
        }
        formula.setContributions(contributions);

        return formula;
    }

    void recalculateAncestorProgressAndStatus(UUID taskId) {
        recalculateAncestorProgressAndStatus(taskId, 0);
    }

    private void recalculateAncestorProgressAndStatus(UUID taskId, int depth) {
        if (taskId == null || depth > maxTreeDepth) return;
        Task task = taskRepository.findById(taskId).orElse(null);
        if (task == null) return;

        List<Task> children = taskRepository.findByParentTaskId(taskId).stream()
                .filter(item -> item.getCategory() != TaskCategory.SELF_CHECK_TASK)
                .toList();
        if (children.isEmpty()) return;

        CompositionMode compositionMode = calculateCompositionMode(children);
        double weightedProgress = 0.0;
        double totalWeight = 0.0;
        double totalWorkloadBase = 0.0;
        boolean allChildWorkloadsPresent = children.stream().allMatch(child -> child.getWorkload() != null);
        if (compositionMode == CompositionMode.HOMOGENEOUS && !allChildWorkloadsPresent) {
            logger.warn("同质任务(id={})存在子任务缺少工作量，进度计算将降级为权重加权平均", taskId);
        }
        for (Task child : children) {
            double weight = child.getWeight() != null ? child.getWeight() : 1.0;
            double workload = child.getWorkload() != null ? child.getWorkload() : 0.0;
            double factor = weight;
            if (compositionMode == CompositionMode.HOMOGENEOUS && allChildWorkloadsPresent) {
                double workloadBase = workload * unitConversionService.getConversionFactor(child.getWorkloadUnit());
                factor = weight * workloadBase;
                totalWorkloadBase += workloadBase;
            }
            totalWeight += factor;
            weightedProgress += (child.getProgress() != null ? child.getProgress() : 0) * factor;
        }

        int newProgress = totalWeight > 0 ? (int) Math.round(weightedProgress / totalWeight) : 0;
        newProgress = Math.max(0, Math.min(100, newProgress));

        TaskStatus derivedStatus = deriveNonLeafStatus(children, task);

        boolean changed = false;
        if (task.getProgress() == null || task.getProgress() != newProgress) {
            task.setProgress(newProgress);
            changed = true;
        }
        if (derivedStatus == null && task.getStatus() != null) {
            task.setStatus(null);
            changed = true;
        } else if (derivedStatus != null && derivedStatus != task.getStatus()) {
            if (task.getCategory() == TaskCategory.PROJECT && isRootProject(task)) {
                if (canTransitionRootProjectStatus(task.getStatus(), derivedStatus)) {
                    task.setStatus(derivedStatus);
                    changed = true;
                }
            } else if (task.getCategory() != TaskCategory.PROJECT || !isRootProject(task)) {
                task.setStatus(derivedStatus);
                changed = true;
            }
        }
        if (task.getCompositionMode() != compositionMode) {
            task.setCompositionMode(compositionMode);
            changed = true;
        }
        if (compositionMode == CompositionMode.HOMOGENEOUS && task.getWorkload() == null && allChildWorkloadsPresent) {
            double parentWorkloadBase = totalWorkloadBase / unitConversionService.getConversionFactor(task.getWorkloadUnit());
            task.setWorkload(parentWorkloadBase);
            changed = true;
        }

        Map<String, Double> aggregatedSw = aggregateChildStatusWorkloads(children, compositionMode, task.getWorkload());
        if (aggregatedSw != null && !aggregatedSw.isEmpty()) {
            try {
                String swJson = objectMapper.writeValueAsString(aggregatedSw);
                if (!swJson.equals(task.getStatusWorkloads())) {
                    task.setStatusWorkloads(swJson);
                    changed = true;
                }
            } catch (Exception e) {
                logger.warn("聚合 statusWorkloads 序列化失败, taskId={}", taskId, e);
            }
        }

        double aggregatedIpCompleted = children.stream()
                .mapToDouble(c -> c.getInProgressCompletedWorkload() != null ? c.getInProgressCompletedWorkload() : 0.0)
                .sum();
        Double currentIpCompleted = task.getInProgressCompletedWorkload();
        if (Math.abs(aggregatedIpCompleted - (currentIpCompleted != null ? currentIpCompleted : 0.0)) > 0.001) {
            task.setInProgressCompletedWorkload(aggregatedIpCompleted);
            changed = true;
        }

        if (changed) {
            taskRepository.save(task);
        }

        if (task.getParentTaskId() != null) {
            recalculateAncestorProgressAndStatus(task.getParentTaskId(), depth + 1);
        }
    }

    private Map<String, Double> aggregateChildStatusWorkloads(List<Task> children, CompositionMode compositionMode, Double parentWorkload) {
        Map<String, Double> aggregated = new java.util.LinkedHashMap<>();
        String[] stages = {
            WorkflowStages.PENDING, WorkflowStages.ASSIGNED, WorkflowStages.RECEIVED,
            WorkflowStages.IN_PROGRESS, WorkflowStages.SUBMITTED_FOR_QA,
            WorkflowStages.QA_COMPLETING, WorkflowStages.QA_COMPLETED
        };
        for (String stage : stages) {
            aggregated.put(stage, 0.0);
        }

        if (compositionMode == CompositionMode.HETEROGENEOUS && parentWorkload != null && parentWorkload > 0 && !children.isEmpty()) {
            double pw = parentWorkload;
            int count = children.size();
            for (Task child : children) {
                double childWorkload = child.getWorkload() != null ? child.getWorkload() : 0.0;
                if (childWorkload <= 0) continue;
                Map<String, Double> childSw = statusWorkloadHelper.parseStatusWorkloads(child.getStatusWorkloads());
                if (childSw != null) {
                    for (Map.Entry<String, Double> entry : childSw.entrySet()) {
                        double proportion = entry.getValue() / childWorkload;
                        aggregated.merge(entry.getKey(), proportion * (pw / count), Double::sum);
                    }
                } else {
                    String statusKey = child.getStatus() != null ? child.getStatus().name() : WorkflowStages.PENDING;
                    aggregated.merge(statusKey, pw / count, Double::sum);
                }
            }
        } else {
            for (Task child : children) {
                Map<String, Double> childSw = statusWorkloadHelper.parseStatusWorkloads(child.getStatusWorkloads());
                if (childSw != null) {
                    for (Map.Entry<String, Double> entry : childSw.entrySet()) {
                        aggregated.merge(entry.getKey(), entry.getValue(), Double::sum);
                    }
                } else {
                    double wl = child.getWorkload() != null ? child.getWorkload() : 0.0;
                    String statusKey = child.getStatus() != null ? child.getStatus().name() : WorkflowStages.PENDING;
                    aggregated.merge(statusKey, wl, Double::sum);
                }
            }
        }

        aggregated.entrySet().removeIf(e -> e.getValue() < 0.001);
        return aggregated;
    }

    private TaskStatus deriveNonLeafStatus(List<Task> children, Task parent) {
        if (children == null || children.isEmpty()) return TaskStatus.PENDING;

        Set<TaskStatus> distinctStatuses = new HashSet<>();
        for (Task child : children) {
            TaskStatus s = child.getStatus();
            if (s != null) distinctStatuses.add(s);
        }

        if (distinctStatuses.size() == 1) {
            return distinctStatuses.iterator().next();
        }

        if (distinctStatuses.isEmpty()) {
            return TaskStatus.PENDING;
        }

        return null;
    }

    private boolean isRootProject(Task task) {
        if (task.getCategory() != TaskCategory.PROJECT) return false;
        return task.getParentTaskId() == null;
    }

    private boolean canTransitionRootProjectStatus(TaskStatus from, TaskStatus to) {
        if (from == to) return true;
        if (from == null) return true;
        int fromIdx = rootProjectStatusIndex(from);
        int toIdx = rootProjectStatusIndex(to);
        if (fromIdx < 0 || toIdx < 0) return true;
        return toIdx >= fromIdx;
    }

    private int rootProjectStatusIndex(TaskStatus status) {
        TaskStatus[] order = {
            TaskStatus.PENDING, TaskStatus.ASSIGNED, TaskStatus.RECEIVED,
            TaskStatus.IN_PROGRESS, TaskStatus.SUBMITTED_FOR_QA, TaskStatus.QA_COMPLETING,
            TaskStatus.QA_COMPLETED, TaskStatus.COMPLETED
        };
        for (int i = 0; i < order.length; i++) {
            if (order[i] == status) return i;
        }
        return -1;
    }

    void checkRootProjectAutoTransition(Task changedTask) {
        UUID projectId = changedTask.getProjectId();
        if (projectId == null) {
            if (changedTask.getCategory() == TaskCategory.PROJECT && isRootProject(changedTask)) {
                projectId = changedTask.getId();
            } else {
                return;
            }
        }
        Task rootProject = taskRepository.findById(projectId).orElse(null);
        if (rootProject == null || !isRootProject(rootProject)) return;

        List<Task> allLeaves = findAllLeafTasks(rootProject.getId());
        if (allLeaves.isEmpty()) return;

        long totalLeaves = allLeaves.size();
        long qaCompletedLeaves = allLeaves.stream()
                .filter(t -> t.getStatus() == TaskStatus.COMPLETED || statusWorkloadHelper.deriveLeafTaskStatus(statusWorkloadHelper.parseStatusWorkloads(t.getStatusWorkloads())) == TaskStatus.COMPLETED)
                .count();

        if (qaCompletedLeaves == totalLeaves && rootProject.getStatus() != TaskStatus.QA_COMPLETED) {
            rootProject.setStatus(TaskStatus.QA_COMPLETED);
            rootProject.setWorkflowStatus(WorkflowStatus.PENDING_ACCEPTANCE);
            taskRepository.save(rootProject);
            logger.info("根项目 {} 所有叶子节点质检完成，自动流转至待验收", rootProject.getId());
        }
    }

    private List<Task> findAllLeafTasks(UUID rootId) {
        List<Task> result = new java.util.ArrayList<>();
        collectLeafTasks(rootId, result, 0);
        return result;
    }

    private void collectLeafTasks(UUID parentId, List<Task> result, int depth) {
        if (depth > maxTreeDepth) return;
        List<Task> children = taskRepository.findByParentTaskId(parentId).stream()
                .filter(c -> c.getCategory() != TaskCategory.SELF_CHECK_TASK)
                .toList();
        if (children.isEmpty()) {
            Task parent = taskRepository.findById(parentId).orElse(null);
            if (parent != null && statusWorkloadHelper.isLeafTask(parent)) {
                result.add(parent);
            }
            return;
        }
        for (Task child : children) {
            if (statusWorkloadHelper.isLeafTask(child)) {
                result.add(child);
            } else {
                collectLeafTasks(child.getId(), result, depth + 1);
            }
        }
    }

    int calculateTaskDepth(UUID taskId) {
        int depth = 0;
        UUID currentId = taskId;
        while (currentId != null) {
            Task task = taskRepository.findById(currentId).orElse(null);
            if (task == null) break;
            currentId = task.getParentTaskId();
            if (currentId != null) {
                depth++;
            }
        }
        return depth;
    }

    CompositionMode calculateCompositionMode(List<Task> children) {
        if (children == null || children.isEmpty()) {
            return null;
        }
        List<Task> filtered = children.stream()
                .filter(c -> c.getCategory() != TaskCategory.SELF_CHECK_TASK)
                .toList();
        if (filtered.isEmpty()) {
            return null;
        }

        long uniqueCategories = filtered.stream()
                .map(Task::getCategory)
                .distinct()
                .count();
        if (uniqueCategories > 1) {
            return CompositionMode.HETEROGENEOUS;
        }

        long uniqueTypes = filtered.stream()
                .map(Task::getType)
                .filter(t -> t != null && !t.isBlank())
                .distinct()
                .count();
        if (uniqueTypes > 1) {
            return CompositionMode.HETEROGENEOUS;
        }

        List<String> childBaseUnits = filtered.stream()
                .map(Task::getWorkloadUnit)
                .filter(unit -> unit != null && !unit.isBlank())
                .map(unitConversionService::resolveBaseUnit)
                .filter(base -> base != null)
                .toList();
        if (childBaseUnits.isEmpty()) {
            return null;
        }
        long uniqueBaseUnits = childBaseUnits.stream().distinct().count();
        if (uniqueBaseUnits > 1) {
            return CompositionMode.HETEROGENEOUS;
        }

        return CompositionMode.HOMOGENEOUS;
    }

    void updateParentCompositionMode(UUID parentTaskId) {
        Task parent = taskRepository.findById(parentTaskId).orElse(null);
        if (parent == null) {
            return;
        }
        List<Task> children = taskRepository.findByParentTaskId(parentTaskId).stream()
                .filter(item -> item.getCategory() != TaskCategory.SELF_CHECK_TASK)
                .toList();
        CompositionMode mode = calculateCompositionMode(children);
        if (parent.getCompositionMode() != mode) {
            parent.setCompositionMode(mode);
            taskRepository.save(parent);
        }
    }
}
