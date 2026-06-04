import { getStore } from '@/src/state/globalStore';

export function resetAllDomainStores() {
  const state = getStore().getState();
  state.currencies.reset();
  state.branches.reset();
  state.plans.reset();
  state.users.reset();
  state.customers.reset();
  state.payments.reset();
  state.dashboard.reset();
}
