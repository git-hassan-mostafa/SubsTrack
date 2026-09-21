import { useCallback, useEffect, useRef, useState } from "react";
import type { OpenItem } from "@/src/core/types";
import type { BranchFilter } from "@/src/core/constants";
import { chargeService, useOwedChanged } from "@/src/modules/ledger";

/**
 * Every WRITTEN-OFF bill in the branch, read ONLY while that scope is showing.
 *
 * The tenant-wide twin of `useWrittenOffDebts`, and separate for the same
 * reason: a write-off is money given up on, so it must never enter `DebtsView`
 * or any total that answers "what is still expected". Keeping it its own read
 * is what lets the live figures stay untouched.
 */
export function useAllWrittenOffDebts(
  branchFilter: BranchFilter,
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
        branchFilter,
        writeOffScope: "written_off",
      });
      if (tokenRef.current !== token) return;
      setItems(open);
    } finally {
      if (tokenRef.current === token) setLoading(false);
    }
  }, [branchFilter]);

  useEffect(() => {
    staleRef.current = true;
  }, [branchFilter]);

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
