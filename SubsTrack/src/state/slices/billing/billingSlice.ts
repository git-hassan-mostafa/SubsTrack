import type { StateCreator } from "zustand";
import type { CustomerRequest } from "@/src/core/types";
import billingService from "@/src/modules/admin/billing/services/BillingService";
import { AllowanceFloorError } from "@/src/modules/admin/billing/utils/allowanceFloorError";
import type { QuotaExceededError } from "@/src/modules/admin/billing/utils/quotaError";
import type {
  AllowanceFloorPayload,
  QuotaErrorPayload,
  QuotaPair,
} from "@/src/modules/admin/billing/utils/types";
import customerService from "@/src/modules/customer/customers/services/CustomerService";
import customerPlanService from "@/src/modules/customer/customer-plans/services/CustomerPlanService";
import type { GlobalState } from "@/src/state/globalStore";

const NO_QUOTA: QuotaPair = { customers: 0, plans: 0 };

export interface BillingSlice {
  limits: QuotaPair;
  active: QuotaPair;
  pricePerPlanUsd: number;
  request: CustomerRequest | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  floorError: AllowanceFloorPayload | null;
  quotaError: QuotaErrorPayload | null;
  init: (tenantId: string) => Promise<void>;
  refreshCounts: () => Promise<void>;
  refreshRequest: (tenantId: string) => Promise<void>;
  bumpActive: (delta: Partial<QuotaPair>) => void;
  lowerAllowances: (next: QuotaPair) => Promise<boolean>;
  requestMore: (
    tenantId: string,
    extra: QuotaPair,
    userId: string | null,
  ) => Promise<boolean>;
  editRequest: (extra: QuotaPair) => Promise<boolean>;
  cancelRequest: () => Promise<boolean>;
  setQuotaError: (e: QuotaExceededError) => void;
  clearQuotaError: () => void;
  clearError: () => void;
  reset: () => void;
}

export const createBillingSlice: StateCreator<
  GlobalState,
  [["zustand/immer", never]],
  [],
  BillingSlice
> = (set, get) => ({
  limits: NO_QUOTA,
  active: NO_QUOTA,
  pricePerPlanUsd: 0,
  request: null,
  loading: false,
  saving: false,
  error: null,
  floorError: null,
  quotaError: null,

  // The limits and price ride in on the auth-time tenant row; only the counts
  // and the request need the network.
  init: async (tenantId) => {
    const tenant = get().auth.user?.tenant;
    set((state) => {
      state.billing.limits = {
        customers: tenant?.customerAllowance ?? 0,
        plans: tenant?.planAllowance ?? 0,
      };
      state.billing.pricePerPlanUsd = tenant?.pricePerPlanUsd ?? 0;
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
      const [customers, plans] = await Promise.all([
        customerService.countActive(null),
        customerPlanService.countActive(),
      ]);
      set((state) => {
        state.billing.active = { customers, plans };
      });
    } catch (e) {
      console.warn("[billingSlice] refreshCounts failed", e);
    }
  },

  // Offline this throws RequiresConnectionError; the card keeps showing the
  // local limits and counts rather than surfacing a scary banner.
  refreshRequest: async (tenantId) => {
    try {
      const request = await billingService.getLatestRequest(tenantId);
      set((state) => {
        state.billing.request = request;
      });
    } catch (e) {
      console.warn("[billingSlice] refreshRequest failed", e);
    }
  },

  // Every write moves the counts by a delta, never to an absolute — only
  // refreshCounts knows the true figure.
  bumpActive: (delta) =>
    set((state) => {
      const { customers, plans } = state.billing.active;
      state.billing.active = {
        customers: Math.max(0, customers + (delta.customers ?? 0)),
        plans: Math.max(0, plans + (delta.plans ?? 0)),
      };
    }),

  // Patches the auth tenant too — billing.init re-reads it on every session
  // restore, so a stale copy there would undo the change on next launch.
  lowerAllowances: async (next) => {
    const { limits, active } = get().billing;
    set((state) => {
      state.billing.saving = true;
      state.billing.error = null;
      state.billing.floorError = null;
    });
    try {
      const tenant = await billingService.lowerAllowances(next, limits, active);
      set((state) => {
        state.billing.limits = {
          customers: tenant.customerAllowance,
          plans: tenant.planAllowance,
        };
        state.billing.saving = false;
        if (state.auth.user) {
          state.auth.user.tenant.customerAllowance = tenant.customerAllowance;
          state.auth.user.tenant.planAllowance = tenant.planAllowance;
        }
      });
      return true;
    } catch (e) {
      set((state) => {
        if (e instanceof AllowanceFloorError) {
          state.billing.floorError = {
            kind: e.kind,
            requested: e.requested,
            activeCount: e.activeCount,
          };
        }
        state.billing.error = (e as Error).message;
        state.billing.saving = false;
      });
      return false;
    }
  },

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

  // Both writers of a quota — the customer create and the line sync — land
  // here, so one modal answers for both limits.
  setQuotaError: (e) =>
    set((state) => {
      state.billing.quotaError = {
        kind: e.kind,
        limit: e.limit,
        activeCount: e.activeCount,
      };
    }),

  clearQuotaError: () =>
    set((state) => {
      state.billing.quotaError = null;
    }),

  clearError: () =>
    set((state) => {
      state.billing.error = null;
      state.billing.floorError = null;
    }),

  reset: () =>
    set((state) => {
      state.billing.limits = NO_QUOTA;
      state.billing.active = NO_QUOTA;
      state.billing.pricePerPlanUsd = 0;
      state.billing.request = null;
      state.billing.loading = false;
      state.billing.saving = false;
      state.billing.error = null;
      state.billing.floorError = null;
      state.billing.quotaError = null;
    }),
});
