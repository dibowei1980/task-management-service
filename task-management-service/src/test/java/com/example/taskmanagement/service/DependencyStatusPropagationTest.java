package com.example.taskmanagement.service;

import com.example.taskmanagement.model.Task;
import com.example.taskmanagement.model.TaskCategory;
import com.example.taskmanagement.model.TaskStatus;
import com.example.taskmanagement.repository.TaskDependencyRepository;
import com.example.taskmanagement.repository.TaskRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
public class DependencyStatusPropagationTest {

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private TaskDependencyRepository taskDependencyRepository;

    @Autowired
    private DependencyService dependencyService;

    private Task newUnitTask(String name, TaskStatus status, String workflowStatus) {
        Task t = new Task();
        t.setName(name);
        t.setType("OPERATION_TASK");
        t.setCategory(TaskCategory.OPERATION_TASK);
        t.setStatus(status);
        t.setPriority(1);
        t.setDepartmentId("TEST_DEPT");
        t.setInputParams("{\"workflowStatus\":\"" + workflowStatus + "\",\"workflow_status\":\"" + workflowStatus + "\"}");
        return taskRepository.save(t);
    }

    private String workflowStatusOf(Task t) {
        String input = t.getInputParams() == null ? "" : t.getInputParams();
        int idx = input.indexOf("\"workflowStatus\"");
        if (idx < 0) idx = input.indexOf("\"workflow_status\"");
        if (idx < 0) return null;
        return input;
    }

    @Test
    @Transactional
    void unlocksSuccessorWhenPredecessorSatisfied() {
        Task predecessor = newUnitTask("p1", TaskStatus.IN_PROGRESS, "IN_PROGRESS");
        Task successor = newUnitTask("s1", TaskStatus.PAUSED, "PAUSED");

        dependencyService.addDependency(predecessor.getId(), successor.getId());

        predecessor.setStatus(TaskStatus.COMPLETED);
        predecessor.setInputParams("{\"workflowStatus\":\"COMPLETED\",\"workflow_status\":\"COMPLETED\"}");
        taskRepository.save(predecessor);

        dependencyService.recomputeSuccessorStatuses(predecessor.getId());

        Task refreshed = taskRepository.findById(successor.getId()).orElseThrow();
        assertEquals(TaskStatus.PENDING, refreshed.getStatus());
        assertTrue(workflowStatusOf(refreshed).contains("PENDING"));
    }

    @Test
    @Transactional
    void locksSuccessorWhenPredecessorBecomesUnsatisfied() {
        Task predecessor = newUnitTask("p2", TaskStatus.COMPLETED, "COMPLETED");
        Task successor = newUnitTask("s2", TaskStatus.PENDING, "PENDING");

        dependencyService.addDependency(predecessor.getId(), successor.getId());

        predecessor.setStatus(TaskStatus.PAUSED);
        predecessor.setInputParams("{\"workflowStatus\":\"PAUSED\",\"workflow_status\":\"PAUSED\"}");
        taskRepository.save(predecessor);

        dependencyService.recomputeSuccessorStatuses(predecessor.getId());

        Task refreshed = taskRepository.findById(successor.getId()).orElseThrow();
        assertEquals(TaskStatus.PAUSED, refreshed.getStatus());
        assertTrue(workflowStatusOf(refreshed).contains("PAUSED"));
    }

    @Test
    @Transactional
    void recomputesAfterPredecessorDeleted() {
        Task predecessor = newUnitTask("p3", TaskStatus.PAUSED, "PAUSED");
        Task successor = newUnitTask("s3", TaskStatus.PAUSED, "PAUSED");

        dependencyService.addDependency(predecessor.getId(), successor.getId());

        dependencyService.clearDependencies(predecessor.getId());
        taskRepository.delete(predecessor);

        dependencyService.recomputeTaskStatusByDependencies(successor.getId());

        Task refreshed = taskRepository.findById(successor.getId()).orElseThrow();
        assertEquals(TaskStatus.PENDING, refreshed.getStatus());
        assertTrue(workflowStatusOf(refreshed).contains("PENDING"));
        assertEquals(0, taskDependencyRepository.findBySuccessorId(successor.getId()).size());
    }
}
