import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ColorProgressBar } from '../task/ColorProgressBar';
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

describe('ColorProgressBar', () => {
  it('renders single segment when no statusWorkloads', () => {
    const task = makeTask({ status: 'IN_PROGRESS', workload: 100 });
    const { container } = render(<ColorProgressBar task={task} />);
    const bar = container.querySelector('.h-2\\.5') as HTMLElement;
    expect(bar).toBeTruthy();
    const segments = bar.children;
    expect(segments.length).toBe(1);
    expect((segments[0] as HTMLElement).style.width).toBe('100%');
  });

  it('renders segments by statusWorkloads proportions', () => {
    const task = makeTask({
      status: 'IN_PROGRESS',
      workload: 100,
      statusWorkloads: JSON.stringify({
        IN_PROGRESS: 60,
        SUBMITTED_FOR_QA: 40,
      }),
    });
    const { container } = render(<ColorProgressBar task={task} />);
    const bar = container.querySelector('.h-2\\.5') as HTMLElement;
    const segments = bar.children;
    expect(segments.length).toBe(2);
    const widths = Array.from(segments).map(s => parseFloat((s as HTMLElement).style.width));
    expect(widths[0]).toBeCloseTo(60, 0);
    expect(widths[1]).toBeCloseTo(40, 0);
  });

  it('splits IN_PROGRESS into two sub-segments when inProgressCompletedWorkload > 0', () => {
    const task = makeTask({
      status: 'IN_PROGRESS',
      workload: 100,
      statusWorkloads: JSON.stringify({
        IN_PROGRESS: 80,
        SUBMITTED_FOR_QA: 20,
      }),
      inProgressCompletedWorkload: 50,
    });
    const { container } = render(<ColorProgressBar task={task} />);
    const bar = container.querySelector('.h-2\\.5') as HTMLElement;
    const segments = bar.children;
    expect(segments.length).toBe(3);

    const inProgressCompleted = segments[0] as HTMLElement;
    const inProgressRemaining = segments[1] as HTMLElement;
    const submittedForQa = segments[2] as HTMLElement;

    expect(inProgressCompleted.style.backgroundColor).toBe('rgb(22, 163, 74)');
    expect(inProgressRemaining.style.backgroundColor).toBe('rgb(34, 197, 94)');
    expect(submittedForQa.style.backgroundColor).toBe('rgb(6, 182, 212)');

    expect(parseFloat(inProgressCompleted.style.width)).toBeCloseTo(50, 0);
    expect(parseFloat(inProgressRemaining.style.width)).toBeCloseTo(30, 0);
    expect(parseFloat(submittedForQa.style.width)).toBeCloseTo(20, 0);
  });

  it('uses _inProgressCompletedWorkloadForBar over inProgressCompletedWorkload', () => {
    const task = makeTask({
      status: 'IN_PROGRESS',
      workload: 100,
      statusWorkloads: JSON.stringify({
        IN_PROGRESS: 80,
      }),
      inProgressCompletedWorkload: 30,
      _inProgressCompletedWorkloadForBar: 60,
    });
    const { container } = render(<ColorProgressBar task={task} />);
    const bar = container.querySelector('.h-2\\.5') as HTMLElement;
    const segments = bar.children;
    expect(segments.length).toBe(2);

    const completed = segments[0] as HTMLElement;
    expect(parseFloat(completed.style.width)).toBeCloseTo(60, 0);
  });

  it('does not split IN_PROGRESS when inProgressCompletedWorkload is 0', () => {
    const task = makeTask({
      status: 'IN_PROGRESS',
      workload: 100,
      statusWorkloads: JSON.stringify({
        IN_PROGRESS: 80,
        SUBMITTED_FOR_QA: 20,
      }),
      inProgressCompletedWorkload: 0,
    });
    const { container } = render(<ColorProgressBar task={task} />);
    const bar = container.querySelector('.h-2\\.5') as HTMLElement;
    const segments = bar.children;
    expect(segments.length).toBe(2);
  });

  it('caps inProgressCompletedWorkload at IN_PROGRESS workload', () => {
    const task = makeTask({
      status: 'IN_PROGRESS',
      workload: 100,
      statusWorkloads: JSON.stringify({
        IN_PROGRESS: 40,
        SUBMITTED_FOR_QA: 60,
      }),
      inProgressCompletedWorkload: 50,
    });
    const { container } = render(<ColorProgressBar task={task} />);
    const bar = container.querySelector('.h-2\\.5') as HTMLElement;
    const segments = bar.children;
    expect(segments.length).toBe(2);

    const completed = segments[0] as HTMLElement;
    expect(parseFloat(completed.style.width)).toBeCloseTo(40, 0);
    expect(completed.style.backgroundColor).toBe('rgb(22, 163, 74)');
  });

  it('renders full QA pipeline segments', () => {
    const task = makeTask({
      status: 'IN_PROGRESS',
      workload: 100,
      statusWorkloads: JSON.stringify({
        IN_PROGRESS: 20,
        SUBMITTED_FOR_QA: 30,
        QA_COMPLETING: 10,
        QA_COMPLETED: 40,
      }),
    });
    const { container } = render(<ColorProgressBar task={task} />);
    const bar = container.querySelector('.h-2\\.5') as HTMLElement;
    const segments = bar.children;
    expect(segments.length).toBe(3);

    const widths = Array.from(segments).map(s => parseFloat((s as HTMLElement).style.width));
    expect(widths[0]).toBeCloseTo(20, 0);
    expect(widths[1]).toBeCloseTo(40, 0);
    expect(widths[2]).toBeCloseTo(40, 0);
  });

  it('renders compact mode without labels', () => {
    const task = makeTask({
      status: 'IN_PROGRESS',
      workload: 100,
      statusWorkloads: JSON.stringify({
        IN_PROGRESS: 50,
        SUBMITTED_FOR_QA: 50,
      }),
    });
    const { container } = render(<ColorProgressBar task={task} compact />);
    const bar = container.querySelector('.h-2\\.5') as HTMLElement;
    expect(bar).toBeTruthy();
    expect(screen.queryByText(/进行中/)).not.toBeInTheDocument();
  });
});