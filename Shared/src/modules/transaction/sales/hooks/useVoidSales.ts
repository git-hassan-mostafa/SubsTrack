import { useCallback } from "react";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import type { SaleVoidResult } from "@shared/modules/transaction/sales/utils/types";
import { useSaleSlice } from "@shared/state/hooks/useSaleSlice";

export interface VoidSales {
  run: (saleIds: string[], reason: string) => Promise<SaleVoidResult | null>;
  error: string | null;
  clearError: () => void;
}

// Null keeps the confirm open: nothing went, and the slice error says why.
export function useVoidSales(): VoidSales {
  const { user } = useAuth();
  const voidSales = useSaleSlice((s) => s.voidSales);
  const error = useSaleSlice((s) => s.error);
  const clearError = useSaleSlice((s) => s.clearError);

  const run = useCallback(
    async (saleIds: string[], reason: string) => {
      if (!user) return null;
      clearError();
      const result = await voidSales(saleIds, user.id, reason);
      if (result.ok === 0 && result.failed > 0) return null;
      return result;
    },
    [user, voidSales, clearError],
  );

  return { run, error, clearError };
}
