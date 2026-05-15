import type { BridgeTask } from '../../../types';

export type WorkflowStatus =
  | '全部'
  | '待处理'
  | '处理中'
  | '待初检'
  | '需修改'
  | '待写回'
  | '完成'
  | '已锁定';

export const WORKFLOW_TABS: Array<{ key: WorkflowStatus; label: string }> = [
  { key: '全部', label: '全部' },
  { key: '待处理', label: '待处理' },
  { key: '处理中', label: '处理中' },
  { key: '待初检', label: '待初检' },
  { key: '待写回', label: '待写回' },
  { key: '需修改', label: '需修改' },
  { key: '已锁定', label: '已锁定' },
  { key: '完成', label: '完成' }
];

export type PreprocessSegmentItem = {
  path?: string;
  imagePath?: string;
  jsonPath?: string;
};

export const getWorkflowStatus = (task: BridgeTask): string | null => {
  const input = task.inputParams;
  if (!input) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = typeof input === 'string' ? JSON.parse(input) as Record<string, unknown> : input as Record<string, unknown>;
  } catch {
    return null;
  }
  const v = parsed['workflow_status'];
  return typeof v === 'string' && v ? v : null;
};

export const getWorkflowStatusLabel = (workflowStatus: string | null): string => {
  if (!workflowStatus) return '-';
  return workflowStatus;
};