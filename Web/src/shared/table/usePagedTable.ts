import { useCallback, useEffect } from "react";
import { useStore } from "zustand";
import type { BranchFilter } from "@shared/core/constants";
import type { PagedStore } from "@/state/createPagedStore";

// `paused` holds a stale re-read until the page's own write loop has finished.
export function usePagedTable<T extends { id: string }, F, M>(
  table: PagedStore<T, F, M>,
  branch: BranchFilter = null,
  paused = false,
) {
  const rows = useStore(table, (s) => s.rows);
  const total = useStore(table, (s) => s.total);
  const meta = useStore(table, (s) => s.meta);
  const loaded = useStore(table, (s) => s.loaded);
  const loading = useStore(table, (s) => s.loading);
  const stale = useStore(table, (s) => s.stale);
  const error = useStore(table, (s) => s.error);
  const query = useStore(table, (s) => s.query);
  const load = useStore(table, (s) => s.load);
  const open = useStore(table, (s) => s.open);
  const refreshIfStale = useStore(table, (s) => s.refreshIfStale);
  const patchRow = useStore(table, (s) => s.patchRow);
  const addRow = useStore(table, (s) => s.addRow);
  const markStale = useStore(table, (s) => s.markStale);
  const setPage = useStore(table, (s) => s.setPage);
  const setSearch = useStore(table, (s) => s.setSearch);
  const setFilters = useStore(table, (s) => s.setFilters);
  const clearFilters = useStore(table, (s) => s.clearFilters);
  const clearError = useStore(table, (s) => s.clearError);

  useEffect(() => {
    void open(branch);
  }, [open, branch]);

  useEffect(() => {
    if (stale && !loading && !paused) void refreshIfStale();
  }, [refreshIfStale, stale, loading, paused]);

  const reload = useCallback(() => void load(), [load]);

  return {
    query,
    meta,
    reload,
    patchRow,
    addRow,
    markStale,
    setFilters,
    search: { value: query.search, onSearch: setSearch },
    tableProps: {
      rows,
      total,
      loaded,
      loading,
      page: query.page,
      pageSize: query.pageSize,
      onPageChange: setPage,
      onClearFilters: clearFilters,
      error,
      onDismissError: clearError,
      onReload: reload,
    },
  };
}
