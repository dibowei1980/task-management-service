import { useMemo } from 'react';
import { Task } from '../types';

export const useWeightValidation = (
  parentCompositionMode: 'HOMOGENEOUS' | 'HETEROGENEOUS' | null,
  siblingTasks: Task[],
  weight: number | ''
) => {
  return useMemo(() => {
    if (parentCompositionMode !== 'HOMOGENEOUS' || siblingTasks.length === 0) return null;
    const effectiveWeight = weight === '' ? 1 : weight;
    const siblingWeights = siblingTasks.map(s => s.weight ?? 1);
    const allSame = siblingWeights.every(w => w === effectiveWeight);
    if (!allSame) {
      return `同质节点的子节点权重不一致（当前: ${effectiveWeight}，兄弟节点: ${[...new Set(siblingWeights)].sort((a, b) => a - b).join(', ')}），建议保持一致`;
    }
    return null;
  }, [parentCompositionMode, siblingTasks, weight]);
};
