import { useCallback, useState, type ReactNode } from "react";
import type { Sale } from "@/src/core/types";
import saleService from "../services/SaleService";
import { SaleDetailSheet } from "../components/SaleDetailSheet";

export interface SaleDetailSheetHandle {
  openSale: (saleId: string) => Promise<void>;
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
