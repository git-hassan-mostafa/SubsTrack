import { useCallback } from "react";
import type { Customer, OpenItem } from "@shared/core/types";
import { getStore } from "@shared/state/globalStore";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";

// Everything a customer owes, oldest first; null = the read failed (ledger.error).
export function useLoadOwed(): (customer: Customer) => Promise<OpenItem[] | null> {
  const fetchOwed = useLedgerSlice((s) => s.fetchOwed);
  const currencies = useCurrencySlice((s) => s.items);
  return useCallback(
    async (customer: Customer) => {
      await fetchOwed(customer, customer.customerPlans ?? [], currencies);
      const ledger = getStore().getState().ledger;
      return ledger.error ? null : ledger.owed;
    },
    [fetchOwed, currencies],
  );
}
