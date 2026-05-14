import { useState, useCallback, useEffect, useRef } from 'react';
import { ProjectTypeDefinition, MeasurementUnitDefinition } from '../types';
import { projectTypeService } from '../services/projectTypeService';
import { measurementUnitService } from '../services/measurementUnitService';
import { taskTypeService, TaskTypeResponse } from '../services/taskTypeService';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

let projectTypeCache: CacheEntry<ProjectTypeDefinition[]> | null = null;
let measurementUnitCache: CacheEntry<MeasurementUnitDefinition[]> | null = null;
let taskTypeCache: CacheEntry<TaskTypeResponse[]> | null = null;

function isCacheValid<T>(cache: CacheEntry<T> | null): cache is CacheEntry<T> {
  return cache !== null && Date.now() - cache.timestamp < CACHE_TTL_MS;
}

export function useProjectTypeStore() {
  const [projectTypes, setProjectTypes] = useState<ProjectTypeDefinition[]>([]);
  const [measurementUnits, setMeasurementUnits] = useState<MeasurementUnitDefinition[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskTypeResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  const loadProjectTypes = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && isCacheValid(projectTypeCache)) {
      setProjectTypes(projectTypeCache.data);
      return;
    }
    setLoading(true);
    try {
      const data = await projectTypeService.list();
      projectTypeCache = { data, timestamp: Date.now() };
      setProjectTypes(data);
      setError(null);
    } catch (e) {
      console.error(e);
      setError('加载项目类型失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMeasurementUnits = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && isCacheValid(measurementUnitCache)) {
      setMeasurementUnits(measurementUnitCache.data);
      return;
    }
    try {
      const data = await measurementUnitService.list();
      measurementUnitCache = { data, timestamp: Date.now() };
      setMeasurementUnits(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadTaskTypes = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && isCacheValid(taskTypeCache)) {
      setTaskTypes(taskTypeCache.data);
      return;
    }
    try {
      const data = await taskTypeService.list();
      taskTypeCache = { data, timestamp: Date.now() };
      setTaskTypes(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadAll = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      await Promise.all([loadProjectTypes(forceRefresh), loadMeasurementUnits(forceRefresh), loadTaskTypes(forceRefresh)]);
    } finally {
      setLoading(false);
    }
  }, [loadProjectTypes, loadMeasurementUnits, loadTaskTypes]);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      loadAll();
    }
  }, [loadAll]);

  const enabledProjectTypes = projectTypes.filter(t => t.enabled);
  const enabledMeasurementUnits = measurementUnits.filter(u => u.enabled);

  const getProjectTypeByCode = useCallback((code: string) => {
    return projectTypes.find(t => t.code === code) || null;
  }, [projectTypes]);

  const getDefaultUnitForType = useCallback(() => {
    return null;
  }, []);

  const getUnitName = useCallback((unitCode: string) => {
    return measurementUnits.find(u => u.code === unitCode)?.name || unitCode;
  }, [measurementUnits]);

  const getTaskTypeName = useCallback((code: string) => {
    return taskTypes.find(t => t.code === code)?.name || code;
  }, [taskTypes]);

  const getTypeDisplayName = useCallback((typeCode: string | null | undefined, category?: string | null) => {
    if (!typeCode) return '-';
    if (category === 'PROJECT') {
      const pt = projectTypes.find(t => t.code === typeCode);
      return pt ? pt.name : typeCode;
    }
    const tt = taskTypes.find(t => t.code === typeCode);
    return tt ? tt.name : typeCode;
  }, [projectTypes, taskTypes]);

  const invalidateCache = useCallback(() => {
    projectTypeCache = null;
    measurementUnitCache = null;
    taskTypeCache = null;
    loadAll(true);
  }, [loadAll]);

  return {
    projectTypes,
    enabledProjectTypes,
    measurementUnits,
    enabledMeasurementUnits,
    loading,
    error,
    getProjectTypeByCode,
    getDefaultUnitForType,
    getUnitName,
    getTaskTypeName,
    getTypeDisplayName,
    loadAll,
    invalidateCache,
  };
}
