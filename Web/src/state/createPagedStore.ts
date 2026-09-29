import { create } from "zustand";
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
}

export interface PagedState<T, F> {
  query: PagedQuery<F>;
  rows: T[];
  total: number;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  setPage: (page: number, pageSize: number) => void;
  setSearch: (search: string) => void;
  setFilters: (filters: Partial<F>) => void;
  clearFilters: () => void;
  clearError: () => void;
  reset: () => void;
}

export type PageFetcher<T, F> = (query: PagedQuery<F>) => Promise<Page<T>>;

export function pageWindow(query: PagedQuery<unknown>): PageWindow {
  return { offset: query.page * query.pageSize, limit: query.pageSize };
}

// One web table's query and page; the query survives leaving the page.
export function createPagedStore<T, F>(fetchPage: PageFetcher<T, F>, filters: F) {
  const initialQuery: PagedQuery<F> = {
    page: 0,
    pageSize: DEFAULT_PAGE_SIZE,
    search: "",
    filters,
  };
  let latestRequest = 0;

  return create<PagedState<T, F>>()((set, get) => ({
    query: initialQuery,
    rows: [],
    total: 0,
    loaded: false,
    loading: false,
    error: null,

    load: async () => {
      const request = ++latestRequest;
      const epoch = currentDataEpoch();
      const { query } = get();
      set({ loading: true, error: null });
      try {
        const page = await fetchPage(query);
        if (request !== latestRequest || isStaleEpoch(epoch)) return;
        if (page.rows.length === 0 && page.total > 0 && query.page > 0) {
          const lastPage = Math.ceil(page.total / query.pageSize) - 1;
          set({ query: { ...query, page: lastPage } });
          await get().load();
          return;
        }
        set({ rows: page.rows, total: page.total, loaded: true, loading: false });
      } catch (e) {
        if (request !== latestRequest || isStaleEpoch(epoch)) return;
        set({ error: (e as Error).message, loading: false });
      }
    },

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
        loaded: false,
        loading: false,
        error: null,
      });
    },
  }));
}
