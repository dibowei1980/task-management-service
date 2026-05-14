package com.example.taskmanagement.repository;

import com.example.taskmanagement.model.TaskAttachment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface TaskAttachmentRepository extends JpaRepository<TaskAttachment, UUID> {
    List<TaskAttachment> findByTaskIdOrderByUploadedAtDesc(UUID taskId);
    long countByTaskId(UUID taskId);
    void deleteByTaskIdAndId(UUID taskId, UUID id);
    void deleteAllByTaskId(UUID taskId);
}
