import type { Customer, SkippedMonth } from "@shared/core/types";
import { chargeService } from "@shared/modules/ledger/services/ChargeService";
import { collectTotal, owedItems, type CollectTotalArgs } from "@shared/modules/ledger/utils/collectTotal";
import { buildOwedView, customerOwedEntry, customerOwedUsd, owedByCustomerOf } from "@shared/modules/ledger/utils/owedView";
import { ledgerService } from "@shared/modules/ledger/services/LedgerService";
import { showOwed } from "@shared/modules/transaction/to-collect/utils/toCollectView";
import { flattenOwed } from "@shared/modules/transaction/to-collect/utils/allItemsFilter";
import { store } from "../helpers/fakeLedger";
import { customer, line, plan, LBP } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";

// TC-TCL-* — the To collect page: debts AND unpaid months, the same items the
// dashboard's Total to collect sums; its filter is a view over one read.

const P = plan({ id: "p1", price: 20, currencyId: null, durationMonths: 1 });
const L = line({ id: "line-1", startDate: "2026-01-01", planId: "p1", plan: P });
const C = customer({ id: "cust-1", name: "Ali", customerPlans: [L] });

async function argsFor(customers: Customer[], skips: SkippedMonth[] = []): Promise<CollectTotalArgs> {
  const stored = await chargeService.getOpenCharges({});
  const billsByLine = await chargeService.getMonthBillsForLines(
    customers.flatMap((c) => (c.customerPlans ?? []).map((l) => l.id)),
  );
  return { customers, stored, billsByLine, skips, unpaidRule: "month_start", currencies: [LBP] };
}

beforeEach(() => {
  store.reset();
  freezeToday(2026, 3, 15);
});
afterEach(unfreeze);

describe("To collect page", () => {
  it("TC-TCL-01 a customer with only unpaid months is listed, the months apart from debts", async () => {
    const view = buildOwedView(owedItems(await argsFor([C])));
    expect(view.customers).toHaveLength(1);
    const ali = view.customers[0];
    expect(ali.items).toEqual([]);
    expect(ali.unpaidMonths.map((m) => m.billingMonth)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    expect(customerOwedUsd(ali)).toBe(60);
    expect(view.summary).toMatchObject({ totalUsd: 60, monthsUsd: 60, customerCount: 1 });
  });

  it("TC-TCL-02 the page total equals the dashboard Total to collect", async () => {
    store.seedCharge({ id: "chg-jan", amount: 30 });
    store.seedCollection("chg-jan", 10);
    store.seedCharge({ id: "chg-sale", kind: "sale", customer_plan_id: null, billing_month: null, amount: 15 });
    store.seedCharge({ id: "chg-other", kind: "manual", customer_id: "cust-2", customer_plan_id: null, billing_month: null, amount: 7 });
    const args = await argsFor([C]);
    const view = buildOwedView(owedItems(args));
    const total = collectTotal(args);
    expect(view.summary.totalUsd).toBe(total.totalUsd);
    expect(view.summary.monthsUsd).toBe(total.byKind.month);
    expect(view.summary.salesUsd).toBe(total.byKind.sale);
    expect(view.summary.manualUsd).toBe(total.byKind.manual);
    expect(total.totalUsd).toBe(20 + 20 + 20 + 15 + 7);
  });

  it("TC-TCL-03 the Debts filter is exactly the old Debts page; an empty month bill stays out", async () => {
    store.seedCharge({ id: "chg-jan", amount: 20 });
    store.seedCollection("chg-jan", 5);
    store.seedCharge({ id: "chg-feb", billing_month: "2026-02-01", due_date: "2026-02-01" });
    store.seedCharge({ id: "chg-sale", kind: "sale", customer_plan_id: null, billing_month: null, amount: 15 });
    const args = await argsFor([C]);
    const debts = showOwed(buildOwedView(owedItems(args)), "debts");
    const oldPage = chargeService.buildDebtsView(args.stored);
    const rows = (v: typeof debts) => flattenOwed(v).map((i) => [i.chargeId, i.balance]);
    expect(rows(debts)).toEqual(rows(oldPage));
    expect(debts.summary).toEqual(oldPage.summary);
    expect(flattenOwed(debts).map((i) => i.chargeId).sort()).toEqual(["chg-jan", "chg-sale"]);
    expect(debts.summary.totalUsd).toBe(15 + 15);
  });

  it("TC-TCL-04 the Unpaid months filter holds only months nothing was paid on", async () => {
    store.seedCharge({ id: "chg-jan", amount: 20 });
    store.seedCollection("chg-jan", 5);
    store.seedCharge({ id: "chg-sale", kind: "sale", customer_plan_id: null, billing_month: null, amount: 15 });
    const months = showOwed(buildOwedView(owedItems(await argsFor([C]))), "months");
    expect(flattenOwed(months).map((i) => i.billingMonth)).toEqual(["2026-02-01", "2026-03-01"]);
    expect(flattenOwed(months).every((i) => !i.isDebt)).toBe(true);
    expect(months.summary.totalUsd).toBe(40);
  });

  it("TC-TCL-05 All, Debts and Unpaid months add up; All returns the held view itself", async () => {
    store.seedCharge({ id: "chg-sale", kind: "sale", customer_plan_id: null, billing_month: null, amount: 15 });
    const all = buildOwedView(owedItems(await argsFor([C])));
    expect(showOwed(all, "all")).toBe(all);
    expect(showOwed(all, "debts").summary.totalUsd + showOwed(all, "months").summary.totalUsd).toBe(
      all.summary.totalUsd,
    );
  });

  it("TC-TCL-06 the customer card amount is debts plus unpaid months", async () => {
    store.seedCharge({ id: "chg-sale", kind: "sale", customer_plan_id: null, billing_month: null, amount: 15 });
    const owed = owedByCustomerOf(buildOwedView(owedItems(await argsFor([C]))));
    expect(owed["cust-1"]).toEqual({ debtUsd: 15, toCollectUsd: 75 });
  });

  it("TC-TCL-07 an inactive or occasional customer owes only their debts", async () => {
    store.seedCharge({ id: "chg-x", customer_id: "cust-2", customer_plan_id: "line-2", amount: 20 });
    const owed = owedByCustomerOf(buildOwedView(owedItems(await argsFor([]))));
    expect(owed["cust-2"]).toBeUndefined();
    store.seedCollection("chg-x", 5);
    const after = owedByCustomerOf(buildOwedView(owedItems(await argsFor([]))));
    expect(after["cust-2"]).toEqual({ debtUsd: 15, toCollectUsd: 15 });
  });
  it("TC-TCL-08 an N-month plan owes ONE bill per unpaid block, not one per month", () => {
    const yearly = plan({ id: "p12", price: 160, currencyId: null, durationMonths: 12 });
    const twoMonth = plan({ id: "p2", price: 30, currencyId: null, durationMonths: 2 });
    const year = line({ id: "line-12", startDate: "2026-02-01", planId: "p12", plan: yearly });
    const pair = line({ id: "line-2", startDate: "2026-01-01", planId: "p2", plan: twoMonth });
    const args: CollectTotalArgs = {
      customers: [customer({ id: "cust-1", name: "Ali", customerPlans: [year, pair] })],
      stored: [],
      billsByLine: new Map(),
      skips: [],
      unpaidRule: "month_start",
      currencies: [LBP],
    };
    const rows = owedItems(args).map((i) => [i.customerPlanId, i.billingMonth, i.durationMonths, i.balance]);
    expect(rows).toHaveLength(3);
    expect(rows).toEqual(
      expect.arrayContaining([
        ["line-12", "2026-02-01", 12, 160],
        ["line-2", "2026-01-01", 2, 30],
        ["line-2", "2026-03-01", 2, 30],
      ]),
    );
    expect(collectTotal(args).totalUsd).toBe(220);
  });

  it("TC-TCL-09 one customer's To collect (link, customer page) equals their row on the page", async () => {
    store.seedCharge({ id: "chg-sale", kind: "sale", customer_plan_id: null, billing_month: null, amount: 15 });
    const page = buildOwedView(owedItems(await argsFor([C]))).customers[0];
    const one = customerOwedEntry(
      C,
      await ledgerService.getToCollect({ customer: C, skips: [], unpaidRule: "month_start", currencies: [LBP] }),
    );
    expect(customerOwedUsd(one)).toBe(customerOwedUsd(page));
    expect(one.unpaidMonths.map((m) => m.billingMonth)).toEqual(page.unpaidMonths.map((m) => m.billingMonth));
    expect(one.items.map((i) => i.chargeId)).toEqual(["chg-sale"]);
  });

  it("TC-TCL-10 an inactive customer's To collect is debts only; owing nothing gives an empty entry", async () => {
    const gone = customer({ id: "cust-1", name: "Ali", active: false, customerPlans: [L] });
    expect(customerOwedUsd(customerOwedEntry(gone, await ledgerService.getToCollect({ customer: gone, skips: [], unpaidRule: "month_start", currencies: [LBP] })))).toBe(0);
    store.seedCharge({ id: "chg-jan", amount: 20 });
    store.seedCollection("chg-jan", 5);
    const owed = await ledgerService.getToCollect({ customer: gone, skips: [], unpaidRule: "month_start", currencies: [LBP] });
    expect(owed.map((i) => [i.chargeId, i.balance])).toEqual([["chg-jan", 15]]);
    expect(customerOwedEntry(gone, []).customerName).toBe("Ali");
  });
});
