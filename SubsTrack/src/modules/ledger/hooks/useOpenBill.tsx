import { useCallback, useState, type ReactNode } from "react";
import type { Charge, Collection } from "@/src/core/types";
import { BillSheet } from "../components/BillSheet";

interface Options {
  /**
   * Opens a SALE's receipt. Injected, because the sale sheet lives in the sales
   * module and sales depends on the ledger — never the other way round.
   * Resolves once the receipt is open, so the row can stop its spinner.
   */
  onOpenSale?: (saleId: string) => Promise<void> | void;
  /** A hand-over on the open bill was voided from inside it. */
  onChanged?: (voided: Collection) => void;
}

export interface OpenBill {
  /** Opens whatever record a bill belongs to. Reports if it did anything. */
  open: (charge: Charge, label: string) => Promise<void>;
  /** The bill id currently being opened — for the row's spinner. */
  loadingId: string | null;
  /** Render once per screen. */
  sheet: ReactNode;
}

/**
 * "Show me the bill behind this row", for any surface holding a charge.
 *
 * A month and a hand-typed fee are the same `charges` row, so both open the
 * shared `BillSheet`; a sale opens its own receipt, which is why that one is a
 * callback. Read-only on purpose — the sheet is reached from a history list, so
 * it lists the bill and its payments without offering to collect or void it.
 */
export function useOpenBill({ onOpenSale, onChanged }: Options = {}): OpenBill {
  const [bill, setBill] = useState<{ charge: Charge; label: string } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const open = useCallback(
    async (charge: Charge, label: string) => {
      if (charge.kind === "sale") {
        if (!onOpenSale || !charge.saleId) return;
        setLoadingId(charge.id);
        try {
          await onOpenSale(charge.saleId);
        } finally {
          setLoadingId(null);
        }
        return;
      }
      setBill({ charge, label });
    },
    [onOpenSale],
  );

  return {
    open,
    loadingId,
    sheet: (
      <BillSheet
        visible={bill !== null}
        onDismiss={() => setBill(null)}
        charge={bill?.charge ?? null}
        label={bill?.label ?? ""}
        onChanged={onChanged}
      />
    ),
  };
}
