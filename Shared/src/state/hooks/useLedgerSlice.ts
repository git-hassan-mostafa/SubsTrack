import { useGlobalStore } from "@shared/state/hooks/useGlobalStore";
import type { LedgerSlice } from "@shared/state/slices/ledger/ledgerSlice";

export function useLedgerSlice(): LedgerSlice;
export function useLedgerSlice<T>(selector: (state: LedgerSlice) => T): T;
export function useLedgerSlice<T = LedgerSlice>(
  selector?: (state: LedgerSlice) => T,
): T {
  return useGlobalStore((state) => {
    const slice = state.ledger;
    return selector ? selector(slice) : (slice as T);
  });
}
