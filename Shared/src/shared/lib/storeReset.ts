import { useAuditStore } from "@shared/modules/admin/audit/state/auditStore";
import { useDashboardStore } from "@shared/modules/dashboard/state/dashboardStore";
import { useCollectionsListStore } from "@shared/modules/ledger/state/collectionsListStore";
import { useReportsStore } from "@shared/modules/reports/state/reportsStore";
import { useDebtHistoryStore } from "@shared/modules/transaction/debts/state/debtHistoryStore";
import { useExpenseStore } from "@shared/modules/transaction/expenses/state/expenseStore";
import { useWalletStore } from "@shared/modules/wallet/state/walletStore";
import { useConnectStore } from "@shared/modules/whatsapp/state/connectStore";
import { useMessageHistoryStore } from "@shared/modules/whatsapp/state/messageHistoryStore";
import { getStore } from "@shared/state/globalStore";
import { bumpDataEpoch } from "./dataEpoch";

/** Every store holding TENANT data — app_options is global, see gotcha #156. */
export function resetAllDomainStores() {
  bumpDataEpoch();
  const state = getStore().getState();
  state.billing.reset();
  state.currencies.reset();
  state.branches.reset();
  state.plans.reset();
  state.users.reset();
  state.customers.reset();
  state.customerPlans.reset();
  state.payments.reset();
  state.products.reset();
  state.services.reset();
  state.sales.reset();
  state.ledger.reset();
  state.tenantSettings.reset();
  state.whatsapp.reset();

  useDashboardStore.getState().reset();
  useCollectionsListStore.getState().reset();
  useDebtHistoryStore.getState().reset();
  useExpenseStore.getState().reset();
  useWalletStore.getState().reset();
  useReportsStore.getState().reset();
  useAuditStore.getState().reset();
  useMessageHistoryStore.getState().reset();
  useConnectStore.getState().reset();
}
