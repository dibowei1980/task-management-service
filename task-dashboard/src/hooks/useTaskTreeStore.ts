import { useState, useCallback } from 'react';

const STORAGE_KEY_EXPANDED = 'tms_tree_expanded';
const STORAGE_KEY_SELECTED = 'tms_tree_selected';

const loadExpandedIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EXPANDED);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch (error) {
    void error;
    return new Set();
  }
};

const loadSelectedNodeId = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY_SELECTED);
  } catch (error) {
    void error;
    return null;
  }
};

const saveToStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    void error;
  }
};

export function useTaskTreeStore(rootProjectId: string | null) {
  void rootProjectId;
  const [expandedIds, setExpandedIds] = useState<Set<string>>(loadExpandedIds);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(loadSelectedNodeId);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      saveToStorage(STORAGE_KEY_EXPANDED, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const expandAll = useCallback((expandableIds: Set<string>) => {
    setExpandedIds(expandableIds);
    saveToStorage(STORAGE_KEY_EXPANDED, JSON.stringify([...expandableIds]));
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
    saveToStorage(STORAGE_KEY_EXPANDED, JSON.stringify([]));
  }, []);

  const selectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
    if (id) {
      saveToStorage(STORAGE_KEY_SELECTED, id);
    } else {
      try {
        localStorage.removeItem(STORAGE_KEY_SELECTED);
      } catch (error) {
        void error;
      }
    }
  }, []);

  const ensureExpanded = useCallback((ids: string[]) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      let changed = false;
      ids.forEach(id => {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      });
      if (changed) {
        saveToStorage(STORAGE_KEY_EXPANDED, JSON.stringify([...next]));
      }
      return changed ? next : prev;
    });
  }, []);

  const isExpanded = useCallback((id: string) => {
    return expandedIds.has(id);
  }, [expandedIds]);

  return {
    expandedIds,
    selectedNodeId,
    searchQuery,
    toggleExpand,
    expandAll,
    collapseAll,
    ensureExpanded,
    selectNode,
    isExpanded,
    setSearchQuery,
  };
}
