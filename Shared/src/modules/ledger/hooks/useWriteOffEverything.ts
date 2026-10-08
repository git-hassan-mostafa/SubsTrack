import { useCallback } from "react";
import type { Customer } from "@shared/core/types";
import { useLoadOwed } from "@shared/modules/ledger/hooks/useLoadOwed";
import { useWriteOffActions } from "@shared/modules/ledger/hooks/useWriteOffActions";
import { writeOffItems } from "@shared/modules/ledger/utils/writeOffItems";

export type WriteOffEverythingResult = "written" | "nothing" | "kept" | "failed";

// Reads what the customer owes first: unpaid months exist only in that read.
export function useWriteOffEverything(): (
  customer: Customer,
) => Promise<WriteOffEverythingResult> {
  const loadOwed = useLoadOwed();
  const { writeOffEverything } = useWriteOffActions();
  return useCallback(
    async (customer: Customer) => {
      const owed = await loadOwed(customer);
      if (!owed) return "failed";
      if (writeOffItems(owed, "everything").length === 0) return "nothing";
      return (await writeOffEverything(customer.name, owed))
        ? "written"
        : "kept";
    },
    [loadOwed, writeOffEverything],
  );
}
