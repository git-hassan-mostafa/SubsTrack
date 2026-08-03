import { getStore } from '@/src/state/globalStore';

export function resetAllDomainStores() {
  const state = getStore().getState();
  state.currencies.reset();
  state.branches.reset();
  state.plans.reset();
  state.users.reset();
  state.customers.reset();
  state.payments.reset();
  state.paymentsList.reset();
  state.dashboard.reset();
  state.products.reset();
  state.sales.reset();
  state.debts.reset();
  state.wallet.reset();
  // Tenant-scoped, unlike the global `options` slice — must not leak to the
  // next tenant that logs in on this device.
  state.tenantSettings.reset();
}
