export const BRIDGE_APP_EXTERNAL_SYSTEM = 'bridge-removal-app';
export const BRIDGE_PROJECT_TYPES = new Set(['BRIDGE_REMOVAL_BATCH', 'BRIDGE_REMOVAL_UNIT']);

export type DecomposeOrderStrategy = 'ASC' | 'DESC';
export type DecomposeOverwriteStrategy = 'OVERWRITE' | 'SKIP';

export type FeedbackItem = { stage?: string; result?: string; message?: string; at?: string; by?: string };

export const parseFeedbackItems = (input: Record<string, unknown>): FeedbackItem[] => {
  const raw = input['qa_feedback'];
  if (!Array.isArray(raw)) return [];
  return raw
    .map(item => (item && typeof item === 'object') ? (item as Record<string, unknown>) : null)
    .filter((v): v is Record<string, unknown> => v != null)
    .map(v => ({
      stage: typeof v.stage === 'string' ? v.stage : undefined,
      result: typeof v.result === 'string' ? v.result : undefined,
      message: typeof v.message === 'string' ? v.message : undefined,
      at: typeof v.at === 'string' ? v.at : undefined,
      by: typeof v.by === 'string' ? v.by : undefined,
    }))
    .filter(v => typeof v.message === 'string' && v.message.trim().length > 0);
};