import type { StoreApi } from 'zustand';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createAuthSlice, type AuthSlice } from './slices/auth/authSlice';
import { createSubscriptionSlice, type SubscriptionSlice } from './slices/subscription/subscriptionSlice';
import { createCustomerSlice, type CustomerSlice } from './slices/customers/customerSlice';
import { createPaymentSlice, type PaymentSlice } from './slices/payments/paymentSlice';
import { createPlanSlice, type PlanSlice } from './slices/plans/planSlice';
import { createUserSlice, type UserSlice } from './slices/users/userSlice';
import { createDashboardSlice, type DashboardSlice } from './slices/dashboard/dashboardSlice';
import { createBranchSlice, type BranchSlice } from './slices/branches/branchSlice';
import { createCurrencySlice, type CurrencySlice } from './slices/currencies/currencySlice';
import { createSignupSlice, type SignupSlice } from './slices/signup/signupSlice';

export interface GlobalState {
  auth: AuthSlice;
  subscription: SubscriptionSlice;
  customers: CustomerSlice;
  payments: PaymentSlice;
  plans: PlanSlice;
  users: UserSlice;
  dashboard: DashboardSlice;
  branches: BranchSlice;
  currencies: CurrencySlice;
  signup: SignupSlice;
}

const STORE_KEY = '__SUBSTRACK_GLOBAL_STORE__';

const initStore = (): StoreApi<GlobalState> =>
  create<GlobalState>()(
    immer((set, get, store) => ({
      auth: createAuthSlice(set, get, store),
      subscription: createSubscriptionSlice(set, get, store),
      customers: createCustomerSlice(set, get, store),
      payments: createPaymentSlice(set, get, store),
      plans: createPlanSlice(set, get, store),
      users: createUserSlice(set, get, store),
      dashboard: createDashboardSlice(set, get, store),
      branches: createBranchSlice(set, get, store),
      currencies: createCurrencySlice(set, get, store),
      signup: createSignupSlice(set, get, store),
    })),
  );

export const getStore = (): StoreApi<GlobalState> => {
  const g = globalThis as typeof globalThis & {
    [key: string]: StoreApi<GlobalState> | undefined;
  };
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = initStore();
  }
  return g[STORE_KEY]!;
};
