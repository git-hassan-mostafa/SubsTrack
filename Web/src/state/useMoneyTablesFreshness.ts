import { useOwedChanged } from "@shared/modules/ledger/hooks/useOwedChanged";
import { markCustomersTableStale } from "./customersTable";
import { markSalesTableStale } from "./salesTable";

function markMoneyTablesStale(): void {
  markCustomersTableStale();
  markSalesTableStale();
}

// Mounted once in the frame: a money write anywhere dates both tables, shown or not.
export function useMoneyTablesFreshness(): void {
  useOwedChanged(markMoneyTablesStale);
}
