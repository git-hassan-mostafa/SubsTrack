import type { StateCreator } from 'zustand';
import { customerPlanService, type LineDraft } from '@/src/modules/customer-plans';
import type { GlobalState } from '@/src/state/globalStore';

// Thin slice for the customer form's inline Plans editor. Service lines are the
// source of truth on the Customer object (joined via customer_plans), so a sync
// refreshes that customer through the customers slice — the detail screen +
// payment panel read from there and re-render automatically.
export interface CustomerPlanSlice {
  loading: boolean;
  error: string | null;
  syncLines: (
    customerId: string,
    lines: LineDraft[],
    removedIds: string[],
    tenantId: string,
  ) => Promise<boolean>;
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

  syncLines: async (customerId, lines, removedIds, tenantId) => {
    if (get().customerPlans.loading) return false;
    set((state) => {
      state.customerPlans.loading = true;
      state.customerPlans.error = null;
    });
    try {
      await customerPlanService.syncLines(customerId, lines, removedIds, tenantId);
      // Refresh the owning customer so its `customerPlans` (and the grids built
      // from them) reflect the change. Single source of truth = the DB.
      await get().customers.fetchCustomer(customerId);
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
