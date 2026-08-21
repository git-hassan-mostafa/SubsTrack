import type { StateCreator } from 'zustand';
import type { Service } from '@/src/core/types';
import {
  serviceCatalogService,
  type ServiceInput,
} from '@/src/modules/admin/service-catalog';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import type { GlobalState } from '@/src/state/globalStore';

/**
 * The service price list. The products slice minus every stock action and minus
 * the tier gate — services are uncapped, so there is no `tierLimitError` here.
 * `createService` / `updateService` return the saved row so a caller that opened
 * the form from a sale line can select what it just created.
 */
export interface ServiceSlice {
  items: Service[];
  /**
   * A fetch has completed at least once. The "ensure loaded" guard keys off this,
   * NOT `items.length` — an empty result is a valid loaded state, and a length-based
   * guard re-queries on every caller (i.e. every sale-form open) for a tenant with
   * no rows.
   */
  loaded: boolean;
  loading: boolean;
  error: string | null;
  getServices: () => Promise<void>;
  fetchServices: () => Promise<void>;
  createService: (data: ServiceInput, tenantId: string) => Promise<Service | null>;
  updateService: (id: string, data: ServiceInput) => Promise<Service | null>;
  deleteService: (id: string) => Promise<'hard' | 'soft' | null>;
  bulkDeleteServices: (ids: string[]) => Promise<boolean>;
  reactivateService: (id: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const createServiceSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  ServiceSlice
> = (set, get) => ({
  items: [],
  loaded: false,
  loading: false,
  error: null,

  getServices: async () => {
    const { loaded, loading } = get().services;
    // Already loaded, or a fetch is already in flight — several components
    // mount-fetch the same slice in one tick (see docs/gotchas.md).
    if (loaded || loading) return;
    await get().services.fetchServices();
  },

  fetchServices: async () => {
    set((state) => {
      state.services.loading = true;
      state.services.error = null;
    });
    try {
      const branchFilter = resolveBranchFilter(get().auth.user);
      const items = await serviceCatalogService.getServices(branchFilter);
      set((state) => {
        state.services.items = items;
        state.services.loaded = true;
        state.services.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.services.error = (e as Error).message;
        state.services.loading = false;
      });
    }
  },

  createService: async (data, tenantId) => {
    set((state) => {
      state.services.loading = true;
      state.services.error = null;
    });
    try {
      const service = await serviceCatalogService.createService(data, tenantId);
      set((state) => {
        state.services.items.unshift(service);
        state.services.loading = false;
      });
      return service;
    } catch (e) {
      set((state) => {
        state.services.error = (e as Error).message;
        state.services.loading = false;
      });
      return null;
    }
  },

  updateService: async (id, data) => {
    set((state) => {
      state.services.loading = true;
      state.services.error = null;
    });
    try {
      const updated = await serviceCatalogService.updateService(id, data);
      set((state) => {
        const i = state.services.items.findIndex((s) => s.id === id);
        if (i !== -1) state.services.items[i] = updated;
        state.services.loading = false;
      });
      return updated;
    } catch (e) {
      set((state) => {
        state.services.error = (e as Error).message;
        state.services.loading = false;
      });
      return null;
    }
  },

  deleteService: async (id) => {
    set((state) => {
      state.services.loading = true;
      state.services.error = null;
    });
    try {
      const mode = await serviceCatalogService.deleteService(id);
      set((state) => {
        if (mode === 'hard') {
          state.services.items = state.services.items.filter((s) => s.id !== id);
        } else {
          const i = state.services.items.findIndex((s) => s.id === id);
          if (i !== -1) state.services.items[i].active = false;
        }
        state.services.loading = false;
      });
      return mode;
    } catch (e) {
      set((state) => {
        state.services.error = (e as Error).message;
        state.services.loading = false;
      });
      return null;
    }
  },

  bulkDeleteServices: async (ids) => {
    if (ids.length === 0) return true;
    set((state) => {
      state.services.loading = true;
      state.services.error = null;
    });
    try {
      const { hard, soft } = await serviceCatalogService.deleteManyServices(ids);
      set((state) => {
        const removed = new Set(hard);
        const softened = new Set(soft);
        state.services.items = state.services.items.filter((s) => !removed.has(s.id));
        for (const s of state.services.items) {
          if (softened.has(s.id)) s.active = false;
        }
        state.services.loading = false;
      });
      return true;
    } catch (e) {
      set((state) => {
        state.services.error = (e as Error).message;
        state.services.loading = false;
      });
      return false;
    }
  },

  reactivateService: async (id) => {
    set((state) => {
      state.services.loading = true;
      state.services.error = null;
    });
    try {
      const updated = await serviceCatalogService.reactivateService(id);
      set((state) => {
        const i = state.services.items.findIndex((s) => s.id === id);
        if (i !== -1) state.services.items[i] = updated;
        state.services.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.services.error = (e as Error).message;
        state.services.loading = false;
      });
    }
  },

  clearError: () =>
    set((state) => {
      state.services.error = null;
    }),
  reset: () =>
    set((state) => {
      state.services.items = [];
      state.services.loaded = false;
      state.services.loading = false;
      state.services.error = null;
    }),
});
