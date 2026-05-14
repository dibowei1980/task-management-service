package com.example.taskmanagement.service;

import com.example.taskmanagement.model.Task;
import com.example.taskmanagement.model.TaskCategory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class TaskExecutorRegistry {

    private static final Logger logger = LoggerFactory.getLogger(TaskExecutorRegistry.class);

    private final List<TaskExecutor> executors;

    public TaskExecutorRegistry(List<TaskExecutor> executors) {
        this.executors = executors;
        logger.info("Registered TaskExecutors: {}", executors.stream()
                .map(e -> e.getClass().getSimpleName())
                .collect(Collectors.joining(", ")));
    }

    public Optional<TaskExecutor> findExecutor(String type) {
        return executors.stream().filter(e -> e.supports(type)).findFirst();
    }

    public Optional<TaskExecutor> findExecutor(Task task) {
        if (task.getType() == null) return Optional.empty();
        return findExecutor(task.getType());
    }

    public String resolveDefaultType(TaskCategory category) {
        for (TaskExecutor executor : executors) {
            String type = executor.getDefaultType(category);
            if (type != null) return type;
        }
        return null;
    }
}
