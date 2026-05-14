package com.example.taskmanagement.dto;

public class MeasurementUnitRequest {
    private String code;
    private String name;
    private Boolean enabled;
    private String baseUnitCode;
    private Double conversionFactor;

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }
    public String getBaseUnitCode() { return baseUnitCode; }
    public void setBaseUnitCode(String baseUnitCode) { this.baseUnitCode = baseUnitCode; }
    public Double getConversionFactor() { return conversionFactor; }
    public void setConversionFactor(Double conversionFactor) { this.conversionFactor = conversionFactor; }
}
