import type { StateCreator } from 'zustand';
import type { CustomerRequest } from '@/src/core/types';
import billingService from '@/src/modules/admin/billing/services/BillingService';
import customerService from '@/src/modules/customer/customers/services/CustomerService';
import type { GlobalState } from '@/src/state/globalStore';

export interface BillingSlice {
  allowance: number;
  pricePerCustomerUsd: number;
  activeCustomers: number;
  request: CustomerRequest | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  init: (tenantId: string) => Promise<void>;
  refreshCounts: () => Promise<void>;
  refreshRequest: (tenantId: string) => Promise<void>;
  setActiveCustomers: (count: number) => void;
  requestMore: (tenantId: string, extra: number, userId: string | null) => Promise<boolean>;
  editRequest: (extra: number) => Promise<boolean>;
  cancelRequest: () => Promise<boolean>;
  clearError: () => void;
  reset: () => void;
}

export const createBillingSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  BillingSlice
> = (set, get) => ({
  allowance: 0,
  pricePerCustomerUsd: 0,
  activeCustomers: 0,
  request: null,
  loading: false,
  saving: false,
  error: null,

  // The allowance and price ride in on the auth-time tenant row; only the
  // count and the request need the network.
  init: async (tenantId) => {
    const tenant = get().auth.user?.tenant;
    set((state) => {
      state.billing.allowance = tenant?.customerAllowance ?? 0;
      state.billing.pricePerCustomerUsd = tenant?.pricePerCustomerUsd ?? 0;
      state.billing.loading = true;
      state.billing.error = null;
    });
    await Promise.all([
      get().billing.refreshCounts(),
      get().billing.refreshRequest(tenantId),
    ]);
    set((state) => {
      state.billing.loading = false;
    });
  },

  refreshCounts: async () => {
    try {
      const activeCustomers = await customerService.countActive(null);
      set((state) => {
        state.billing.activeCustomers = activeCustomers;
      });
    } catch (e) {
      console.warn('[billingSlice] refreshCounts failed', e);
    }
  },

  // Offline this throws RequiresConnectionError; the card keeps showing the
  // local allowance and count rather than surfacing a scary banner.
  refreshRequest: async (tenantId) => {
    try {
      const request = await billingService.getLatestRequest(tenantId);
      set((state) => {
        state.billing.request = request;
      });
    } catch (e) {
      console.warn('[billingSlice] refreshRequest failed', e);
    }
  },

  setActiveCustomers: (count) =>
    set((state) => {
      state.billing.activeCustomers = Math.max(0, count);
    }),

  requestMore: async (tenantId, extra, userId) => {
    set((state) => {
      state.billing.saving = true;
      state.billing.error = null;
    });
    try {
      const request = await billingService.requestMore(tenantId, extra, userId);
      set((state) => {
        state.billing.request = request;
        state.billing.saving = false;
      });
      return true;
    } catch (e) {
      set((state) => {
        state.billing.error = (e as Error).message;
        state.billing.saving = false;
      });
      return false;
    }
  },

  editRequest: async (extra) => {
    const current = get().billing.request;
    if (!current) return false;
    set((state) => {
      state.billing.saving = true;
      state.billing.error = null;
    });
    try {
      const request = await billingService.editRequest(current.id, extra);
      set((state) => {
        state.billing.request = request;
        state.billing.saving = false;
      });
      return true;
    } catch (e) {
      set((state) => {
        state.billing.error = (e as Error).message;
        state.billing.saving = false;
      });
      return false;
    }
  },

  cancelRequest: async () => {
    const current = get().billing.request;
    if (!current) return false;
    set((state) => {
      state.billing.saving = true;
      state.billing.error = null;
    });
    try {
      const request = await billingService.cancelRequest(current.id);
      set((state) => {
        state.billing.request = request;
        state.billing.saving = false;
      });
      return true;
    } catch (e) {
      set((state) => {
        state.billing.error = (e as Error).message;
        state.billing.saving = false;
      });
      return false;
    }
  },

  clearError: () =>
    set((state) => {
      state.billing.error = null;
    }),

  reset: () =>
    set((state) => {
      state.billing.allowance = 0;
      state.billing.pricePerCustomerUsd = 0;
      state.billing.activeCustomers = 0;
      state.billing.request = null;
      state.billing.loading = false;
      state.billing.saving = false;
      state.billing.error = null;
    }),
});
