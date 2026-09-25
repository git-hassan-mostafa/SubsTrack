import { useCallback } from "react";
import type { BranchFilter } from "@/src/core/constants";
import { chargeService } from "@/src/modules/ledger";
import { useWrittenOffRead } from "./useWrittenOffRead";

// Branch-wide twin of useWrittenOffDebts, also kept out of DebtsView.
export function useAllWrittenOffDebts(branchFilter: BranchFilter) {
  const load = useCallback(
    () =>
      chargeService.getOpenCharges({
        branchFilter,
        writeOffScope: "written_off",
      }),
    [branchFilter],
  );

  return useWrittenOffRead(load);
}
