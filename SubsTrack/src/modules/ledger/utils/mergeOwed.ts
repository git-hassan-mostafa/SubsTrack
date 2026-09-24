import type {
  Currency,
  Customer,
  CustomerPlan,
  MonthBill,
  OpenItem,
  SkippedMonth,
  UnpaidStartRule,
} from "@/src/core/types";
import { resolveLinePrice } from "@/src/modules/customer/customer-plans/utils/linePrice";
import { findCurrency } from "@/src/core/utils/currency";
import paymentService from "@/src/modules/customer/customer-payments/services/PaymentService";
import { virtualMonthItem } from "./openItems";
import { sortByDue } from "./waterfall";

export interface MergeOwedArgs {
  customer: Customer;
  lines: CustomerPlan[];
  skips: SkippedMonth[];
  unpaidRule: UnpaidStartRule;
  currencies: Currency[];
  stored: OpenItem[];
  billsByLine: Map<string, MonthBill[]>;
  today?: Date;
}

/**
 * The pure half of `LedgerService.getOwed` — everything after its two reads.
 *
 * It lives in utils/ rather than on the service because importing the service
 * drags ChargeService, and therefore a repository and Supabase, into the graph.
 * The customer portal holds the rows already and must run this exact merge on
 * them; anything else would be a second copy of the stored-vs-virtual rule.
 */
export function mergeOwed(args: MergeOwedArgs): OpenItem[] {
  const { customer, lines, skips, unpaidRule, currencies, billsByLine } = args;
  const active = lines.filter((l) => l.active);
  const stored = args.stored.map((i) => ({ ...i, customerName: customer.name }));

  const billed = new Set(
    stored
      .filter((i) => i.kind === "month" && i.paid > 0)
      .map((i) => `${i.customerPlanId}:${i.billingMonth}`),
  );
  const virtual = virtualUnpaidMonths({
    customer,
    activeLines: active,
    billsByLine,
    skips,
    unpaidRule,
    currencies,
    alreadyBilled: billed,
    today: args.today ?? new Date(),
  });

  const revalued = new Set(
    virtual.map((i) => `${i.customerPlanId}:${i.billingMonth}`),
  );
  const kept = stored.filter(
    (i) =>
      i.kind !== "month" ||
      i.paid > 0 ||
      !revalued.has(`${i.customerPlanId}:${i.billingMonth}`),
  );

  return sortByDue([...kept, ...virtual]);
}

function virtualUnpaidMonths(args: {
  customer: Customer;
  activeLines: CustomerPlan[];
  billsByLine: Map<string, MonthBill[]>;
  skips: SkippedMonth[];
  unpaidRule: UnpaidStartRule;
  currencies: Currency[];
  alreadyBilled: ReadonlySet<string>;
  today: Date;
}): OpenItem[] {
  const {
    customer,
    activeLines,
    billsByLine,
    skips,
    unpaidRule,
    currencies,
    alreadyBilled,
    today,
  } = args;
  const out: OpenItem[] = [];

  for (const line of activeLines) {
    const price = resolveLinePrice(line);
    if (!price.isFixed || price.amount === null || price.amount <= 0) continue;
    const ratePerUsd =
      findCurrency(currencies, price.currencyId)?.ratePerUsd ?? 1;

    const bills = billsByLine.get(line.id) ?? [];
    const lineSkips = skips.filter((s) => s.customerPlanId === line.id);
    const startYear = new Date(line.startDate).getFullYear();

    for (let year = startYear; year <= today.getFullYear(); year++) {
      for (const entry of paymentService.buildMonthGrid(
        line,
        bills,
        lineSkips,
        year,
        unpaidRule,
      )) {
        if (entry.status !== "unpaid") continue;
        if (alreadyBilled.has(`${line.id}:${entry.billingMonth}`)) continue;
        out.push(
          virtualMonthItem({
            customerId: customer.id,
            customerName: customer.name,
            branchId: customer.branchId,
            customerPlanId: line.id,
            billingMonth: entry.billingMonth,
            durationMonths: price.durationMonths,
            planId: line.planId,
            label: `${entry.label} ${entry.year}${line.plan?.name ? ` · ${line.plan.name}` : ""}`,
            amount: price.amount,
            currencyId: price.currencyId,
            ratePerUsdSnapshot: ratePerUsd,
            dueDate: entry.billingMonth,
          }),
        );
      }
    }
  }
  return out;
}
