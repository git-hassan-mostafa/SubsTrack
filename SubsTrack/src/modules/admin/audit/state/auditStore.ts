import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  AuditAction,
  AuditEntry,
  AuditFilter,
  AuditSource,
  AuditTable,
} from '@/src/core/types';
// Deep import (not the module barrel) — the barrel re-exports screens.
import auditService from '@/src/modules/admin/audit/services/AuditService';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import { getStore } from '@/src/state/globalStore';

// A MODULE store, not a global slice: only the audit screen reads it, and no
// slice reads it back. Holds the screen's FILTER SESSION (it survives
// navigation); one record's timeline stays in the useRecordHistory hooks.
// See CLAUDE.md → State Management.

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
export interface AuditState {
  items: AuditEntry[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  // Bumped on every filter change so a slow in-flight fetch can't overwrite the
  // results of a newer one.
  searchToken: number;
  /** Where the loaded entries came from — reported, never chosen. */
  source: AuditSource;
  tableFilter: AuditTable | null;
  actionFilter: AuditAction | null;
  actorFilter: string | null;
  from: string | null;
  to: string | null;
  fetchEntries: () => Promise<void>;
  refetchForBranch: () => Promise<void>;
  fetchMoreEntries: () => Promise<void>;
  setTableFilter: (table: AuditTable | null) => Promise<void>;
  setActionFilter: (action: AuditAction | null) => Promise<void>;
  setActorFilter: (userId: string | null) => Promise<void>;
  setFrom: (date: string | null) => Promise<void>;
  setTo: (date: string | null) => Promise<void>;
  clearFilters: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

function buildFilter(
  state: AuditState,
  branchFilter: ReturnType<typeof resolveBranchFilter>,
): AuditFilter {
  return {
    table: state.tableFilter ?? undefined,
    action: state.actionFilter ?? undefined,
    actorUserId: state.actorFilter ?? undefined,
    // Day bounds → timestamp bounds, so `to` covers its whole day.
    from: state.from ? `${state.from}T00:00:00.000Z` : undefined,
    to: state.to ? `${state.to}T23:59:59.999Z` : undefined,
    branchFilter,
  };
}

export const useAuditStore = create<AuditState>()(
  immer((set, get) => {
    // Every filter change resets paging identically; one helper keeps the six
    // setters honest.
    const invalidate = (mutate: (s: AuditState) => void): void =>
      set((state) => {
        mutate(state);
        state.searchToken += 1;
        state.page = 0;
        state.items = [];
        state.hasMore = true;
      });

    return {
      items: [],
      page: 0,
      hasMore: true,
      loading: false,
      loadingMore: false,
      error: null,
      searchToken: 0,
      source: 'server',
      tableFilter: null,
      actionFilter: null,
      actorFilter: null,
      from: null,
      to: null,

      fetchEntries: async () => {
        const token = get().searchToken;
        const branchFilter = resolveBranchFilter(getStore().getState().auth.user);
        set((state) => {
          state.loading = true;
          state.error = null;
          state.page = 0;
        });
        try {
          const { entries, source, hasMore } = await auditService.getEntries(
            buildFilter(get(), branchFilter),
            0,
          );
          if (get().searchToken !== token) return;
          set((state) => {
            state.items = entries;
            state.source = source;
            state.hasMore = hasMore;
            state.page = 0;
            state.loading = false;
          });
        } catch (e) {
          if (get().searchToken !== token) return;
          set((state) => {
            state.error = (e as Error).message;
            state.loading = false;
          });
        }
      },

      // The branch chip changes the query just like a filter does, so it must
      // invalidate the same way. Without the token bump the in-flight fetch for
      // the OLD branch stays valid and can land last, overwriting the new rows.
      refetchForBranch: async () => {
        invalidate(() => {});
        await get().fetchEntries();
      },

      fetchMoreEntries: async () => {
        const { loadingMore, hasMore, page, searchToken } = get();
        if (loadingMore || !hasMore) return;
        const branchFilter = resolveBranchFilter(getStore().getState().auth.user);
        set((state) => {
          state.loadingMore = true;
        });
        try {
          const nextPage = page + 1;
          const result = await auditService.getEntries(
            buildFilter(get(), branchFilter),
            nextPage,
          );
          if (get().searchToken !== searchToken) {
            set((state) => {
              state.loadingMore = false;
            });
            return;
          }
          set((state) => {
            state.items.push(...result.entries);
            // The connection can drop between pages, so the note follows the last
            // page that actually landed.
            state.source = result.source;
            state.hasMore = result.hasMore;
            state.page = nextPage;
            state.loadingMore = false;
          });
        } catch (e) {
          if (get().searchToken !== searchToken) {
            set((state) => {
              state.loadingMore = false;
            });
            return;
          }
          set((state) => {
            state.error = (e as Error).message;
            state.loadingMore = false;
          });
        }
      },

      setTableFilter: async (table) => {
        if (get().tableFilter === table) return;
        invalidate((s) => {
          s.tableFilter = table;
        });
        await get().fetchEntries();
      },

      setActionFilter: async (action) => {
        if (get().actionFilter === action) return;
        invalidate((s) => {
          s.actionFilter = action;
        });
        await get().fetchEntries();
      },

      setActorFilter: async (userId) => {
        if (get().actorFilter === userId) return;
        invalidate((s) => {
          s.actorFilter = userId;
        });
        await get().fetchEntries();
      },

      setFrom: async (date) => {
        if (get().from === date) return;
        invalidate((s) => {
          s.from = date;
        });
        await get().fetchEntries();
      },

      setTo: async (date) => {
        if (get().to === date) return;
        invalidate((s) => {
          s.to = date;
        });
        await get().fetchEntries();
      },

      clearFilters: async () => {
        invalidate((s) => {
          s.tableFilter = null;
          s.actionFilter = null;
          s.actorFilter = null;
          s.from = null;
          s.to = null;
        });
        await get().fetchEntries();
      },

      clearError: () =>
        set((state) => {
          state.error = null;
        }),

      reset: () =>
        set((state) => {
          state.items = [];
          state.page = 0;
          state.hasMore = true;
          state.loading = false;
          state.loadingMore = false;
          state.error = null;
          state.searchToken += 1;
          state.source = 'server';
          state.tableFilter = null;
          state.actionFilter = null;
          state.actorFilter = null;
          state.from = null;
          state.to = null;
        }),
    };
  }),
);
