package com.example.taskmanagement.service.impl;

import com.example.taskmanagement.model.CompositionMode;
import com.example.taskmanagement.model.Task;
import com.example.taskmanagement.model.TaskCategory;
import com.example.taskmanagement.repository.TaskRepository;
import com.example.taskmanagement.service.ProjectTypeService;
import com.example.taskmanagement.service.TaskTypeService;
import com.example.taskmanagement.service.UnitConversionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Component
public class TaskValidationHelper {

    private static final Logger logger = LoggerFactory.getLogger(TaskValidationHelper.class);

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private ProjectTypeService projectTypeService;

    @Autowired
    private TaskTypeService taskTypeService;

    @Autowired
    private UnitConversionService unitConversionService;

    @Autowired
    private ProgressCalculationHelper progressCalculationHelper;

    @Value("${task.tree.max-depth:5}")
    private int maxTreeDepth;

    void validateTypeCodeByCategory(String code, TaskCategory category) {
        if (code == null || code.isBlank()) return;
        if (category == TaskCategory.PROJECT || category == TaskCategory.PHASE) {
            projectTypeService.validateTypeCodeUsable(code);
        } else {
            taskTypeService.validateTypeCodeUsable(code);
        }
    }

    void validateWorkload(Double workload) {
        if (workload != null && workload <= 0) {
            throw new IllegalArgumentException("工作量必须大于 0");
        }
    }

    void validateWeightRange(Double weight) {
        if (weight == null) {
            return;
        }
        if (weight < 0.01 || weight > 100) {
            throw new IllegalArgumentException("weight must be between 0.01 and 100");
        }
    }

    void validateParentChildTypeConstraint(UUID parentId, String newType, UUID excludeTaskId) {
        if (parentId == null || newType == null || newType.isBlank()) {
            return;
        }
        List<String> siblingTypes = taskRepository.findByParentTaskId(parentId).stream()
                .filter(item -> excludeTaskId == null || !item.getId().equals(excludeTaskId))
                .filter(item -> item.getCategory() != TaskCategory.SELF_CHECK_TASK)
                .map(Task::getType)
                .filter(type -> type != null && !type.isBlank())
                .collect(Collectors.toCollection(java.util.ArrayList::new));
        siblingTypes.add(newType);
        long uniqueCount = siblingTypes.stream().distinct().count();
        if (uniqueCount != 1 && uniqueCount != siblingTypes.size()) {
            throw new IllegalArgumentException("同一父级下的直接子任务类型必须要么全相同，要么全不同");
        }
    }

    void validateSameTypeAggregation(UUID parentId, String newType, UUID excludeTaskId) {
        if (parentId == null || newType == null || newType.isBlank()) {
            return;
        }
        Task parent = taskRepository.findById(parentId).orElse(null);
        if (parent == null) {
            return;
        }
        if (parent.getParentTaskId() != null) {
            List<Task> parentSiblings = taskRepository.findByParentTaskId(parent.getParentTaskId());
            for (Task parentSibling : parentSiblings) {
                if (parentSibling.getId().equals(parent.getId())) {
                    continue;
                }
                if (containsTypeInSubtree(parentSibling.getId(), newType, 0)) {
                    throw new IllegalArgumentException(
                        "同类型任务不允许分散在多个兄弟目录，类型 " + newType + " 已存在于兄弟节点「" + parentSibling.getName() + "」下");
                }
            }
        }
        List<Task> siblings = taskRepository.findByParentTaskId(parentId).stream()
                .filter(item -> item.getCategory() != TaskCategory.SELF_CHECK_TASK)
                .toList();
        CompositionMode mode = progressCalculationHelper.calculateCompositionMode(siblings);
        if (mode != CompositionMode.HETEROGENEOUS) {
            return;
        }
        for (Task sibling : siblings) {
            if (excludeTaskId != null && sibling.getId().equals(excludeTaskId)) {
                continue;
            }
            if (containsTypeInSubtree(sibling.getId(), newType, 0)) {
                throw new IllegalArgumentException(
                    "同类型任务不允许分散在多个兄弟目录，类型 " + newType + " 已存在于兄弟节点「" + sibling.getName() + "」下");
            }
        }
    }

    private boolean containsTypeInSubtree(UUID nodeId, String type, int depth) {
        if (depth > maxTreeDepth) return false;
        Task node = taskRepository.findById(nodeId).orElse(null);
        if (node == null) return false;
        if (node.getCategory() != TaskCategory.SELF_CHECK_TASK && type.equals(node.getType())) return true;
        List<Task> children = taskRepository.findByParentTaskId(nodeId);
        for (Task child : children) {
            if (containsTypeInSubtree(child.getId(), type, depth + 1)) {
                return true;
            }
        }
        return false;
    }

    void validateHomogeneousChildWorkloadRequired(UUID parentId, String candidateType, Double candidateWorkload) {
        if (parentId == null || candidateType == null || candidateType.isBlank()) {
            return;
        }
        Task parent = taskRepository.findById(parentId).orElse(null);
        if (parent == null) {
            return;
        }
        List<Task> siblings = taskRepository.findByParentTaskId(parentId).stream()
                .filter(item -> item.getCategory() != TaskCategory.SELF_CHECK_TASK)
                .toList();
        java.util.ArrayList<String> types = new java.util.ArrayList<>();
        for (Task sibling : siblings) {
            if (sibling.getType() != null && !sibling.getType().isBlank()) {
                types.add(sibling.getType());
            }
        }
        types.add(candidateType);
        long uniqueCount = types.stream().distinct().count();
        if (uniqueCount == 1 && candidateWorkload == null) {
            throw new IllegalArgumentException("同质任务的子任务必须填写工作量");
        }
    }

    void validateHomogeneousParentWorkload(UUID parentId, String candidateType, Double candidateWorkload, String candidateWorkloadUnit, UUID excludeTaskId) {
        if (parentId == null) {
            return;
        }
        Task parent = taskRepository.findById(parentId).orElse(null);
        if (parent == null || parent.getWorkload() == null) {
            return;
        }
        List<Task> siblings = taskRepository.findByParentTaskId(parentId).stream()
                .filter(item -> item.getCategory() != TaskCategory.SELF_CHECK_TASK)
                .toList();
        java.util.ArrayList<String> types = new java.util.ArrayList<>();
        double totalWorkloadBase = 0.0;
        boolean hasExistingSiblings = false;
        for (Task sibling : siblings) {
            if (excludeTaskId != null && sibling.getId().equals(excludeTaskId)) {
                continue;
            }
            if (sibling.getType() != null && !sibling.getType().isBlank()) {
                types.add(sibling.getType());
                hasExistingSiblings = true;
            }
            if (sibling.getWorkload() != null) {
                totalWorkloadBase += sibling.getWorkload() * unitConversionService.getConversionFactor(sibling.getWorkloadUnit());
            }
        }
        if (!hasExistingSiblings) {
            return;
        }
        if (candidateType != null && !candidateType.isBlank()) {
            types.add(candidateType);
        }
        if (candidateWorkload != null) {
            totalWorkloadBase += candidateWorkload * unitConversionService.getConversionFactor(candidateWorkloadUnit);
        }
        if (types.isEmpty()) {
            return;
        }
        long uniqueCount = types.stream().distinct().count();
        double parentWorkloadBase = parent.getWorkload() * unitConversionService.getConversionFactor(parent.getWorkloadUnit());
        if (uniqueCount == 1 && Math.abs(totalWorkloadBase - parentWorkloadBase) > 0.0001) {
            logger.warn("同质任务(id={})子任务工作量总和({})与父任务工作量({})不一致（已换算为基本单位）",
                    parentId, totalWorkloadBase, parentWorkloadBase);
        }
    }

    void validateParentWorkloadIfHomogeneous(Task task, Double nextWorkload) {
        List<Task> children = taskRepository.findByParentTaskId(task.getId()).stream()
                .filter(item -> item.getCategory() != TaskCategory.SELF_CHECK_TASK)
                .toList();
        if (children.isEmpty() || nextWorkload == null) {
            return;
        }
        CompositionMode mode = progressCalculationHelper.calculateCompositionMode(children);
        if (mode != CompositionMode.HOMOGENEOUS) {
            return;
        }
        boolean allChildWorkloadsPresent = children.stream().allMatch(child -> child.getWorkload() != null);
        double totalChildWorkloadBase = children.stream()
                .filter(child -> child.getWorkload() != null)
                .mapToDouble(child -> child.getWorkload() * unitConversionService.getConversionFactor(child.getWorkloadUnit()))
                .sum();
        double parentWorkloadBase = nextWorkload * unitConversionService.getConversionFactor(task.getWorkloadUnit());
        if (!allChildWorkloadsPresent || Math.abs(totalChildWorkloadBase - parentWorkloadBase) > 0.0001) {
            logger.warn("同质任务(id={})父任务工作量({})与子任务工作量总和({})不一致（已换算为基本单位）",
                    task.getId(), parentWorkloadBase, totalChildWorkloadBase);
        }
    }

    String resolveWorkloadUnit(String typeCode, String explicitWorkloadUnit, TaskCategory category) {
        if (explicitWorkloadUnit != null && !explicitWorkloadUnit.isBlank()) {
            return explicitWorkloadUnit;
        }
        return null;
    }

    double defaultWeight(Double weight) {
        return weight == null ? 1.0 : weight;
    }
}
