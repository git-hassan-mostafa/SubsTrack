import type { Currency, OpenItem } from "@/src/core/types";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { formatDate } from "@/src/core/utils/date";
import { getBlockRangeLabel } from "@/src/modules/customer/customer-payments/utils/blockRangeLabel";
import { sortByDue } from "@/src/modules/ledger/utils/waterfall";
import { PERIOD_LABEL_LIMIT } from "./constants";

type TFn = (key: string, opts?: Record<string, unknown>) => string;

export interface ReminderFacts {
  amount: string;
  period: string;
  dueDate: string;
}

// An open-amount line has no price yet, so it never joins a reminder total.
function remindable(items: OpenItem[]): OpenItem[] {
  return items.filter((item) => !item.openAmount && item.balance > 0);
}

function itemPeriod(item: OpenItem, t: TFn): string {
  if (item.kind === "month" && item.billingMonth) {
    return getBlockRangeLabel(item.billingMonth, item.durationMonths, t);
  }
  return item.label;
}

// Each currency is summed in its own units, never converted (like collect).
export function owedAmountText(items: OpenItem[], currencies: Currency[]): string {
  const totals = new Map<string, { currencyId: string | null; amount: number }>();
  for (const item of remindable(items)) {
    const key = item.currencyId ?? "USD";
    const current = totals.get(key);
    if (current) current.amount += item.balance;
    else totals.set(key, { currencyId: item.currencyId, amount: item.balance });
  }
  return [...totals.values()]
    .map(({ currencyId, amount }) => {
      const currency = findCurrency(currencies, currencyId);
      return formatMoney(amount, currency, currency);
    })
    .join(" + ");
}

export function periodText(items: OpenItem[], t: TFn): string {
  const labels: string[] = [];
  for (const item of sortByDue(remindable(items))) {
    const label = itemPeriod(item, t);
    if (!labels.includes(label)) labels.push(label);
  }
  if (labels.length <= PERIOD_LABEL_LIMIT) return labels.join(", ");
  const shown = labels.slice(0, PERIOD_LABEL_LIMIT).join(", ");
  return t("whatsapp.period_more", {
    periods: shown,
    count: labels.length - PERIOD_LABEL_LIMIT,
  });
}

export function reminderFacts(
  items: OpenItem[],
  currencies: Currency[],
  t: TFn,
): ReminderFacts | null {
  const due = sortByDue(remindable(items));
  if (due.length === 0) return null;
  return {
    amount: owedAmountText(due, currencies),
    period: periodText(due, t),
    dueDate: formatDate(due[0].dueDate, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  };
}
