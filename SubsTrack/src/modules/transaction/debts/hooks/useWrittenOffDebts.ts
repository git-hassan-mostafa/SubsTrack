import { useCallback } from "react";
import { chargeService } from "@/src/modules/ledger";
import { useWrittenOffRead } from "./useWrittenOffRead";

/** Which side of the write-off line a debts surface is showing. */
export type DebtScope = "live" | "written_off";

// Kept out of DebtsView so a write-off never reaches a "still expected" total.
export function useWrittenOffDebts(customerId: string, customerName: string) {
  const load = useCallback(async () => {
    const open = await chargeService.getOpenCharges({
      customerId,
      writeOffScope: "written_off",
    });
    return open.map((i) => ({ ...i, customerName }));
  }, [customerId, customerName]);

  return useWrittenOffRead(load);
}
