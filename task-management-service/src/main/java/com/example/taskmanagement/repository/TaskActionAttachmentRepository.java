package com.example.taskmanagement.repository;

import com.example.taskmanagement.model.TaskActionAttachment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface TaskActionAttachmentRepository extends JpaRepository<TaskActionAttachment, UUID> {

    List<TaskActionAttachment> findByTaskIdAndActionOrderByCreatedAtAsc(UUID taskId, String action);

    List<TaskActionAttachment> findByTaskIdOrderByCreatedAtAsc(UUID taskId);

    long countByTaskIdAndAction(UUID taskId, String action);

    void deleteByTaskIdAndAction(UUID taskId, String action);
}
