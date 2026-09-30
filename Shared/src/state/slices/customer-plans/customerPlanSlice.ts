import type { StateCreator } from "zustand";
import type { Customer } from "@shared/core/types";
import customerPlanService from "@shared/modules/customer/customer-plans/services/CustomerPlanService";
import type { LineDraft, RemovedLine } from "@shared/modules/customer/customer-plans/services/CustomerPlanService";
import { QuotaExceededError } from "@shared/modules/admin/billing/utils/quotaError";
import type { GlobalState } from "@shared/state/globalStore";

// The caller hands in the customer as saved, so the gates see its real lines.
export interface CustomerPlanSlice {
  loading: boolean;
  error: string | null;
  syncLines: (
    customer: Pick<Customer, "id" | "customerPlans">,
    lines: LineDraft[],
    removed: RemovedLine[],
    reactivated: string[],
    tenantId: string,
  ) => Promise<boolean>;
  hasPayments: (lineId: string) => Promise<boolean>;
  getPaidLineIds: (customerId: string) => Promise<string[]>;
  clearError: () => void;
  reset: () => void;
}

export const createCustomerPlanSlice: StateCreator<
  GlobalState,
  [["zustand/immer", never]],
  [],
  CustomerPlanSlice
> = (set, get) => ({
  loading: false,
  error: null,

  syncLines: async (customer, lines, removed, reactivated, tenantId) => {
    if (get().customerPlans.loading) return false;
    const customerId = customer.id;
    const { limits, active: activeCounts } = get().billing;
    get().billing.clearQuotaError();
    set((state) => {
      state.customerPlans.loading = true;
      state.customerPlans.error = null;
    });
    try {
      const existing = customer.customerPlans ?? [];
      const existingActive = existing.filter((l) => l.active);
      const { active, cancelled } = await customerPlanService.syncLines(
        customerId,
        lines,
        removed,
        reactivated,
        tenantId,
        existingActive,
        limits,
        activeCounts,
      );
      const reactivatedSet = new Set(reactivated);
      const removedSet = new Set(removed.map((r) => r.id));
      const keptCancelled = existing.filter(
        (l) => !l.active && !reactivatedSet.has(l.id) && !removedSet.has(l.id),
      );
      get().customers.setCustomerLines(customerId, [
        ...active,
        ...cancelled,
        ...keptCancelled,
      ]);
      set((state) => {
        state.customerPlans.loading = false;
      });
      get().billing.bumpActive({ plans: lines.length - existingActive.length });
      return true;
    } catch (e) {
      if (e instanceof QuotaExceededError) get().billing.setQuotaError(e);
      set((state) => {
        state.customerPlans.error =
          e instanceof QuotaExceededError ? null : (e as Error).message;
        state.customerPlans.loading = false;
      });
      return false;
    }
  },

  hasPayments: (lineId) => customerPlanService.hasPayments(lineId),

  getPaidLineIds: (customerId) =>
    customerPlanService.getPaidLineIds(customerId),

  clearError: () =>
    set((state) => {
      state.customerPlans.error = null;
    }),
  reset: () =>
    set((state) => {
      state.customerPlans.loading = false;
      state.customerPlans.error = null;
    }),
});
