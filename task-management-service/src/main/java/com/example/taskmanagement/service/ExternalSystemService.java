package com.example.taskmanagement.service;

import com.example.taskmanagement.dto.ExternalSystemRegistrationRequest;
import com.example.taskmanagement.model.ExternalSystemRegistration;
import com.example.taskmanagement.repository.ExternalSystemRegistrationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZonedDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class ExternalSystemService {

    private static final Logger logger = LoggerFactory.getLogger(ExternalSystemService.class);

    @Autowired
    private ExternalSystemRegistrationRepository registrationRepository;
    @Autowired
    private SsoClientWhitelistService ssoClientWhitelistService;
    @Autowired
    private TaskTypeService taskTypeService;

    @Transactional
    public ExternalSystemRegistration register(ExternalSystemRegistrationRequest request) {
        if (request.getSystemId() == null || request.getSystemId().isBlank()) {
            throw new IllegalArgumentException("systemId is required");
        }
        if (request.getServiceUrl() == null || request.getServiceUrl().isBlank()) {
            throw new IllegalArgumentException("serviceUrl is required");
        }
        if (request.getSsoClientId() == null || request.getSsoClientId().isBlank()) {
            throw new IllegalArgumentException("ssoClientId is required");
        }
        if (!ssoClientWhitelistService.isAllowed(request.getSsoClientId())) {
            throw new IllegalArgumentException("ssoClientId is not in whitelist: " + request.getSsoClientId());
        }
        if (request.getSupportedTaskTypes() == null || request.getSupportedTaskTypes().isEmpty()) {
            throw new IllegalArgumentException("supportedTaskTypes is required");
        }
        if (request.getCallbackPath() == null || request.getCallbackPath().isBlank()) {
            throw new IllegalArgumentException("callbackPath is required");
        }

        for (String type : request.getSupportedTaskTypes()) {
            taskTypeService.validateTypeCodeUsable(type);
        }

        ExternalSystemRegistration existing = registrationRepository.findById(request.getSystemId()).orElse(null);
        if (existing != null) {
            existing.setDisplayName(request.getDisplayName());
            existing.setServiceUrl(request.getServiceUrl());
            existing.setSsoClientId(request.getSsoClientId());
            existing.setDashboardUrl(request.getDashboardUrl());
            existing.setSupportedTaskTypes(String.join(",", request.getSupportedTaskTypes()));
            existing.setCallbackPath(request.getCallbackPath());
            existing.setRegisteredAt(ZonedDateTime.now());
            logger.info("Updated external system registration: {}", request.getSystemId());
            return registrationRepository.save(existing);
        }

        ExternalSystemRegistration reg = new ExternalSystemRegistration();
        reg.setSystemId(request.getSystemId());
        reg.setDisplayName(request.getDisplayName());
        reg.setServiceUrl(request.getServiceUrl());
        reg.setSsoClientId(request.getSsoClientId());
        reg.setDashboardUrl(request.getDashboardUrl());
        reg.setSupportedTaskTypes(String.join(",", request.getSupportedTaskTypes()));
        reg.setCallbackPath(request.getCallbackPath());
        reg.setRegisteredAt(ZonedDateTime.now());
        logger.info("Registered external system: {} -> {} (types: {})", request.getSystemId(), request.getServiceUrl(), request.getSupportedTaskTypes());
        return registrationRepository.save(reg);
    }

    public List<ExternalSystemRegistration> findAll() {
        return registrationRepository.findAllByOrderByRegisteredAtDesc();
    }

    public Optional<ExternalSystemRegistration> findById(String systemId) {
        return registrationRepository.findById(systemId);
    }

    public Optional<ExternalSystemRegistration> findByTaskType(String type) {
        List<ExternalSystemRegistration> all = registrationRepository.findAllBySupportedTaskType(type);
        return all.isEmpty() ? Optional.empty() : Optional.of(all.get(0));
    }

    public List<ExternalSystemRegistration> findAllByTaskType(String type) {
        return registrationRepository.findAllBySupportedTaskType(type);
    }

    @Transactional
    public void unregister(String systemId) {
        if (registrationRepository.existsById(systemId)) {
            registrationRepository.deleteById(systemId);
            logger.info("Unregistered external system: {}", systemId);
        }
    }
}
