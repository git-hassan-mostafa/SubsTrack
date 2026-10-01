import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Sale } from "@shared/core/types";
import saleService from "@shared/modules/transaction/sales/services/SaleService";
import { useOwedChanged } from "@shared/modules/ledger/hooks/useOwedChanged";
import {
  saleListPatches,
  type SalePatches,
} from "@shared/modules/transaction/sales/utils/saleListPatch";

export interface CustomerSalesPreview {
  items: Sale[];
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  refresh: () => Promise<void>;
  patch: SalePatches;
}

// Reads one row past `limit` so "show all" knows there is more to show.
export function useCustomerSalesPreview(
  customerId: string,
  limit: number,
  onRead?: () => void,
): CustomerSalesPreview {
  const [sales, setSales] = useState<Sale[]>(EMPTY);
  const [serverHasMore, setServerHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);

  const refresh = useCallback(async () => {
    const token = ++tokenRef.current;
    setLoading(true);
    onRead?.();
    try {
      const rows = await saleService.getSalesForCustomer(customerId, limit + 1);
      if (tokenRef.current !== token) return;
      setSales(rows);
      setServerHasMore(rows.length > limit);
      setError(null);
    } catch (e) {
      if (tokenRef.current === token) setError((e as Error).message);
    } finally {
      if (tokenRef.current === token) setLoading(false);
    }
  }, [customerId, limit, onRead]);

  const patch = useMemo(
    () => saleListPatches(setSales, customerId),
    [customerId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useOwedChanged(refresh);
  const clearError = useCallback(() => setError(null), []);
  const items = useMemo(() => sales.slice(0, limit), [sales, limit]);

  return {
    items,
    hasMore: serverHasMore || sales.length > limit,
    loading,
    error,
    clearError,
    refresh,
    patch,
  };
}

const EMPTY: Sale[] = [];
