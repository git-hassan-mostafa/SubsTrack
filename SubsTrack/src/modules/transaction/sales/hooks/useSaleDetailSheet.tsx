import { useCallback, useState, type ReactNode } from "react";
import type { Sale } from "@/src/core/types";
import saleService from "../services/SaleService";
import { SaleDetailSheet } from "../components/SaleDetailSheet";

export interface SaleDetailSheetHandle {
  /** Loads the sale and shows its receipt. Resolves once it is on screen. */
  openSale: (saleId: string) => Promise<void>;
  /** Render once per screen. */
  sheet: ReactNode;
}

/** The `onOpenSale` a ledger or debts surface takes — it cannot import this. */
export function useSaleDetailSheet(): SaleDetailSheetHandle {
  const [sale, setSale] = useState<Sale | null>(null);

  const openSale = useCallback(async (saleId: string) => {
    setSale(await saleService.getSaleById(saleId));
  }, []);

  return {
    openSale,
    sheet: <SaleDetailSheet sale={sale} onDismiss={() => setSale(null)} />,
  };
}
