import { endSession } from "@shared/shared/lib/session";
import { useAuditTable } from "./auditTable";
import { useBranchesTable } from "./branchesTable";
import { useCollectionsTable } from "./collectionsTable";
import { useCurrenciesTable } from "./currenciesTable";
import { useCustomersTable } from "./customersTable";
import { useDebtHistoryTable } from "./debtHistoryTable";
import { usePlansTable } from "./plansTable";
import { useProductsTable } from "./productsTable";
import { useSalesTable } from "./salesTable";
import { useServicesTable } from "./servicesTable";
import { useUsersTable } from "./usersTable";

const WEB_STORE_RESETS: readonly (() => void)[] = [
  () => useBranchesTable.getState().reset(),
  () => useCurrenciesTable.getState().reset(),
  () => useServicesTable.getState().reset(),
  () => usePlansTable.getState().reset(),
  () => useProductsTable.getState().reset(),
  () => useUsersTable.getState().reset(),
  () => useAuditTable.getState().reset(),
  () => useCustomersTable.getState().reset(),
  () => useCollectionsTable.getState().reset(),
  () => useSalesTable.getState().reset(),
  () => useDebtHistoryTable.getState().reset(),
];

// The ONE web session end: Shared's reset, then every Web/src/state store.
export async function endWebSession(): Promise<void> {
  await endSession();
  for (const reset of WEB_STORE_RESETS) reset();
}
