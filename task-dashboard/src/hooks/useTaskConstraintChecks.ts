import { useMemo } from 'react';
import { Task } from '../types';

interface ConstraintViolation {
  level: 'error' | 'warn';
  field: string;
  message: string;
}

export function useTaskConstraintChecks(
  parentTask: Task | null,
  siblings: Task[],
  candidateType: string | null,
  candidateWorkload: number | null,
  candidateWeight: number | null,
  maxDepth: number = 5,
  currentDepth: number = 0,
) {
  const violations = useMemo(() => {
    const result: ConstraintViolation[] = [];
    if (!parentTask) return result;

    if (currentDepth >= maxDepth) {
      result.push({
        level: 'error',
        field: 'depth',
        message: `已达到最大层级深度 ${maxDepth}，无法继续添加子任务`,
      });
    }

    const siblingTypes = siblings.map(s => s.type).filter(Boolean);
    if (siblingTypes.length > 0 && candidateType) {
      const uniqueTypes = new Set(siblingTypes);
      const allSame = siblingTypes.every(t => t === candidateType);
      const allDifferent = !uniqueTypes.has(candidateType) && uniqueTypes.size === siblingTypes.length;

      if (!allSame && !allDifferent) {
        result.push({
          level: 'error',
          field: 'type',
          message: '当前兄弟节点已存在混合类型（半同半异），不允许继续添加子任务',
        });
      }
    }

    if (parentTask.workload != null && candidateWorkload != null && siblingTypes.length > 0) {
      const allSameType = candidateType && siblingTypes.every(t => t === candidateType);
      if (allSameType) {
        const siblingWorkloadSum = siblings.reduce((sum, s) => sum + (s.workload ?? 0), 0);
        const totalWorkload = siblingWorkloadSum + candidateWorkload;
        if (Math.abs(totalWorkload - parentTask.workload) > 0.01) {
          result.push({
            level: 'warn',
            field: 'workload',
            message: `同质任务工作量总和（${totalWorkload}）与父任务工作量（${parentTask.workload}）不一致`,
          });
        }
      }
    }

    if (candidateWeight != null && (candidateWeight < 0.01 || candidateWeight > 100)) {
      result.push({
        level: 'error',
        field: 'weight',
        message: '权重必须在 0.01~100 之间',
      });
    }

    if (candidateType && siblingTypes.length > 0) {
      const allSameType = siblingTypes.every(t => t === candidateType);
      if (allSameType) {
        const siblingWeights = siblings.map(s => s.weight ?? 1);
        const hasDifferentWeights = siblingWeights.some(w => w !== (candidateWeight ?? 1));
        if (hasDifferentWeights) {
          result.push({
            level: 'warn',
            field: 'weight',
            message: '同质节点中存在不同权重，仅告警不阻断',
          });
        }
      }
    }

    return result;
  }, [parentTask, siblings, candidateType, candidateWorkload, candidateWeight, maxDepth, currentDepth]);

  const hasErrors = violations.some(v => v.level === 'error');
  const hasWarnings = violations.some(v => v.level === 'warn');
  const errors = violations.filter(v => v.level === 'error');
  const warnings = violations.filter(v => v.level === 'warn');

  const canSubmit = !hasErrors;

  return {
    violations,
    errors,
    warnings,
    hasErrors,
    hasWarnings,
    canSubmit,
  };
}
