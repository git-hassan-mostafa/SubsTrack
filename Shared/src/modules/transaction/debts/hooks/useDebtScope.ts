import { useState } from "react";
import { useWrittenOffDebts, type DebtScope } from "./useWrittenOffDebts";

// One customer's live-vs-written-off switch; the written-off read starts at once.
export function useDebtScope(customerId: string, customerName: string) {
  const [scope, setScope] = useState<DebtScope>("live");
  const writtenOff = useWrittenOffDebts(customerId, customerName);
  return {
    scope,
    setScope,
    showingWrittenOff: scope === "written_off",
    writtenOff,
  };
}
