package com.example.taskmanagement.service;

import java.util.UUID;

public interface QaPushService {
    void pushToQa(UUID taskId, String qaDepartmentId, UUID qaAssigneeId);
}
