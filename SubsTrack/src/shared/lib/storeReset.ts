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
  state.tenantSettings.reset();

  useDashboardStore.getState().reset();
  useCollectionsListStore.getState().reset();
  useExpenseStore.getState().reset();
  useWalletStore.getState().reset();
  useReportsStore.getState().reset();
  useAuditStore.getState().reset();
}
