import { useAuditStore } from '@/src/modules/admin/audit/state/auditStore';
import { useDashboardStore } from '@/src/modules/dashboard/state/dashboardStore';
import { useCollectionsListStore } from '@/src/modules/ledger/state/collectionsListStore';
import { useExpenseStore } from '@/src/modules/transaction/expenses/state/expenseStore';
import { useWalletStore } from '@/src/modules/wallet/state/walletStore';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import { getStore } from './globalStore';

/** Re-fetch the dashboard plus every list store that already holds data. */
export function refreshActiveData(): void {
  const s = getStore().getState();

  void useDashboardStore.getState().fetchMetrics();

  if (s.customers.loaded) void s.customers.fetchCustomers();
  if (s.plans.loaded) void s.plans.fetchPlans();
  if (s.currencies.loaded) void s.currencies.fetchCurrencies();
  if (s.branches.loaded) void s.branches.fetchBranches();
  if (s.products.loaded) void s.products.fetchProducts();
  if (s.services.loaded) void s.services.fetchServices();
  if (s.users.loaded) void s.users.fetchUsers();
  if (s.sales.items.length) void s.sales.fetchSales();
  if (s.ledger.debts) void s.ledger.fetchDebts(resolveBranchFilter(s.auth.user));
  const collections = useCollectionsListStore.getState();
  if (collections.items.length) void collections.fetchCollections();
  const expenses = useExpenseStore.getState();
  if (expenses.items.length) void expenses.fetchExpenses();
  const wallet = useWalletStore.getState();
  if (wallet.items.length) void wallet.fetchWallets();
  const audit = useAuditStore.getState();
  if (audit.items.length) void audit.fetchEntries();

  if (s.customers.loaded) {
    void s.payments.fetchCustomerStatuses(s.customers.items);
    void s.ledger.fetchNetByCustomer(resolveBranchFilter(s.auth.user));
  }


  void s.subscription.refreshUsage();
}
