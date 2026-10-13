import { useCallback, useRef, useState } from "react";
import type { Customer, CustomerDebts } from "@shared/core/types";
import skippedMonthService from "@shared/modules/customer/customer-payments/services/SkippedMonthService";
import { ledgerService } from "@shared/modules/ledger/services/LedgerService";
import { useOwedChanged } from "@shared/modules/ledger/hooks/useOwedChanged";
import { customerOwedEntry } from "@shared/modules/ledger/utils/owedView";
import { getStore } from "@shared/state/globalStore";
import { getUnpaidRule } from "@shared/state/slices/payments/utils/unpaidRule";

export interface CustomerToCollect {
  entry: CustomerDebts;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  refresh: () => Promise<void>;
}

// The To collect page's row for ONE customer; the caller picks the first read.
export function useCustomerToCollect(customer: Customer): CustomerToCollect {
  const [entry, setEntry] = useState<CustomerDebts>(() => customerOwedEntry(customer, []));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);

  const refresh = useCallback(async () => {
    const token = ++tokenRef.current;
    setLoading(true);
    try {
      const state = getStore().getState();
      const owed = await ledgerService.getToCollect({
        customer,
        skips: await skippedMonthService.getSkipsForCustomer(customer.id),
        unpaidRule: getUnpaidRule(getStore().getState),
        currencies: state.currencies.items,
      });
      if (tokenRef.current !== token) return;
      setEntry(customerOwedEntry(customer, owed));
      setError(null);
    } catch (e) {
      if (tokenRef.current === token) setError((e as Error).message);
    } finally {
      if (tokenRef.current === token) setLoading(false);
    }
  }, [customer]);

  useOwedChanged(refresh);
  const clearError = useCallback(() => setError(null), []);

  return { entry, loading, error, clearError, refresh };
}
