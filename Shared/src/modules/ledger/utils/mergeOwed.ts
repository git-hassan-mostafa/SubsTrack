import type {
  Currency,
  Customer,
  CustomerPlan,
  OpenItem,
  PriceHistory,
  StatusBill,
  StatusLine,
  StatusSkip,
  UnpaidStartRule,
} from "@shared/core/types";
import { resolveLinePrice } from "@shared/modules/customer/customer-plans/utils/linePrice";
import {
  EMPTY_PRICE_HISTORY,
  isEarlierPrice,
  linePriceAt,
  type HistoricLine,
} from "@shared/modules/customer/customer-plans/utils/priceHistory";
import { findCurrency } from "@shared/core/utils/currency";
import { currentDate } from "@shared/core/utils/date";
import { monthCells } from "@shared/modules/customer/customer-payments/utils/monthStatus";
import { blockStartMonth } from "@shared/modules/customer/customer-payments/utils/monthSelection";
import { getBlockRangeLabel } from "@shared/modules/customer/customer-payments/utils/blockRangeLabel";
import { virtualMonthItem } from "@shared/modules/ledger/utils/virtualMonthItem";
import { sortByDue } from "@shared/modules/ledger/utils/waterfall";

export type OwedCustomer = Pick<Customer, "id" | "name"> & Partial<Pick<Customer, "branchId">>;
export type OwedLine = StatusLine & HistoricLine & Pick<CustomerPlan, "planId">;
export type RateCurrency = Pick<Currency, "id" | "ratePerUsd">;
export type StoredOwed = Pick<OpenItem, "kind" | "paid" | "customerPlanId" | "billingMonth">;

export interface OwedArgs<T extends StoredOwed> {
  customer: OwedCustomer;
  lines: OwedLine[];
  skips: StatusSkip[];
  unpaidRule: UnpaidStartRule;
  currencies: RateCurrency[];
  stored: T[];
  billsByLine: ReadonlyMap<string, StatusBill[]>;
  prices?: PriceHistory;
  today?: Date;
  withOpenMonths?: boolean;
}

export type MergeOwedArgs = OwedArgs<OpenItem>;

const monthKey = (item: Pick<StoredOwed, "customerPlanId" | "billingMonth">) =>
  `${item.customerPlanId}:${item.billingMonth}`;

// Stored bills plus every untouched unpaid month; an empty month bill yields to its month.
export function owedOf<T extends StoredOwed>(args: OwedArgs<T>): (T | OpenItem)[] {
  const billed = new Set(
    args.stored.filter((i) => i.kind === "month" && i.paid > 0).map(monthKey),
  );
  const virtual = virtualUnpaidMonths({
    customer: args.customer,
    activeLines: args.lines.filter((l) => l.active),
    billsByLine: args.billsByLine,
    skips: args.skips,
    unpaidRule: args.unpaidRule,
    currencies: args.currencies,
    alreadyBilled: billed,
    prices: args.prices ?? EMPTY_PRICE_HISTORY,
    today: args.today ?? currentDate(),
    withOpenMonths: args.withOpenMonths ?? false,
  });
  const revalued = new Set(virtual.map(monthKey));
  const kept = args.stored.filter(
    (i) => i.kind !== "month" || i.paid > 0 || !revalued.has(monthKey(i)),
  );
  return [...kept, ...virtual];
}

// Pure half of getOwed, kept off the service so the portal can run it too.
export function mergeOwed(args: MergeOwedArgs): OpenItem[] {
  const stored = args.stored.map((i) => ({ ...i, customerName: args.customer.name }));
  return sortByDue(owedOf({ ...args, stored }));
}

const MONTH_KEY_PREFIX = "months.";
const monthName = (key: string) => key.slice(MONTH_KEY_PREFIX.length);

// One item per unpaid N-month block (#194), priced as it stood then (#185).
function virtualUnpaidMonths(args: {
  customer: OwedCustomer;
  activeLines: OwedLine[];
  billsByLine: ReadonlyMap<string, StatusBill[]>;
  skips: StatusSkip[];
  unpaidRule: UnpaidStartRule;
  currencies: RateCurrency[];
  alreadyBilled: ReadonlySet<string>;
  prices: PriceHistory;
  today: Date;
  withOpenMonths: boolean;
}): OpenItem[] {
  const {
    customer,
    activeLines,
    billsByLine,
    skips,
    unpaidRule,
    currencies,
    alreadyBilled,
    prices,
    today,
    withOpenMonths,
  } = args;
  const out: OpenItem[] = [];

  for (const line of activeLines) {
    const todayPrice = resolveLinePrice(line);
    const blockMonths = todayPrice.durationMonths;
    const bills = billsByLine.get(line.id) ?? [];
    const lineSkips = skips.filter((s) => s.customerPlanId === line.id);
    const startYear = new Date(line.startDate).getFullYear();
    const listed = new Set<string>();

    for (let year = startYear; year <= today.getFullYear(); year++) {
      for (const entry of monthCells(
        line,
        bills,
        lineSkips,
        year,
        unpaidRule,
      )) {
        if (entry.status !== "unpaid") continue;
        const billingMonth =
          blockMonths > 1
            ? blockStartMonth(entry.billingMonth, line.startDate, blockMonths)
            : entry.billingMonth;
        if (listed.has(billingMonth)) continue;
        listed.add(billingMonth);
        if (alreadyBilled.has(`${line.id}:${billingMonth}`)) continue;
        const price = linePriceAt(line, billingMonth, prices);
        const priced =
          price.isFixed && price.amount !== null && price.amount > 0;
        if (!priced && !withOpenMonths) continue;
        out.push(
          virtualMonthItem({
            customerId: customer.id,
            customerName: customer.name,
            branchId: customer.branchId ?? null,
            customerPlanId: line.id,
            billingMonth,
            durationMonths: price.durationMonths,
            planId: line.planId,
            label: `${getBlockRangeLabel(billingMonth, price.durationMonths, monthName)}${line.plan?.name ? ` · ${line.plan.name}` : ""}`,
            amount: priced ? price.amount! : 0,
            currencyId: priced ? price.currencyId : null,
            ratePerUsdSnapshot: priced
              ? (findCurrency(currencies, price.currencyId)?.ratePerUsd ?? 1)
              : 1,
            dueDate: billingMonth,
            openAmount: !priced,
            earlierPrice: isEarlierPrice(price, todayPrice),
          }),
        );
      }
    }
  }
  return out;
}
