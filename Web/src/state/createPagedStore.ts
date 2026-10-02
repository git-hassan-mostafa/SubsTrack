import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { BranchFilter } from "@shared/core/constants";
import type { Page, PageWindow } from "@shared/core/types";
import { currentDataEpoch, isStaleEpoch } from "@shared/shared/lib/dataEpoch";

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [25, 50, 100];
export const EXPORT_PAGE_SIZE = 500;

export interface PagedQuery<F> {
  page: number;
  pageSize: number;
  search: string;
  filters: F;
  branch: BranchFilter;
}

export interface PagedState<T, F, M = undefined> {
  query: PagedQuery<F>;
  rows: T[];
  total: number;
  meta: M;
  loaded: boolean;
  loading: boolean;
  stale: boolean;
  error: string | null;
  load: () => Promise<void>;
  open: (branch?: BranchFilter) => Promise<void>;
  markStale: () => void;
  refreshIfStale: () => Promise<void>;
  patchRow: (row: T) => RowPatch;
  addRow: (row: T) => RowPatch;
  setMeta: (meta: M) => void;
  setPage: (page: number, pageSize: number) => void;
  setSearch: (search: string) => void;
  setFilters: (filters: Partial<F>) => void;
  clearFilters: () => void;
  clearError: () => void;
  reset: () => void;
}

export type PagedResult<T, M> = Page<T> & { meta: M };

export type PagedStore<T, F, M = undefined> = UseBoundStore<StoreApi<PagedState<T, F, M>>>;

// Live money in the whole filter, not the page; null while only voids are shown.
export type PeriodTotal = number | null;

export type PageFetcher<T, F, M> = (query: PagedQuery<F>) => Promise<PagedResult<T, M>>;

export type RowPatch = "patched" | "added" | "stale" | "skipped";

// true = belongs, false = left the query, null = only the server can tell.
export type RowFit<T, F> = (row: T, query: PagedQuery<F>) => boolean | null;

// Audit and money received have no stale signal yet: they re-read on open.
export interface PagedStoreOptions<T, F> {
  rereadOnOpen?: boolean;
  fits?: RowFit<T, F>;
}

export function pageWindow(query: PagedQuery<unknown>): PageWindow {
  return { offset: query.page * query.pageSize, limit: query.pageSize };
}

// One web table's query and its rows; both survive leaving the page.
export function createPagedStore<T extends { id: string }, F>(
  fetchPage: (query: PagedQuery<F>) => Promise<Page<T>>,
  filters: F,
  options: PagedStoreOptions<T, F> = {},
) {
  return createPagedStoreWithMeta<T, F, undefined>(
    async (query) => ({ ...(await fetchPage(query)), meta: undefined }),
    filters,
    undefined,
    options,
  );
}

// `meta` rides with each page (the customer tab counts) and is reset with it.
export function createPagedStoreWithMeta<T extends { id: string }, F, M>(
  fetchPage: PageFetcher<T, F, M>,
  filters: F,
  initialMeta: M,
  { rereadOnOpen = false, fits }: PagedStoreOptions<T, F> = {},
) {
  const initialQuery: PagedQuery<F> = {
    page: 0,
    pageSize: DEFAULT_PAGE_SIZE,
    search: "",
    filters,
    branch: null,
  };
  let latestRequest = 0;

  const fitOf = (row: T, query: PagedQuery<F>): boolean | null => {
    if (query.search !== "") return null;
    if (fits) return fits(row, query);
    return query.branch === null && sameFilters(query.filters, filters) ? true : null;
  };

  return create<PagedState<T, F, M>>()((set, get) => ({
    query: initialQuery,
    rows: [],
    total: 0,
    meta: initialMeta,
    loaded: false,
    loading: false,
    stale: false,
    error: null,

    load: async () => {
      const request = ++latestRequest;
      const epoch = currentDataEpoch();
      const { query } = get();
      set({ loading: true, stale: false, error: null });
      try {
        const page = await fetchPage(query);
        if (request !== latestRequest || isStaleEpoch(epoch)) return;
        if (page.rows.length === 0 && page.total > 0 && query.page > 0) {
          const lastPage = Math.ceil(page.total / query.pageSize) - 1;
          set({ query: { ...query, page: lastPage } });
          await get().load();
          return;
        }
        set({
          rows: page.rows,
          total: page.total,
          meta: page.meta,
          loaded: true,
          loading: false,
        });
      } catch (e) {
        if (request !== latestRequest || isStaleEpoch(epoch)) return;
        set({ error: (e as Error).message, loading: false });
      }
    },

    open: (branch = null) => {
      const { query, loaded, stale } = get();
      if (branch !== query.branch) {
        set({ query: { ...query, branch, page: 0 } });
        return get().load();
      }
      if (loaded && !stale && !rereadOnOpen) return Promise.resolve();
      return get().load();
    },

    markStale: () => {
      const { loaded, loading } = get();
      if (loaded || loading) set({ stale: true });
    },

    refreshIfStale: () => {
      const { stale, loading } = get();
      return stale && !loading ? get().load() : Promise.resolve();
    },

    patchRow: (row) => {
      const { rows, loaded, query, markStale } = get();
      if (!loaded) return "skipped";
      const shown = rows.some((current) => current.id === row.id);
      const fit = fitOf(row, query);
      if (fit === false && !shown) return "skipped";
      if (fit !== true || !shown) {
        markStale();
        return "stale";
      }
      set({ rows: rows.map((current) => (current.id === row.id ? row : current)) });
      return "patched";
    },

    addRow: (row) => {
      const { rows, total, loaded, query, markStale } = get();
      if (!loaded) return "skipped";
      if (rows.some((current) => current.id === row.id)) return get().patchRow(row);
      const fit = fitOf(row, query);
      if (fit === false) return "skipped";
      if (fit === null || query.page > 0) {
        markStale();
        return "stale";
      }
      set({ rows: [row, ...rows].slice(0, query.pageSize), total: total + 1 });
      return "added";
    },

    setMeta: (meta) => set({ meta }),

    setPage: (page, pageSize) => {
      const { query } = get();
      const nextPage = pageSize === query.pageSize ? page : 0;
      set({ query: { ...query, page: nextPage, pageSize } });
      void get().load();
    },

    setSearch: (search) => {
      const { query } = get();
      if (search === query.search) return;
      set({ query: { ...query, search, page: 0 } });
      void get().load();
    },

    setFilters: (next) => {
      const { query } = get();
      set({ query: { ...query, filters: { ...query.filters, ...next }, page: 0 } });
      void get().load();
    },

    clearFilters: () => {
      const { query } = get();
      set({ query: { ...query, search: "", filters, page: 0 } });
      void get().load();
    },

    clearError: () => set({ error: null }),

    reset: () => {
      latestRequest += 1;
      set({
        query: initialQuery,
        rows: [],
        total: 0,
        meta: initialMeta,
        loaded: false,
        loading: false,
        stale: false,
        error: null,
      });
    },
  }));
}

function sameFilters<F>(a: F, b: F): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key]);
}
