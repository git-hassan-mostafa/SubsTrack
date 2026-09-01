import { useEffect, useRef } from "react";
import { useLedgerSlice } from "@/src/state/hooks/useLedgerSlice";

/**
 * Re-run `reload` whenever a write anywhere in the app changes what customers
 * OWE — a bill raised, moved or voided, and any cash for or against one.
 *
 * A debts view is the one thing a write cannot patch: it is an aggregate
 * (per-customer buckets, ageing, a summary) and it also holds VIRTUAL months
 * that have no bill at all, so the single row a write returns does not describe
 * it. So the writes announce the change (`ledger.owedVersion`) and the surfaces
 * showing owed money re-read — including a panel sitting on the SAME screen as
 * the write, which no focus event would ever reach.
 *
 * The FIRST run is skipped: every caller already loads on mount or on focus.
 *
 * Do NOT use it on a screen that writes in a LOOP — the customer list's "collect
 * all due" is one hand-over per customer, so it would announce a change per row
 * and re-read per row. Such a screen refreshes once itself, after its loop.
 */
export function useOwedChanged(reload: () => void): void {
  const version = useLedgerSlice((s) => s.owedVersion);
  const seen = useRef(version);

  useEffect(() => {
    if (seen.current === version) return;
    seen.current = version;
    reload();
  }, [version, reload]);
}
