import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTaskConstraintChecks } from './useTaskConstraintChecks';
import { Task } from '../types';

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  name: '测试任务',
  type: 'DATA_COLLECTION',
  status: 'IN_PROGRESS',
  priority: 1,
  assigneeId: null,
  progress: 0,
  createdAt: '2026-01-01',
  ...overrides,
});

describe('useTaskConstraintChecks', () => {
  it('returns no violations when no parent task', () => {
    const { result } = renderHook(() =>
      useTaskConstraintChecks(null, [], 'DATA_COLLECTION', 10, 1),
    );
    expect(result.current.violations).toHaveLength(0);
    expect(result.current.canSubmit).toBe(true);
  });

  it('detects depth limit violation', () => {
    const parent = makeTask();
    const { result } = renderHook(() =>
      useTaskConstraintChecks(parent, [], 'DATA_COLLECTION', 10, 1, 5, 5),
    );
    expect(result.current.hasErrors).toBe(true);
    expect(result.current.errors[0].field).toBe('depth');
    expect(result.current.errors[0].message).toContain('最大层级深度');
    expect(result.current.canSubmit).toBe(false);
  });

  it('allows depth within limit', () => {
    const parent = makeTask();
    const { result } = renderHook(() =>
      useTaskConstraintChecks(parent, [], 'DATA_COLLECTION', 10, 1, 5, 3),
    );
    const depthErrors = result.current.errors.filter(e => e.field === 'depth');
    expect(depthErrors).toHaveLength(0);
  });

  describe('type constraints', () => {
    it('allows same type as all siblings (homogeneous)', () => {
      const parent = makeTask();
      const siblings = [
        makeTask({ id: 's1', type: 'DATA_COLLECTION' }),
        makeTask({ id: 's2', type: 'DATA_COLLECTION' }),
      ];
      const { result } = renderHook(() =>
        useTaskConstraintChecks(parent, siblings, 'DATA_COLLECTION', 10, 1),
      );
      const typeErrors = result.current.errors.filter(e => e.field === 'type');
      expect(typeErrors).toHaveLength(0);
    });

    it('allows different type from all siblings (heterogeneous)', () => {
      const parent = makeTask();
      const siblings = [
        makeTask({ id: 's1', type: 'DATA_COLLECTION' }),
        makeTask({ id: 's2', type: 'DATA_PROCESSING' }),
      ];
      const { result } = renderHook(() =>
        useTaskConstraintChecks(parent, siblings, 'QUALITY_ASSURANCE', 10, 1),
      );
      const typeErrors = result.current.errors.filter(e => e.field === 'type');
      expect(typeErrors).toHaveLength(0);
    });

    it('blocks mixed type (neither all same nor all different)', () => {
      const parent = makeTask();
      const siblings = [
        makeTask({ id: 's1', type: 'DATA_COLLECTION' }),
        makeTask({ id: 's2', type: 'DATA_COLLECTION' }),
        makeTask({ id: 's3', type: 'DATA_PROCESSING' }),
      ];
      const { result } = renderHook(() =>
        useTaskConstraintChecks(parent, siblings, 'DATA_COLLECTION', 10, 1),
      );
      expect(result.current.hasErrors).toBe(true);
      const typeErrors = result.current.errors.filter(e => e.field === 'type');
      expect(typeErrors.length).toBeGreaterThanOrEqual(1);
      expect(typeErrors[0].message).toContain('混合类型');
    });

    it('blocks duplicate type in heterogeneous siblings', () => {
      const parent = makeTask();
      const siblings = [
        makeTask({ id: 's1', type: 'DATA_COLLECTION' }),
        makeTask({ id: 's2', type: 'DATA_PROCESSING' }),
      ];
      const { result } = renderHook(() =>
        useTaskConstraintChecks(parent, siblings, 'DATA_COLLECTION', 10, 1),
      );
      expect(result.current.hasErrors).toBe(true);
      const typeErrors = result.current.errors.filter(e => e.field === 'type');
      expect(typeErrors.length).toBeGreaterThanOrEqual(1);
      expect(typeErrors[0].message).toMatch(/混合类型|分散/);
    });
  });

  describe('workload constraints', () => {
    it('errors when homogeneous workload sum exceeds parent', () => {
      const parent = makeTask({ workload: 100 });
      const siblings = [
        makeTask({ id: 's1', type: 'DATA_COLLECTION', workload: 60 }),
        makeTask({ id: 's2', type: 'DATA_COLLECTION', workload: 30 }),
      ];
      const { result } = renderHook(() =>
        useTaskConstraintChecks(parent, siblings, 'DATA_COLLECTION', 20, 1),
      );
      const workloadErrors = result.current.errors.filter(e => e.field === 'workload');
      expect(workloadErrors).toHaveLength(1);
      expect(workloadErrors[0].message).toContain('工作量总和');
    });

    it('passes when homogeneous workload sum equals parent', () => {
      const parent = makeTask({ workload: 100 });
      const siblings = [
        makeTask({ id: 's1', type: 'DATA_COLLECTION', workload: 60 }),
        makeTask({ id: 's2', type: 'DATA_COLLECTION', workload: 30 }),
      ];
      const { result } = renderHook(() =>
        useTaskConstraintChecks(parent, siblings, 'DATA_COLLECTION', 10, 1),
      );
      const workloadErrors = result.current.errors.filter(e => e.field === 'workload');
      expect(workloadErrors).toHaveLength(0);
    });
  });

  describe('weight constraints', () => {
    it('errors when weight is out of range', () => {
      const parent = makeTask();
      const { result } = renderHook(() =>
        useTaskConstraintChecks(parent, [], 'DATA_COLLECTION', 10, 0),
      );
      const weightErrors = result.current.errors.filter(e => e.field === 'weight');
      expect(weightErrors).toHaveLength(1);
      expect(weightErrors[0].message).toContain('0.01~100');
    });

    it('errors when weight exceeds 100', () => {
      const parent = makeTask();
      const { result } = renderHook(() =>
        useTaskConstraintChecks(parent, [], 'DATA_COLLECTION', 10, 101),
      );
      const weightErrors = result.current.errors.filter(e => e.field === 'weight');
      expect(weightErrors).toHaveLength(1);
    });

    it('warns when homogeneous siblings have different weights', () => {
      const parent = makeTask();
      const siblings = [
        makeTask({ id: 's1', type: 'DATA_COLLECTION', weight: 2 }),
      ];
      const { result } = renderHook(() =>
        useTaskConstraintChecks(parent, siblings, 'DATA_COLLECTION', 10, 1),
      );
      expect(result.current.hasWarnings).toBe(true);
      const weightWarnings = result.current.warnings.filter(w => w.field === 'weight');
      expect(weightWarnings).toHaveLength(1);
      expect(weightWarnings[0].message).toContain('不同权重');
    });
  });
});
