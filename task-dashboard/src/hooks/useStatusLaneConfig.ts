import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'tms_status_lane_config';

const ALL_STATUSES = [
  'PENDING',
  'ASSIGNED',
  'RECEIVED',
  'IN_PROGRESS',
  'SUBMITTED_FOR_QA',
  'QA_COMPLETING',
  'QA_COMPLETED',
  'PENDING_ACCEPTANCE',
  'ACCEPTANCE_COMPLETED',
  'ARCHIVED',
  'COMPLETED',
  'PAUSED',
  'FAILED',
];

const DEFAULT_VISIBLE = new Set(ALL_STATUSES);

function loadFromStorage(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE;
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_VISIBLE;
    return new Set(parsed.filter(s => ALL_STATUSES.includes(s)));
  } catch {
    return DEFAULT_VISIBLE;
  }
}

function saveToStorage(visibleSet: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...visibleSet]));
  } catch {
    // localStorage 不可用时静默失败
  }
}

export function useStatusLaneConfig() {
  const [visibleStatuses, setVisibleStatuses] = useState<Set<string>>(loadFromStorage);

  useEffect(() => {
    saveToStorage(visibleStatuses);
  }, [visibleStatuses]);

  const toggleStatus = useCallback((status: string) => {
    setVisibleStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        if (next.size > 1) {
          next.delete(status);
        }
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  const showAll = useCallback(() => {
    setVisibleStatuses(new Set(ALL_STATUSES));
  }, []);

  const hideAll = useCallback(() => {
    setVisibleStatuses(new Set([ALL_STATUSES[0]]));
  }, []);

  return {
    allStatuses: ALL_STATUSES,
    visibleStatuses,
    toggleStatus,
    showAll,
    hideAll,
  };
}
