import { useCallback, useState } from "react";

export interface UseSelectionResult {
  active: boolean;
  selectedIds: ReadonlySet<string>;
  count: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  toggleMany: (ids: string[]) => void;
  enterWith: (ids: string | string[]) => void;
  clear: () => void;
}

// Ephemeral screen state; `active` is the set size, so it can never desync.
export function useSelection(): UseSelectionResult {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set<string>(),
  );

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  );

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleMany = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const enterWith = useCallback((ids: string | string[]) => {
    setSelectedIds(new Set<string>(Array.isArray(ids) ? ids : [ids]));
  }, []);

  const clear = useCallback(() => {
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set<string>()));
  }, []);

  return {
    active: selectedIds.size > 0,
    selectedIds,
    count: selectedIds.size,
    isSelected,
    toggle,
    toggleMany,
    enterWith,
    clear,
  };
}
