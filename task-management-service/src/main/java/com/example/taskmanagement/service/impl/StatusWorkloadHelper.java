package com.example.taskmanagement.service.impl;

import com.example.taskmanagement.model.Task;
import com.example.taskmanagement.model.TaskCategory;
import com.example.taskmanagement.model.TaskStatus;
import com.example.taskmanagement.model.WorkflowStages;
import com.example.taskmanagement.repository.TaskRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class StatusWorkloadHelper {

    @Autowired
    private TaskRepository taskRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    Map<String, Double> parseStatusWorkloads(String json) {
        if (json == null || json.isBlank()) {
            return emptyStatusWorkloads();
        }
        try {
            Map<String, Object> raw = objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
            Map<String, Double> result = new LinkedHashMap<>();
            for (String stage : WorkflowStages.LEAF_WORKFLOW_STAGES) {
                Object val = raw.get(stage);
                result.put(stage, val != null ? ((Number) val).doubleValue() : 0.0);
            }
            return result;
        } catch (Exception e) {
            return emptyStatusWorkloads();
        }
    }

    Map<String, Double> emptyStatusWorkloads() {
        Map<String, Double> result = new LinkedHashMap<>();
        for (String stage : WorkflowStages.LEAF_WORKFLOW_STAGES) {
            result.put(stage, 0.0);
        }
        return result;
    }

    void ensureStatusWorkloads(Task task) {
        if (task.getWorkload() == null || task.getWorkload() <= 0) return;
        if (task.getStatusWorkloads() != null && !task.getStatusWorkloads().isBlank()) return;
        Map<String, Double> sw = parseStatusWorkloads(task.getStatusWorkloads());
        double swTotal = sw.values().stream().mapToDouble(Double::doubleValue).sum();
        if (swTotal >= 0.001) return;
        sw = emptyStatusWorkloads();
        String stage = mapTaskStatusToWorkflowStage(task.getStatus());
        if (stage != null) {
            sw.put(stage, task.getWorkload());
        } else {
            sw.put(WorkflowStages.PENDING, task.getWorkload());
        }
        task.setStatusWorkloads(serializeStatusWorkloads(sw));
    }

    String serializeStatusWorkloads(Map<String, Double> sw) {
        try {
            return objectMapper.writeValueAsString(sw);
        } catch (Exception e) {
            return "{}";
        }
    }

    Map<String, Double> applyWaterfallFlow(Map<String, Double> current, Map<String, Double> newValues, double totalWorkload) {
        Map<String, Double> result = new LinkedHashMap<>(current);

        for (Map.Entry<String, Double> entry : newValues.entrySet()) {
            String targetStage = entry.getKey();
            Double newValue = entry.getValue();
            if (newValue == null) newValue = 0.0;

            double oldValue = result.getOrDefault(targetStage, 0.0);
            double delta = newValue - oldValue;

            if (Math.abs(delta) < 0.0001) continue;

            if (delta > 0) {
                double remaining = delta;
                int targetIdx = getLeafStageIndex(targetStage);
                if (targetIdx < 0) {
                    throw new IllegalArgumentException("未知状态工作量阶段: " + targetStage);
                }
                for (int i = targetIdx - 1; i >= 0 && remaining > 0.0001; i--) {
                    String upstreamStage = WorkflowStages.LEAF_WORKFLOW_STAGES[i];
                    double upstreamVal = result.getOrDefault(upstreamStage, 0.0);
                    double deduct = Math.min(upstreamVal, remaining);
                    result.put(upstreamStage, upstreamVal - deduct);
                    remaining -= deduct;
                }
                if (remaining > 0.001) {
                    throw new IllegalArgumentException("上游状态工作量不足，无法向 " + targetStage + " 流入 " + delta + "（缺口 " + remaining + "）");
                }
                result.put(targetStage, newValue);
            } else {
                result.put(targetStage, newValue);
            }
        }

        double sum = result.values().stream().mapToDouble(Double::doubleValue).sum();
        if (Math.abs(sum - totalWorkload) > 0.01) {
            double diff = totalWorkload - sum;
            result.put(WorkflowStages.PENDING, result.getOrDefault(WorkflowStages.PENDING, 0.0) + diff);
        }

        for (Map.Entry<String, Double> e : result.entrySet()) {
            if (e.getValue() < -0.001) {
                throw new IllegalArgumentException("状态 " + e.getKey() + " 工作量为负数(" + e.getValue() + ")，不合法");
            }
            if (e.getValue() < 0) {
                e.setValue(0.0);
            }
        }

        return result;
    }

    int getLeafStageIndex(String stage) {
        for (int i = 0; i < WorkflowStages.LEAF_WORKFLOW_STAGES.length; i++) {
            if (WorkflowStages.LEAF_WORKFLOW_STAGES[i].equals(stage)) return i;
        }
        return -1;
    }

    TaskStatus deriveLeafTaskStatus(Map<String, Double> statusWorkloads) {
        String lastNonZeroStage = null;
        for (String stage : WorkflowStages.LEAF_WORKFLOW_STAGES) {
            double val = statusWorkloads.getOrDefault(stage, 0.0);
            if (val > 0.001) {
                lastNonZeroStage = stage;
            }
        }
        if (lastNonZeroStage == null) return TaskStatus.PENDING;

        return switch (lastNonZeroStage) {
            case WorkflowStages.PENDING -> TaskStatus.PENDING;
            case WorkflowStages.ASSIGNED -> TaskStatus.ASSIGNED;
            case WorkflowStages.RECEIVED -> TaskStatus.RECEIVED;
            case WorkflowStages.IN_PROGRESS -> TaskStatus.IN_PROGRESS;
            case WorkflowStages.SUBMITTED_FOR_QA -> TaskStatus.SUBMITTED_FOR_QA;
            case WorkflowStages.QA_COMPLETING -> TaskStatus.QA_COMPLETING;
            case WorkflowStages.QA_COMPLETED -> TaskStatus.COMPLETED;
            default -> null;
        };
    }

    boolean isLeafTask(Task task) {
        if (task.getCategory() == TaskCategory.SELF_CHECK_TASK) return true;
        if (task.getCategory() == TaskCategory.OPERATION_TASK) return true;
        if (task.getCategory() == TaskCategory.SYSTEM_TASK) {
            List<Task> children = taskRepository.findByParentTaskId(task.getId()).stream()
                    .filter(c -> c.getCategory() != TaskCategory.SELF_CHECK_TASK)
                    .toList();
            return children.isEmpty();
        }
        if (task.getCategory() == TaskCategory.PROJECT || task.getCategory() == TaskCategory.PHASE) {
            List<Task> children = taskRepository.findByParentTaskId(task.getId()).stream()
                    .filter(c -> c.getCategory() != TaskCategory.SELF_CHECK_TASK)
                    .toList();
            return children.isEmpty();
        }
        return false;
    }

    void handleFailedWorkloadRollback(Task task) {
        if (task.getStatusWorkloads() == null || task.getWorkload() == null || task.getWorkload() <= 0) return;

        Map<String, Double> sw = parseStatusWorkloads(task.getStatusWorkloads());

        double rollbackAmount = 0.0;
        rollbackAmount += sw.getOrDefault(WorkflowStages.QA_COMPLETED, 0.0);
        rollbackAmount += sw.getOrDefault(WorkflowStages.QA_COMPLETING, 0.0);
        rollbackAmount += sw.getOrDefault(WorkflowStages.SUBMITTED_FOR_QA, 0.0);

        if (rollbackAmount > 0.001) {
            sw.put(WorkflowStages.QA_COMPLETED, 0.0);
            sw.put(WorkflowStages.QA_COMPLETING, 0.0);
            sw.put(WorkflowStages.SUBMITTED_FOR_QA, 0.0);
            sw.put(WorkflowStages.IN_PROGRESS, sw.getOrDefault(WorkflowStages.IN_PROGRESS, 0.0) + rollbackAmount);
        }

        task.setStatusWorkloads(serializeStatusWorkloads(sw));
    }

    void autoTransferWorkloadOnStatusChange(Task task, TaskStatus oldStatus, TaskStatus newStatus) {
        if (!isLeafTask(task)) return;
        if (task.getWorkload() == null || task.getWorkload() <= 0) return;

        if (task.getStatusWorkloads() == null || task.getStatusWorkloads().isBlank()) {
            ensureStatusWorkloads(task);
        }

        Map<String, Double> sw = parseStatusWorkloads(task.getStatusWorkloads());
        double totalWorkload = task.getWorkload();

        String fromStage = mapTaskStatusToWorkflowStage(oldStatus);
        String toStage = mapTaskStatusToWorkflowStage(newStatus);

        if (fromStage == null || toStage == null) return;
        if (fromStage.equals(toStage)) return;

        int fromIdx = getLeafStageIndex(fromStage);
        int toIdx = getLeafStageIndex(toStage);
        if (fromIdx < 0 || toIdx < 0) return;
        if (toIdx <= fromIdx) return;

        double transferAmount = sw.getOrDefault(fromStage, 0.0);
        if (transferAmount <= 0.001) {
            transferAmount = totalWorkload;
        }

        sw.put(fromStage, sw.getOrDefault(fromStage, 0.0) - transferAmount);
        sw.put(toStage, sw.getOrDefault(toStage, 0.0) + transferAmount);

        for (Map.Entry<String, Double> e : sw.entrySet()) {
            if (e.getValue() < 0) e.setValue(0.0);
        }

        task.setStatusWorkloads(serializeStatusWorkloads(sw));
    }

    String mapTaskStatusToWorkflowStage(TaskStatus status) {
        if (status == null) return null;
        return switch (status) {
            case PENDING -> WorkflowStages.PENDING;
            case ASSIGNED -> WorkflowStages.ASSIGNED;
            case RECEIVED -> WorkflowStages.RECEIVED;
            case IN_PROGRESS -> WorkflowStages.IN_PROGRESS;
            case SUBMITTED_FOR_QA -> WorkflowStages.SUBMITTED_FOR_QA;
            case QA_COMPLETING -> WorkflowStages.QA_COMPLETING;
            case QA_COMPLETED -> WorkflowStages.QA_COMPLETED;
            case COMPLETED -> WorkflowStages.QA_COMPLETED;
            case PAUSED, FAILED -> null;
        };
    }
}
