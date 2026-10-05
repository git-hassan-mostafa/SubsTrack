import { useEffect, useRef } from "react";
import type { Currency } from "@shared/core/types";
import { activeCurrencyId } from "@shared/core/utils/currency";
import { useUiPrefStore } from "@shared/shared/lib/uiPrefStore";

// Once per mount an empty field takes the last currency picked, if still active.
export function useLastUsedCurrency(
  value: { amount: number | null; currencyId: string | null },
  currencies: Currency[],
  applyDefault: (currencyId: string) => void,
): (currencyId: string | null) => void {
  const lastUsedCurrencyId = useUiPrefStore((s) => s.lastUsedCurrencyId);
  const remember = useUiPrefStore((s) => s.setLastUsedCurrencyId);
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    if (value.currencyId !== null || value.amount !== null) return;
    const fallback = activeCurrencyId(lastUsedCurrencyId, currencies);
    if (fallback) applyDefault(fallback);
  }, [value.amount, value.currencyId, currencies, lastUsedCurrencyId, applyDefault]);

  return remember;
}
