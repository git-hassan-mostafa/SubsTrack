import { useCallback, useState } from "react";
import { BackHandler } from "react-native";
import { useFocusEffect } from "expo-router";

export interface UseSelectionResult {
  /** Selection mode is on whenever at least one item is selected. */
  active: boolean;
  selectedIds: ReadonlySet<string>;
  count: number;
  isSelected: (id: string) => boolean;
  /** Add/remove an id. Removing the last id exits selection mode. */
  toggle: (id: string) => void;
  /**
   * Toggle a group of ids atomically: if every id is already selected they are
   * all removed, otherwise they are all added. Lets a multi-month block flip as
   * a single unit.
   */
  toggleMany: (ids: string[]) => void;
  /** Enter selection mode with one or more ids selected (long-press entry). */
  enterWith: (ids: string | string[]) => void;
  /** Exit selection mode and clear all selected ids. */
  clear: () => void;
}

/**
 * Reusable list multi-selection state. Pure, platform-agnostic, ephemeral UI
 * state — keep it in the screen (Presentation layer), not in a Zustand slice.
 *
 * `active` is derived from the set size so it can never desync from the
 * selection. Pair with {@link useSelectionBackHandler} on screen to make the
 * Android hardware back button exit selection mode.
 */
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

/**
 * While `active` and the screen is focused, the Android hardware back button
 * runs `onExit` (e.g. clear the selection) instead of navigating away.
 * No-op on iOS/web.
 */
export function useSelectionBackHandler(
  active: boolean,
  onExit: () => void,
): void {
  useFocusEffect(
    useCallback(() => {
      if (!active) return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        onExit();
        return true;
      });
      return () => sub.remove();
    }, [active, onExit]),
  );
}
