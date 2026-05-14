package com.example.taskmanagement.repository;

import com.example.taskmanagement.model.ExternalSystemRegistration;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ExternalSystemRegistrationRepository extends JpaRepository<ExternalSystemRegistration, String> {

    @Query("SELECT e FROM ExternalSystemRegistration e WHERE CONCAT(',', e.supportedTaskTypes, ',') LIKE CONCAT('%,', :type, ',%')")
    Optional<ExternalSystemRegistration> findBySupportedTaskType(@Param("type") String type);

    @Query("SELECT e FROM ExternalSystemRegistration e WHERE CONCAT(',', e.supportedTaskTypes, ',') LIKE CONCAT('%,', :type, ',%')")
    List<ExternalSystemRegistration> findAllBySupportedTaskType(@Param("type") String type);

    List<ExternalSystemRegistration> findAllByOrderByRegisteredAtDesc();
}
