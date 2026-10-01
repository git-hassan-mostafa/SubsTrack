import { useCallback, useRef, useState } from "react";
import type { OpenItem } from "@shared/core/types";
import { chargeService } from "@shared/modules/ledger/services/ChargeService";
import { isDebtItem } from "@shared/modules/ledger/utils/debtRule";
import { useOwedChanged } from "@shared/modules/ledger/hooks/useOwedChanged";

export interface CustomerDebts {
  items: OpenItem[];
  loading: boolean;
  error: string | null;
  clearError: () => void;
  refresh: () => Promise<void>;
}

// No first read: the caller picks the arrival (phone on focus, web on open).
export function useCustomerDebts(
  customerId: string,
  customerName: string,
): CustomerDebts {
  const [items, setItems] = useState<OpenItem[]>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);

  const refresh = useCallback(async () => {
    const token = ++tokenRef.current;
    setLoading(true);
    try {
      const open = await chargeService.getOpenCharges({ customerId });
      if (tokenRef.current !== token) return;
      setItems(
        open
          .filter((i) => isDebtItem(i.kind, i.paid))
          .map((i) => ({ ...i, customerName })),
      );
      setError(null);
    } catch (e) {
      if (tokenRef.current === token) setError((e as Error).message);
    } finally {
      if (tokenRef.current === token) setLoading(false);
    }
  }, [customerId, customerName]);

  useOwedChanged(refresh);
  const clearError = useCallback(() => setError(null), []);

  return { items, loading, error, clearError, refresh };
}

const EMPTY: OpenItem[] = [];
