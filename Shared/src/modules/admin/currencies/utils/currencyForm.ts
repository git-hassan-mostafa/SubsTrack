import type { Currency } from "@shared/core/types";
import type { CurrencyInput } from "@shared/modules/admin/currencies/utils/types";

export const DEFAULT_CURRENCY_DECIMALS = "2";

export type CurrencyDraft = {
  code: string;
  name: string;
  symbol: string;
  rateText: string;
  decimalsText: string;
};

export function currencyDraftOf(currency: Currency | null): CurrencyDraft {
  return {
    code: currency?.code ?? "",
    name: currency?.name ?? "",
    symbol: currency?.symbol ?? "",
    rateText: currency ? String(currency.ratePerUsd) : "",
    decimalsText: currency ? String(currency.decimals) : DEFAULT_CURRENCY_DECIMALS,
  };
}

export function canSaveCurrency(draft: CurrencyDraft): boolean {
  return (
    draft.code.trim().length > 0 &&
    draft.name.trim().length > 0 &&
    draft.rateText.length > 0 &&
    draft.decimalsText.length > 0
  );
}

export function currencyInput(draft: CurrencyDraft): CurrencyInput {
  return {
    code: draft.code,
    name: draft.name,
    symbol: draft.symbol.trim() || null,
    ratePerUsd: parseFloat(draft.rateText),
    decimals: parseInt(draft.decimalsText, 10),
  };
}
