package com.example.taskmanagement.executor;

import com.example.taskmanagement.model.ExternalSystemRegistration;
import com.example.taskmanagement.model.Task;
import com.example.taskmanagement.model.TaskCategory;
import com.example.taskmanagement.model.TaskStatus;
import com.example.taskmanagement.repository.ExternalSystemRegistrationRepository;
import com.example.taskmanagement.service.TaskExecutor;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class ExternalSystemExecutor implements TaskExecutor {

    private static final Logger logger = LoggerFactory.getLogger(ExternalSystemExecutor.class);

    @Autowired
    private ExternalSystemRegistrationRepository registrationRepository;

    @Value("${task.management.api.url:http://localhost:8082/api}")
    private String taskManagementApiUrl;

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public boolean supports(String type) {
        return !registrationRepository.findAllBySupportedTaskType(type).isEmpty();
    }

    @Override
    public void execute(Task task) {
        ExternalSystemRegistration system = resolveSystem(task);

        String callbackUrl = system.getCallbackPath().replace("{id}", task.getId().toString());
        String fullUrl = system.getServiceUrl().replaceAll("/+$", "") + callbackUrl;

        Map<String, Object> payload = new HashMap<>();
        payload.put("task_id", task.getId().toString());
        payload.put("task_type", task.getType());
        payload.put("task_name", task.getName());

        Map<String, Object> inputParams = parseJsonObject(task.getInputParams());
        payload.put("input_params", inputParams);
        payload.put("callback_url", taskManagementApiUrl + "/tasks/" + task.getId() + "/workflow-status");

        if (system.getCallbackFields() != null && !system.getCallbackFields().isBlank()) {
            try {
                List<String> fields = objectMapper.readValue(system.getCallbackFields(), objectMapper.getTypeFactory().constructCollectionType(List.class, String.class));
                payload.put("callback_fields", fields);
            } catch (Exception ignored) {
            }
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);

        try {
            logger.info("Dispatching task {} (type={}) to external system {} at {}", task.getId(), task.getType(), system.getSystemId(), fullUrl);
            ResponseEntity<Map> response = restTemplate.exchange(fullUrl, HttpMethod.POST, entity, Map.class);
            logger.info("External system {} responded: {} for task {}", system.getSystemId(), response.getStatusCode(), task.getId());

            if (system.getResultViewUrl() != null && !system.getResultViewUrl().isBlank()) {
                task.setExternalUrl(system.getResultViewUrl().replace("{id}", task.getId().toString()));
            }
        } catch (Exception e) {
            logger.error("Failed to dispatch task {} to external system {}: {}", task.getId(), system.getSystemId(), e.getMessage());
            throw new RuntimeException("Failed to dispatch task to external system: " + e.getMessage(), e);
        }
    }

    private ExternalSystemRegistration resolveSystem(Task task) {
        String boundSystemId = task.getExternalSystem();
        List<ExternalSystemRegistration> candidates = registrationRepository.findAllBySupportedTaskType(task.getType());
        if (candidates.isEmpty()) {
            throw new IllegalArgumentException("No external system registered for type: " + task.getType());
        }
        if (boundSystemId != null && !boundSystemId.isBlank()) {
            return candidates.stream()
                    .filter(r -> boundSystemId.equals(r.getSystemId()))
                    .findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("Bound external system '" + boundSystemId + "' not registered for type: " + task.getType()));
        }
        return candidates.get(0);
    }

    @Override
    public String getDefaultType(TaskCategory category) {
        return null;
    }

    @Override
    public boolean onTaskCreated(Task task) {
        return false;
    }

    @Override
    public void onWorkflowStatusChanged(Task task, String oldStatus, String newStatus) {
    }

    @Override
    public boolean isPredecessorSatisfied(Task task) {
        if (task.getStatus() == TaskStatus.COMPLETED) return true;
        String ws = extractWorkflowStatus(task.getInputParams());
        if (ws == null) return false;
        return "COMPLETED".equals(ws);
    }

    @Override
    public TaskStatus resolveTaskStatus(Task task) {
        String ws = extractWorkflowStatus(task.getInputParams());
        if (ws == null || ws.isBlank()) return null;

        try {
            TaskStatus status = TaskStatus.valueOf(ws);
            if (status == TaskStatus.COMPLETED) {
                return TaskStatus.SUBMITTED_FOR_QA;
            }
            return status;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private String extractWorkflowStatus(String inputParamsJson) {
        Map<String, Object> map = parseJsonObject(inputParamsJson);
        Object v = map.get("workflowStatus");
        if (v == null) v = map.get("workflow_status");
        return v instanceof String s ? s : null;
    }

    private Map<String, Object> parseJsonObject(String json) {
        if (json == null || json.isBlank()) return new HashMap<>();
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            return new HashMap<>();
        }
    }
}
