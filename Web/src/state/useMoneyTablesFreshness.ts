import { useOwedChanged } from "@shared/modules/ledger/hooks/useOwedChanged";
import { markCustomersTableStale } from "./customersTable";
import { markDebtHistoryTableStale } from "./debtHistoryTable";
import { markSalesTablesStaleOnOwed } from "./salesTable";

function markMoneyTablesStale(): void {
  markCustomersTableStale();
  markSalesTablesStaleOnOwed();
  markDebtHistoryTableStale();
}

// Mounted once in the frame: a money write anywhere dates these tables, shown or not.
export function useMoneyTablesFreshness(): void {
  useOwedChanged(markMoneyTablesStale);
}
