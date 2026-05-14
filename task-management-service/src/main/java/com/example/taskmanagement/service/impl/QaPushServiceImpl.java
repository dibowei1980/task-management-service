package com.example.taskmanagement.service.impl;

import com.example.taskmanagement.service.QaPushService;
import com.example.taskmanagement.upm.UpmClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class QaPushServiceImpl implements QaPushService {

    private static final Logger log = LoggerFactory.getLogger(QaPushServiceImpl.class);

    private final UpmClient upmClient;

    public QaPushServiceImpl(UpmClient upmClient) {
        this.upmClient = upmClient;
    }

    @Override
    public void pushToQa(UUID taskId, String qaDepartmentId, UUID qaAssigneeId) {
        if (taskId == null) return;

        if (qaAssigneeId != null) {
            log.info("质检推送: 任务 {} 已指定质检员 {}，直接推送", taskId, qaAssigneeId);
            return;
        }

        if (qaDepartmentId != null && !qaDepartmentId.isBlank()) {
            List<Map<String, Object>> managers = findDepartmentManagers(qaDepartmentId);
            if (managers.isEmpty()) {
                log.warn("质检推送: 任务 {} 质检部门 {} 中未找到具有 department:manager 权限的用户", taskId, qaDepartmentId);
            } else {
                String managerIds = managers.stream()
                        .map(m -> String.valueOf(m.get("id")))
                        .collect(Collectors.joining(", "));
                log.info("质检推送: 任务 {} 推送给质检部门 {} 负责人: {}", taskId, qaDepartmentId, managerIds);
            }
            return;
        }

        log.warn("质检推送: 任务 {} 未指定质检部门和质检员，无法推送", taskId);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> findDepartmentManagers(String departmentId) {
        try {
            List<Map<String, Object>> users = upmClient.searchUsers(null, null, "department:manager", null, null, true, null, null);
            return users.stream()
                    .filter(u -> {
                        Object deptId = u.get("departmentId");
                        return deptId != null && String.valueOf(deptId).equals(departmentId);
                    })
                    .toList();
        } catch (Exception e) {
            log.error("查询部门负责人失败: {}", e.getMessage());
            return List.of();
        }
    }
}
