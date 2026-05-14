import { taskService } from './taskService';
import { Task } from '../types';

const LEAF_STAGES = [
  'PENDING', 'ASSIGNED', 'RECEIVED', 'IN_PROGRESS',
  'SUBMITTED_FOR_QA', 'QA_COMPLETING', 'QA_COMPLETED',
] as const;

export type LeafStage = typeof LEAF_STAGES[number];

export interface StatusWorkloadMap {
  [stage: string]: number;
}

export const statusWorkloadService = {
  parseStatusWorkloads(task: Task): StatusWorkloadMap {
    if (!task.statusWorkloads) {
      const map: StatusWorkloadMap = {};
      for (const s of LEAF_STAGES) map[s] = 0;
      map.PENDING = task.workload ?? 0;
      return map;
    }
    try {
      const parsed = JSON.parse(task.statusWorkloads);
      const map: StatusWorkloadMap = {};
      for (const s of LEAF_STAGES) map[s] = parsed[s] ?? 0;
      return map;
    } catch {
      const map: StatusWorkloadMap = {};
      for (const s of LEAF_STAGES) map[s] = 0;
      map.PENDING = task.workload ?? 0;
      return map;
    }
  },

  getTotalWorkload(sw: StatusWorkloadMap): number {
    return Object.values(sw).reduce((a, b) => a + b, 0);
  },

  isConserved(sw: StatusWorkloadMap, totalWorkload: number): boolean {
    return Math.abs(statusWorkloadService.getTotalWorkload(sw) - totalWorkload) < 0.01;
  },

  applyWaterfall(
    current: StatusWorkloadMap,
    stage: string,
    newValue: number,
    totalWorkload: number,
  ): StatusWorkloadMap {
    void totalWorkload; // 保留参数供未来使用
    const result = { ...current };
    const oldValue = result[stage] ?? 0;
    const delta = newValue - oldValue;
    const stageIdx = LEAF_STAGES.indexOf(stage as LeafStage);

    if (stageIdx < 0) return result;

    if (delta > 0) {
      let remaining = delta;
      for (let i = stageIdx - 1; i >= 0 && remaining > 0.001; i--) {
        const upstream = LEAF_STAGES[i];
        const available = result[upstream] ?? 0;
        const deduct = Math.min(available, remaining);
        result[upstream] = available - deduct;
        remaining -= deduct;
      }
      if (remaining > 0.001) {
        throw new Error(`上游状态工作量不足，无法向 ${stage} 流入 ${delta}`);
      }
      result[stage] = newValue;
    } else if (delta < 0) {
      result[stage] = newValue;
      const upstream = stageIdx > 0 ? LEAF_STAGES[stageIdx - 1] : LEAF_STAGES[0];
      result[upstream] = (result[upstream] ?? 0) + (-delta);
    }

    return result;
  },

  calculateLeafProgress(sw: StatusWorkloadMap, inProgressWeight: number, inProgressCompletedWorkload: number, totalWorkload: number): number {
    if (totalWorkload <= 0) return 0;
    const w_ip = inProgressWeight ?? 0.95;
    const ipCompleted = inProgressCompletedWorkload ?? 0;
    const weighted =
      (sw.SUBMITTED_FOR_QA ?? 0) * 0.95 +
      (sw.QA_COMPLETING ?? 0) * 0.95 +
      (sw.QA_COMPLETED ?? 0) * 1.0 +
      ipCompleted * w_ip;
    return Math.round((weighted / totalWorkload) * 100);
  },

  async saveStatusWorkloads(taskId: string, sw: StatusWorkloadMap): Promise<Task> {
    return taskService.updateStatusWorkloads(taskId, sw);
  },
};
