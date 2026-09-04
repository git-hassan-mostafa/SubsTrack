import { useAuditStore } from '@/src/modules/admin/audit/state/auditStore';
import { useDashboardStore } from '@/src/modules/dashboard/state/dashboardStore';
import { useCollectionsListStore } from '@/src/modules/ledger/state/collectionsListStore';
import { useReportsStore } from '@/src/modules/reports/state/reportsStore';
import { useExpenseStore } from '@/src/modules/transaction/expenses/state/expenseStore';
import { useWalletStore } from '@/src/modules/wallet/state/walletStore';
import { getStore } from '@/src/state/globalStore';

export function resetAllDomainStores() {
  const state = getStore().getState();
  state.currencies.reset();
  state.branches.reset();
  state.plans.reset();
  state.users.reset();
  state.customers.reset();
  state.payments.reset();
  state.products.reset();
  state.services.reset();
  state.sales.reset();
  state.ledger.reset();
  // Tenant-scoped, unlike the global `options` slice — must not leak to the
  // next tenant that logs in on this device.
  state.tenantSettings.reset();

  // Module stores sit OUTSIDE GlobalState, so every one is reset by name here.
  // Miss one and the next login on this device inherits the previous tenant's
  // data — another organization's audit trail, wallet cash or collections.
  useDashboardStore.getState().reset();
  useCollectionsListStore.getState().reset();
  useExpenseStore.getState().reset();
  useWalletStore.getState().reset();
  useReportsStore.getState().reset();
  // Holds another tenant's staff names and changed values — never leak it.
  useAuditStore.getState().reset();
}
