import type { StateCreator } from 'zustand';
import {
  customerPlanService,
  type LineDraft,
  type RemovedLine,
} from '@/src/modules/customer/customer-plans';
import type { GlobalState } from '@/src/state/globalStore';

// Thin slice for the customer form's inline Plans editor. Service lines are the
// source of truth on the Customer object (joined via customer_plans), so a sync
// patches that customer's lines through the customers slice — the detail screen +
// payment panel read from there and re-render automatically.
export interface CustomerPlanSlice {
  loading: boolean;
  error: string | null;
  syncLines: (
    customerId: string,
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
  [['zustand/immer', never]],
  [],
  CustomerPlanSlice
> = (set, get) => ({
  loading: false,
  error: null,

  syncLines: async (customerId, lines, removed, reactivated, tenantId) => {
    if (get().customerPlans.loading) return false;
    set((state) => {
      state.customerPlans.loading = true;
      state.customerPlans.error = null;
    });
    try {
      const existing =
        get().customers.items.find((c) => c.id === customerId)?.customerPlans ??
        [];
      const { active, cancelled } = await customerPlanService.syncLines(
        customerId,
        lines,
        removed,
        reactivated,
        tenantId,
        existing.filter((l) => l.active),
      );
      const reactivatedSet = new Set(reactivated);
      const removedSet = new Set(removed.map((r) => r.id));
      const keptCancelled = existing.filter(
        (l) =>
          !l.active && !reactivatedSet.has(l.id) && !removedSet.has(l.id),
      );
      get().customers.setCustomerLines(customerId, [
        ...active,
        ...cancelled,
        ...keptCancelled,
      ]);
      set((state) => {
        state.customerPlans.loading = false;
      });
      return true;
    } catch (e) {
      set((state) => {
        state.customerPlans.error = (e as Error).message;
        state.customerPlans.loading = false;
      });
      return false;
    }
  },

  hasPayments: (lineId) => customerPlanService.hasPayments(lineId),

  getPaidLineIds: (customerId) => customerPlanService.getPaidLineIds(customerId),

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
