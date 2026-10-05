import type { Currency } from "@shared/core/types";
import { findCurrency } from "@shared/core/utils/currency";
import { useCurrencySlice } from "./useCurrencySlice";
import { useDisplayCurrencyId } from "./useTenantSettingSlice";

// The organization's display currency as a row; null means USD, the base.
export function useDisplayCurrency(): Currency | null {
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  return findCurrency(currencies, displayCurrencyId);
}
