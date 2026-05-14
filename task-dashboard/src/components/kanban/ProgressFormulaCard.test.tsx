import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgressFormulaCard from '../kanban/ProgressFormulaCard';
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

describe('ProgressFormulaCard', () => {
  it('renders nothing when no children', () => {
    const node = makeTask({ compositionMode: 'HOMOGENEOUS' });
    const { container } = render(<ProgressFormulaCard node={node} children={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when compositionMode is null', () => {
    const node = makeTask({ compositionMode: null });
    const children = [makeTask({ id: 'c1', name: '子1' })];
    const { container } = render(<ProgressFormulaCard node={node} children={children} />);
    expect(container.innerHTML).toBe('');
  });

  describe('homogeneous formula', () => {
    it('displays homogeneous formula label', () => {
      const node = makeTask({ compositionMode: 'HOMOGENEOUS', workload: 100 });
      const children = [
        makeTask({ id: 'c1', name: '子1', progress: 60, weight: 1, workload: 60 }),
        makeTask({ id: 'c2', name: '子2', progress: 40, weight: 1, workload: 40 }),
      ];
      render(<ProgressFormulaCard node={node} children={children} />);
      expect(screen.getByText('同质公式')).toBeInTheDocument();
      expect(screen.getByText(/Σ\(子进度 × 子权重 × 子工作量\)/)).toBeInTheDocument();
    });

    it('calculates homogeneous progress correctly', () => {
      const node = makeTask({ compositionMode: 'HOMOGENEOUS', workload: 100 });
      const children = [
        makeTask({ id: 'c1', name: '子1', progress: 80, weight: 1, workload: 60 }),
        makeTask({ id: 'c2', name: '子2', progress: 50, weight: 1, workload: 40 }),
      ];
      render(<ProgressFormulaCard node={node} children={children} />);
      const calculated = (80 * 1 * 60 + 50 * 1 * 40) / (1 * 60 + 1 * 40);
      expect(screen.getByText(`${Math.round(calculated)}%`)).toBeInTheDocument();
    });

    it('shows warning when child workload is missing', () => {
      const node = makeTask({ compositionMode: 'HOMOGENEOUS', workload: 100 });
      const children = [
        makeTask({ id: 'c1', name: '子1', progress: 60, weight: 1, workload: 60 }),
        makeTask({ id: 'c2', name: '子2', progress: 40, weight: 1, workload: undefined }),
      ];
      render(<ProgressFormulaCard node={node} children={children} />);
      expect(screen.getByText(/缺失项/)).toBeInTheDocument();
    });

    it('shows warning when workload sum mismatches parent', () => {
      const node = makeTask({ compositionMode: 'HOMOGENEOUS', workload: 200 });
      const children = [
        makeTask({ id: 'c1', name: '子1', progress: 60, weight: 1, workload: 60 }),
        makeTask({ id: 'c2', name: '子2', progress: 40, weight: 1, workload: 40 }),
      ];
      render(<ProgressFormulaCard node={node} children={children} />);
      expect(screen.getByText(/工作量总和.*与父节点工作量.*不一致/)).toBeInTheDocument();
    });
  });

  describe('heterogeneous formula', () => {
    it('displays heterogeneous formula label', () => {
      const node = makeTask({ compositionMode: 'HETEROGENEOUS' });
      const children = [
        makeTask({ id: 'c1', name: '子1', progress: 60, weight: 2 }),
        makeTask({ id: 'c2', name: '子2', progress: 40, weight: 3 }),
      ];
      render(<ProgressFormulaCard node={node} children={children} />);
      expect(screen.getByText('异质公式')).toBeInTheDocument();
      expect(screen.getByText(/Σ\(子进度 × 子权重\) \/ Σ\(子权重\)/)).toBeInTheDocument();
    });

    it('calculates heterogeneous progress correctly', () => {
      const node = makeTask({ compositionMode: 'HETEROGENEOUS' });
      const children = [
        makeTask({ id: 'c1', name: '子1', progress: 60, weight: 2 }),
        makeTask({ id: 'c2', name: '子2', progress: 40, weight: 3 }),
      ];
      render(<ProgressFormulaCard node={node} children={children} />);
      const calculated = (60 * 2 + 40 * 3) / (2 + 3);
      expect(screen.getByText(`${Math.round(calculated)}%`)).toBeInTheDocument();
    });

    it('shows info when weight is missing (defaults to 1)', () => {
      const node = makeTask({ compositionMode: 'HETEROGENEOUS' });
      const children = [
        makeTask({ id: 'c1', name: '子1', progress: 60, weight: undefined }),
      ];
      render(<ProgressFormulaCard node={node} children={children} />);
      expect(screen.getByText(/默认值 1/)).toBeInTheDocument();
    });
  });

  it('shows inconsistency notice when recorded progress differs from calculated', () => {
    const node = makeTask({ compositionMode: 'HETEROGENEOUS', progress: 99 });
    const children = [
      makeTask({ id: 'c1', name: '子1', progress: 50, weight: 1 }),
      makeTask({ id: 'c2', name: '子2', progress: 50, weight: 1 }),
    ];
    render(<ProgressFormulaCard node={node} children={children} />);
    expect(screen.getByText(/与计算值不一致/)).toBeInTheDocument();
  });
});
