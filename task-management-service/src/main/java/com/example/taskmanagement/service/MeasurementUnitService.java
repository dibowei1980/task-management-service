package com.example.taskmanagement.service;

import com.example.taskmanagement.dto.MeasurementUnitRequest;
import com.example.taskmanagement.dto.MeasurementUnitResponse;

import java.util.List;
import java.util.UUID;

public interface MeasurementUnitService {
    List<MeasurementUnitResponse> listAll();

    MeasurementUnitResponse create(MeasurementUnitRequest request);

    MeasurementUnitResponse update(UUID id, MeasurementUnitRequest request);

    MeasurementUnitResponse setEnabled(UUID id, boolean enabled);
}
