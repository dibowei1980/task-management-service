import { MeasurementUnitDefinition } from '../types';
import { taskApi } from '../utils/api';

export interface MeasurementUnitRequest {
  code: string;
  name: string;
  enabled?: boolean;
  baseUnitCode?: string | null;
  conversionFactor?: number | null;
}

export const measurementUnitService = {
  list: async (): Promise<MeasurementUnitDefinition[]> => {
    const res = await taskApi.get<MeasurementUnitDefinition[]>('/api/measurement-units');
    return res.data;
  },
  create: async (data: MeasurementUnitRequest): Promise<MeasurementUnitDefinition> => {
    const res = await taskApi.post<MeasurementUnitDefinition>('/api/measurement-units', data);
    return res.data;
  },
  update: async (id: string, data: MeasurementUnitRequest): Promise<MeasurementUnitDefinition> => {
    const res = await taskApi.put<MeasurementUnitDefinition>(`/api/measurement-units/${id}`, data);
    return res.data;
  },
  toggle: async (id: string, enabled: boolean): Promise<MeasurementUnitDefinition> => {
    const res = await taskApi.patch<MeasurementUnitDefinition>(`/api/measurement-units/${id}/enabled`, { enabled });
    return res.data;
  },
};
