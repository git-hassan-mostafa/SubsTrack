import type { StateCreator } from 'zustand';
import type { AuditAction, AuditEntry, AuditFilter, AuditTable } from '@/src/core/types';
// Deep import (not the module barrel) — the barrel re-exports screens.
import auditService, { auditPageSize } from '@/src/modules/admin/audit/services/AuditService';
import type { GlobalState } from '@/src/state/globalStore';

/**
 * 'local' — the device's rolling 30-day window; works offline.
 * 'full'  — the complete server-side history; needs a connection on native.
 */
export type AuditScope = 'local' | 'full';

/**
 * The admin Audit Log screen's filter session + paged results.
 *
 * Scope note: ONE record's timeline is deliberately NOT here — it lives in the
 * `useRecordHistory` hook, local to the sheet showing it. That state is per-record
 * and transient, and holding it in the store needed a second parallel set of fields
 * that two open sheets would overwrite. What IS here is the filter session, which
 * must survive navigating to an entry and back, and must be cleared on logout so a
 * previous tenant's entries can never appear.
 */
export interface AuditSlice {
  items: AuditEntry[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  // Bumped on every filter/scope change so a slow in-flight fetch can't
  // overwrite the results of a newer one.
  searchToken: number;
  scope: AuditScope;
  tableFilter: AuditTable | null;
  actionFilter: AuditAction | null;
  actorFilter: string | null;
  from: string | null;
  to: string | null;
  fetchEntries: () => Promise<void>;
  fetchMoreEntries: () => Promise<void>;
  setScope: (scope: AuditScope) => Promise<void>;
  setTableFilter: (table: AuditTable | null) => Promise<void>;
  setActionFilter: (action: AuditAction | null) => Promise<void>;
  setActorFilter: (userId: string | null) => Promise<void>;
  setFrom: (date: string | null) => Promise<void>;
  setTo: (date: string | null) => Promise<void>;
  clearFilters: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

function buildFilter(state: AuditSlice): AuditFilter {
  return {
    table: state.tableFilter ?? undefined,
    action: state.actionFilter ?? undefined,
    actorUserId: state.actorFilter ?? undefined,
    // Day bounds → timestamp bounds, so `to` covers its whole day.
    from: state.from ? `${state.from}T00:00:00.000Z` : undefined,
    to: state.to ? `${state.to}T23:59:59.999Z` : undefined,
  };
}

export const createAuditSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  AuditSlice
> = (set, get) => {
  // Every filter change resets paging identically; one helper keeps the six
  // setters honest.
  const invalidate = (mutate: (s: AuditSlice) => void): void =>
    set((state) => {
      mutate(state.audit);
      state.audit.searchToken += 1;
      state.audit.page = 0;
      state.audit.items = [];
      state.audit.hasMore = true;
    });

  return {
    items: [],
    page: 0,
    hasMore: true,
    loading: false,
    loadingMore: false,
    error: null,
    searchToken: 0,
    scope: 'local',
    tableFilter: null,
    actionFilter: null,
    actorFilter: null,
    from: null,
    to: null,

    fetchEntries: async () => {
      const token = get().audit.searchToken;
      set((state) => {
        state.audit.loading = true;
        state.audit.error = null;
        state.audit.page = 0;
      });
      try {
        const { scope } = get().audit;
        const items = await auditService.getEntries(buildFilter(get().audit), 0, scope);
        if (get().audit.searchToken !== token) return;
        set((state) => {
          state.audit.items = items;
          state.audit.hasMore = items.length === auditPageSize(scope);
          state.audit.page = 0;
          state.audit.loading = false;
        });
      } catch (e) {
        if (get().audit.searchToken !== token) return;
        set((state) => {
          state.audit.error = (e as Error).message;
          state.audit.loading = false;
        });
      }
    },

    fetchMoreEntries: async () => {
      const { loadingMore, hasMore, page, searchToken, scope } = get().audit;
      if (loadingMore || !hasMore) return;
      set((state) => {
        state.audit.loadingMore = true;
      });
      try {
        const nextPage = page + 1;
        const items = await auditService.getEntries(buildFilter(get().audit), nextPage, scope);
        if (get().audit.searchToken !== searchToken) {
          set((state) => {
            state.audit.loadingMore = false;
          });
          return;
        }
        set((state) => {
          state.audit.items.push(...items);
          state.audit.hasMore = items.length === auditPageSize(scope);
          state.audit.page = nextPage;
          state.audit.loadingMore = false;
        });
      } catch (e) {
        if (get().audit.searchToken !== searchToken) {
          set((state) => {
            state.audit.loadingMore = false;
          });
          return;
        }
        set((state) => {
          state.audit.error = (e as Error).message;
          state.audit.loadingMore = false;
        });
      }
    },

    setScope: async (scope) => {
      if (get().audit.scope === scope) return;
      invalidate((s) => {
        s.scope = scope;
      });
      await get().audit.fetchEntries();
    },

    setTableFilter: async (table) => {
      if (get().audit.tableFilter === table) return;
      invalidate((s) => {
        s.tableFilter = table;
      });
      await get().audit.fetchEntries();
    },

    setActionFilter: async (action) => {
      if (get().audit.actionFilter === action) return;
      invalidate((s) => {
        s.actionFilter = action;
      });
      await get().audit.fetchEntries();
    },

    setActorFilter: async (userId) => {
      if (get().audit.actorFilter === userId) return;
      invalidate((s) => {
        s.actorFilter = userId;
      });
      await get().audit.fetchEntries();
    },

    setFrom: async (date) => {
      if (get().audit.from === date) return;
      invalidate((s) => {
        s.from = date;
      });
      await get().audit.fetchEntries();
    },

    setTo: async (date) => {
      if (get().audit.to === date) return;
      invalidate((s) => {
        s.to = date;
      });
      await get().audit.fetchEntries();
    },

    clearFilters: async () => {
      invalidate((s) => {
        s.tableFilter = null;
        s.actionFilter = null;
        s.actorFilter = null;
        s.from = null;
        s.to = null;
      });
      await get().audit.fetchEntries();
    },

    clearError: () =>
      set((state) => {
        state.audit.error = null;
      }),

    reset: () =>
      set((state) => {
        state.audit.items = [];
        state.audit.page = 0;
        state.audit.hasMore = true;
        state.audit.loading = false;
        state.audit.loadingMore = false;
        state.audit.error = null;
        state.audit.searchToken += 1;
        state.audit.scope = 'local';
        state.audit.tableFilter = null;
        state.audit.actionFilter = null;
        state.audit.actorFilter = null;
        state.audit.from = null;
        state.audit.to = null;
      }),
  };
};
