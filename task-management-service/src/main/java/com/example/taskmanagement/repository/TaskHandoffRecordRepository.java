package com.example.taskmanagement.repository;

import com.example.taskmanagement.model.TaskHandoffRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface TaskHandoffRecordRepository extends JpaRepository<TaskHandoffRecord, UUID> {

    List<TaskHandoffRecord> findByTaskIdOrderByOperatedAtAsc(UUID taskId);

    TaskHandoffRecord findTopByTaskIdOrderByOperatedAtDesc(UUID taskId);

    TaskHandoffRecord findTopByTaskIdAndActionNotOrderByOperatedAtDesc(UUID taskId, String action);

    TaskHandoffRecord findTopByTaskIdAndActionInOrderByOperatedAtDesc(UUID taskId, Collection<String> actions);
}
