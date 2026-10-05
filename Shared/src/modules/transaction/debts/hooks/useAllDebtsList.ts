import { useCallback, useMemo, useState } from "react";
import type { BranchFilter } from "@shared/core/constants";
import type { DebtsView } from "@shared/core/types";
import { useDebounce } from "@shared/shared/hooks/useDebounce";
import {
  DEFAULT_ALL_DEBTS_FILTERS,
  filterAndSortDebts,
  hasActiveAllDebtsFilters,
  selectAllDebts,
  totalUsdOf,
  type AllDebtsFilters,
} from "../utils/allDebtsFilter";
import { useAllWrittenOffDebts } from "./useAllWrittenOffDebts";
import type { DebtScope } from "./useWrittenOffDebts";

interface AllDebtsListOptions {
  debounceSearch?: boolean;
}

// Reads the view the caller holds, never queries, so its totals always agree.
export function useAllDebtsList(
  view: DebtsView | null,
  branchFilter: BranchFilter,
  { debounceSearch = false }: AllDebtsListOptions = {},
) {
  const [filters, setFilters] = useState<AllDebtsFilters>(DEFAULT_ALL_DEBTS_FILTERS);
  const [scope, setScope] = useState<DebtScope>("live");
  const debouncedSearch = useDebounce(filters.search);
  const search = debounceSearch ? debouncedSearch : filters.search;
  const showingWrittenOff = scope === "written_off";
  const writtenOff = useAllWrittenOffDebts(branchFilter);

  const active = useMemo(
    () => ({ ...filters, search, status: showingWrittenOff ? null : filters.status }),
    [filters, search, showingWrittenOff],
  );
  const rows = useMemo(
    () =>
      showingWrittenOff
        ? filterAndSortDebts(writtenOff.items, active)
        : selectAllDebts(view, active),
    [showingWrittenOff, writtenOff.items, view, active],
  );

  const patch = useCallback(
    (next: Partial<AllDebtsFilters>) => setFilters((prev) => ({ ...prev, ...next })),
    [],
  );
  const setSearch = useCallback(
    (text: string) => setFilters((prev) => (prev.search === text ? prev : { ...prev, search: text })),
    [],
  );
  const clearAll = useCallback(() => {
    setFilters(DEFAULT_ALL_DEBTS_FILTERS);
    setScope("live");
  }, []);

  return {
    filters,
    patch,
    setSearch,
    scope,
    setScope,
    showingWrittenOff,
    writtenOff,
    rows,
    totalUsd: totalUsdOf(rows),
    dirty: hasActiveAllDebtsFilters(active) || showingWrittenOff,
    clearAll,
  };
}
