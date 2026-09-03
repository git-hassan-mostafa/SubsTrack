import { useCallback, useState, type ReactNode } from "react";
import type { Charge, Collection, OpenItem } from "@/src/core/types";
import { chargeService } from "../services/ChargeService";
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
  open: (
    charge: Charge,
    label: string,
    customerName?: string | null,
  ) => Promise<void>;
  openOwed: (item: OpenItem) => Promise<void>;
  loadingId: string | null;
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
  const [bill, setBill] = useState<{
    charge: Charge;
    label: string;
    customerName?: string | null;
  } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const openSale = useCallback(
    async (chargeId: string, saleId: string) => {
      if (!onOpenSale) return;
      setLoadingId(chargeId);
      try {
        await onOpenSale(saleId);
      } finally {
        setLoadingId(null);
      }
    },
    [onOpenSale],
  );

  const open = useCallback(
    async (charge: Charge, label: string, customerName?: string | null) => {
      if (charge.kind === "sale") {
        if (charge.saleId) await openSale(charge.id, charge.saleId);
        return;
      }
      setBill({ charge, label, customerName });
    },
    [openSale],
  );

  const openOwed = useCallback(
    async (item: OpenItem) => {
      if (!item.chargeId) return;
      if (item.kind === "sale") {
        if (item.saleId) await openSale(item.chargeId, item.saleId);
        return;
      }
      if (item.charge) {
        setBill({
          charge: item.charge,
          label: item.label,
          customerName: item.customerName,
        });
        return;
      }
      setLoadingId(item.chargeId);
      try {
        const charge = await chargeService.getById(item.chargeId);
        if (charge)
          setBill({
            charge,
            label: item.label,
            customerName: item.customerName,
          });
      } finally {
        setLoadingId(null);
      }
    },
    [openSale],
  );

  return {
    open,
    openOwed,
    loadingId,
    sheet: (
      <BillSheet
        visible={bill !== null}
        onDismiss={() => setBill(null)}
        charge={bill?.charge ?? null}
        label={bill?.label ?? ""}
        customerName={bill?.customerName}
        onChanged={onChanged}
      />
    ),
  };
}
