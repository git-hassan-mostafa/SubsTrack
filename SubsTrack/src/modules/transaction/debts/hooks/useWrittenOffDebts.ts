import { useCallback, useEffect, useRef, useState } from "react";
import type { OpenItem } from "@/src/core/types";
import { chargeService, useOwedChanged } from "@/src/modules/ledger";

/** Which side of the write-off line a debts surface is showing. */
export type DebtScope = "live" | "written_off";

/**
 * One customer's WRITTEN-OFF bills, read ONLY while that scope is on screen.
 *
 * They are deliberately not part of `DebtsView`: a write-off is money given up
 * on, so it must never reach a total that answers "what is still expected".
 * Keeping it a separate read is what lets every existing figure stay untouched.
 *
 * Nothing about the FILTER depends on this read, so the default scope costs no
 * query at all — the chip is drawn from the first frame and the bills are
 * fetched when someone actually asks for them.
 */
export function useWrittenOffDebts(
  customerId: string,
  customerName: string,
  enabled: boolean,
) {
  const [items, setItems] = useState<OpenItem[]>(EMPTY);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef(0);
  const staleRef = useRef(true);

  const read = useCallback(async () => {
    const token = ++tokenRef.current;
    staleRef.current = false;
    setLoading(true);
    try {
      const open = await chargeService.getOpenCharges({
        customerId,
        writeOffScope: "written_off",
      });
      if (tokenRef.current !== token) return;
      setItems(open.map((i) => ({ ...i, customerName })));
    } finally {
      if (tokenRef.current === token) setLoading(false);
    }
  }, [customerId, customerName]);

  useEffect(() => {
    staleRef.current = true;
  }, [customerId]);

  // A write while this scope is HIDDEN cannot re-read — that would cost a query
  // on the default view — so it is remembered and paid for when the tab opens.
  const refresh = useCallback(() => {
    if (!enabled) {
      staleRef.current = true;
      return;
    }
    void read();
  }, [enabled, read]);

  useEffect(() => {
    if (enabled && staleRef.current) void read();
  }, [enabled, read]);
  useOwedChanged(refresh);

  return { items, loading };
}

const EMPTY: OpenItem[] = [];
