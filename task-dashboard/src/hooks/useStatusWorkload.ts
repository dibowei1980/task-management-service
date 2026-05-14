import { useState, useCallback, useMemo } from 'react';
import { Task } from '../types';
import { statusWorkloadService, StatusWorkloadMap } from '../services/statusWorkloadService';

export interface UseStatusWorkloadResult {
  workloads: StatusWorkloadMap;
  totalWorkload: number;
  currentSum: number;
  isConserved: boolean;
  progress: number;
  setStageValue: (stage: string, value: number) => void;
  reset: (task: Task) => void;
  save: (taskId: string) => Promise<Task>;
  saving: boolean;
  error: string | null;
}

export const useStatusWorkload = (task: Task): UseStatusWorkloadResult => {
  const [workloads, setWorkloads] = useState<StatusWorkloadMap>(() =>
    statusWorkloadService.parseStatusWorkloads(task)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalWorkload = task.workload ?? 0;
  const currentSum = useMemo(() => statusWorkloadService.getTotalWorkload(workloads), [workloads]);
  const isConserved = useMemo(() => statusWorkloadService.isConserved(workloads, totalWorkload), [workloads, totalWorkload]);
  const progress = useMemo(
    () => statusWorkloadService.calculateLeafProgress(workloads, task.inProgressWeight ?? 0.95, task.inProgressCompletedWorkload ?? 0, totalWorkload),
    [workloads, task.inProgressWeight, task.inProgressCompletedWorkload, totalWorkload],
  );

  const setStageValue = useCallback((stage: string, value: number) => {
    setWorkloads(prev => statusWorkloadService.applyWaterfall(prev, stage, value, totalWorkload));
  }, [totalWorkload]);

  const reset = useCallback((t: Task) => {
    setWorkloads(statusWorkloadService.parseStatusWorkloads(t));
    setError(null);
  }, []);

  const save = useCallback(async (taskId: string): Promise<Task> => {
    setSaving(true);
    setError(null);
    try {
      const result = await statusWorkloadService.saveStatusWorkloads(taskId, workloads);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败';
      setError(msg);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [workloads]);

  return {
    workloads,
    totalWorkload,
    currentSum,
    isConserved,
    progress,
    setStageValue,
    reset,
    save,
    saving,
    error,
  };
};
