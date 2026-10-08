import i18n from "@shared/core/i18n";
import type { Currency, OpenItem } from "@shared/core/types";
import { billingMonthLabel } from "@shared/core/utils/billingMonth";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";

interface EarlierPrice {
  months: string[];
  amount: number;
  currencyId: string | null;
}

function groupEarlierPrices(items: OpenItem[]): EarlierPrice[] {
  const byPrice = new Map<string, EarlierPrice>();
  for (const item of items) {
    if (!item.earlierPrice || !item.billingMonth) continue;
    const key = `${item.currencyId}|${item.amount}`;
    const group = byPrice.get(key) ?? { months: [], amount: item.amount, currencyId: item.currencyId };
    group.months.push(item.billingMonth);
    byPrice.set(key, group);
  }
  return [...byPrice.values()];
}

// One sentence per old price a month is collected at — gotcha #185.
export function earlierPriceNotes(items: OpenItem[], currencies: Currency[]): string[] {
  return groupEarlierPrices(items).map((group) => {
    const currency = findCurrency(currencies, group.currencyId);
    return i18n.t("ledger.earlier_price_note", {
      months: [...group.months].sort().map((m) => billingMonthLabel(m, true)).join(", "),
      price: formatMoney(group.amount, currency, currency),
    });
  });
}
