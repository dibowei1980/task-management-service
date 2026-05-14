package com.example.taskmanagement.dto;

import java.time.ZonedDateTime;
import java.util.UUID;

public class MeasurementUnitResponse {
    private UUID id;
    private String code;
    private String name;
    private boolean builtin;
    private boolean enabled;
    private String baseUnitCode;
    private String baseUnitName;
    private Double conversionFactor;
    private boolean basic;
    private ZonedDateTime createdAt;
    private ZonedDateTime updatedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public boolean isBuiltin() { return builtin; }
    public void setBuiltin(boolean builtin) { this.builtin = builtin; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getBaseUnitCode() { return baseUnitCode; }
    public void setBaseUnitCode(String baseUnitCode) { this.baseUnitCode = baseUnitCode; }
    public String getBaseUnitName() { return baseUnitName; }
    public void setBaseUnitName(String baseUnitName) { this.baseUnitName = baseUnitName; }
    public Double getConversionFactor() { return conversionFactor; }
    public void setConversionFactor(Double conversionFactor) { this.conversionFactor = conversionFactor; }
    public boolean isBasic() { return basic; }
    public void setBasic(boolean basic) { this.basic = basic; }
    public ZonedDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(ZonedDateTime createdAt) { this.createdAt = createdAt; }
    public ZonedDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(ZonedDateTime updatedAt) { this.updatedAt = updatedAt; }
}
