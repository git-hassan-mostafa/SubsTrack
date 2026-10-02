import { useEffect } from "react";
import { useStore } from "zustand";
import type { BranchFilter } from "@shared/core/constants";
import type { PagedStore } from "@/state/createPagedStore";

// `paused` holds a stale re-read until the page's own write loop has finished.
export function useOpenPagedTable<T, F, M>(
  table: PagedStore<T, F, M>,
  branch: BranchFilter,
  paused = false,
): void {
  const open = useStore(table, (s) => s.open);
  const refreshIfStale = useStore(table, (s) => s.refreshIfStale);
  const stale = useStore(table, (s) => s.stale);
  const loading = useStore(table, (s) => s.loading);

  useEffect(() => {
    void open(branch);
  }, [open, branch]);

  useEffect(() => {
    if (stale && !loading && !paused) void refreshIfStale();
  }, [refreshIfStale, stale, loading, paused]);
}
