import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkloadConsistencyAlert } from '../task/WorkloadConsistencyAlert';
import { Task } from '../../types';

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  name: '测试任务',
  type: 'DATA_COLLECTION',
  status: 'IN_PROGRESS',
  priority: 1,
  assigneeId: null,
  progress: 50,
  createdAt: '2026-01-01',
  ...overrides,
});

const getUnitName = (code: string) => code === 'SHEET' ? '幅' : code;

describe('WorkloadConsistencyAlert', () => {
  it('returns null when no children', () => {
    const parent = makeTask({ compositionMode: 'HOMOGENEOUS', workload: 100 });
    const { container } = render(
      <WorkloadConsistencyAlert parent={parent} children={[]} getUnitName={getUnitName} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('returns null when workload is consistent', () => {
    const parent = makeTask({ compositionMode: 'HOMOGENEOUS', workload: 100, workloadUnit: 'SHEET' });
    const children = [
      makeTask({ id: 'c1', workload: 60, workloadUnit: 'SHEET' }),
      makeTask({ id: 'c2', workload: 40, workloadUnit: 'SHEET' }),
    ];
    const { container } = render(
      <WorkloadConsistencyAlert parent={parent} children={children} getUnitName={getUnitName} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows error when child workload sum exceeds parent', () => {
    const parent = makeTask({ compositionMode: 'HOMOGENEOUS', workload: 100, workloadUnit: 'SHEET' });
    const children = [
      makeTask({ id: 'c1', workload: 70, workloadUnit: 'SHEET' }),
      makeTask({ id: 'c2', workload: 50, workloadUnit: 'SHEET' }),
    ];
    render(
      <WorkloadConsistencyAlert parent={parent} children={children} getUnitName={getUnitName} />
    );
    expect(screen.getByText(/超出/)).toBeInTheDocument();
    expect(screen.getByText(/120\.00 幅/)).toBeInTheDocument();
    expect(screen.getByText(/100\.00 幅/)).toBeInTheDocument();
  });

  it('shows warn when child workload sum is less than parent', () => {
    const parent = makeTask({ compositionMode: 'HOMOGENEOUS', workload: 100, workloadUnit: 'SHEET' });
    const children = [
      makeTask({ id: 'c1', workload: 30, workloadUnit: 'SHEET' }),
      makeTask({ id: 'c2', workload: 20, workloadUnit: 'SHEET' }),
    ];
    render(
      <WorkloadConsistencyAlert parent={parent} children={children} getUnitName={getUnitName} />
    );
    expect(screen.getByText(/不足/)).toBeInTheDocument();
    expect(screen.getByText(/50\.00 幅/)).toBeInTheDocument();
    expect(screen.getByText(/差额 50\.00 幅/)).toBeInTheDocument();
  });

  it('shows warn when homogeneous children have inconsistent weights', () => {
    const parent = makeTask({ compositionMode: 'HOMOGENEOUS', workload: 100, workloadUnit: 'SHEET' });
    const children = [
      makeTask({ id: 'c1', workload: 50, weight: 1, workloadUnit: 'SHEET' }),
      makeTask({ id: 'c2', workload: 50, weight: 2, workloadUnit: 'SHEET' }),
    ];
    render(
      <WorkloadConsistencyAlert parent={parent} children={children} getUnitName={getUnitName} />
    );
    expect(screen.getByText(/权重不一致/)).toBeInTheDocument();
  });

  it('does not show weight warn for heterogeneous tasks', () => {
    const parent = makeTask({ compositionMode: 'HETEROGENEOUS', workload: 100, workloadUnit: 'SHEET' });
    const children = [
      makeTask({ id: 'c1', workload: 50, weight: 1, workloadUnit: 'SHEET' }),
      makeTask({ id: 'c2', workload: 50, weight: 2, workloadUnit: 'SHEET' }),
    ];
    const { container } = render(
      <WorkloadConsistencyAlert parent={parent} children={children} getUnitName={getUnitName} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('does not show workload mismatch for heterogeneous tasks', () => {
    const parent = makeTask({ compositionMode: 'HETEROGENEOUS', workload: 100, workloadUnit: 'SHEET' });
    const children = [
      makeTask({ id: 'c1', workload: 70, workloadUnit: 'SHEET' }),
      makeTask({ id: 'c2', workload: 50, workloadUnit: 'SHEET' }),
    ];
    const { container } = render(
      <WorkloadConsistencyAlert parent={parent} children={children} getUnitName={getUnitName} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows both workload mismatch and weight inconsistency', () => {
    const parent = makeTask({ compositionMode: 'HOMOGENEOUS', workload: 100, workloadUnit: 'SHEET' });
    const children = [
      makeTask({ id: 'c1', workload: 70, weight: 1, workloadUnit: 'SHEET' }),
      makeTask({ id: 'c2', workload: 50, weight: 2, workloadUnit: 'SHEET' }),
    ];
    render(
      <WorkloadConsistencyAlert parent={parent} children={children} getUnitName={getUnitName} />
    );
    expect(screen.getByText(/超出/)).toBeInTheDocument();
    expect(screen.getByText(/权重不一致/)).toBeInTheDocument();
  });
});