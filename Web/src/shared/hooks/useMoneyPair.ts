import { findCurrency, formatMoneyPair } from "@shared/core/utils/currency";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";

export type MoneyPairFormatter = (
  amount: number,
  currencyId: string | null,
) => { primary: string; approx: string | null };

// The amount in its own currency, plus "≈" the tenant's display currency.
export function useMoneyPair(): MoneyPairFormatter {
  const currencies = useCurrencySlice((s) => s.items);
  const display = findCurrency(currencies, useDisplayCurrencyId());
  return (amount, currencyId) =>
    formatMoneyPair(amount, findCurrency(currencies, currencyId), display);
}
