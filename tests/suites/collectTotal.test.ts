import type { Customer, SkippedMonth } from "@shared/core/types";
import { ledgerService } from "@shared/modules/ledger/services/LedgerService";
import { chargeService } from "@shared/modules/ledger/services/ChargeService";
import { collectTotal } from "@shared/modules/ledger/utils/collectTotal";
import { store } from "../helpers/fakeLedger";
import { customer, line, plan, skip, LBP } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";

const P = plan({ id: "p1", price: 20, currencyId: null, durationMonths: 1 });
const L = line({ id: "line-1", startDate: "2026-01-01", planId: "p1", plan: P });
const C = customer({ id: "cust-1", customerPlans: [L] });

async function totalFor(customers: Customer[], skips: SkippedMonth[] = []) {
  const stored = await chargeService.getOpenCharges({});
  const billsByLine = await chargeService.getMonthBillsForLines(
    customers.flatMap((c) => (c.customerPlans ?? []).map((l) => l.id)),
  );
  return collectTotal({
    customers,
    stored,
    billsByLine,
    skips,
    unpaidRule: "month_start",
    currencies: [LBP],
  });
}

beforeEach(() => {
  store.reset();
  freezeToday(2026, 3, 15);
});
afterEach(unfreeze);

describe("collectTotal", () => {
  it("TC-CT-01 months with nothing paid are counted", async () => {
    const total = await totalFor([C]);
    expect(total.totalUsd).toBe(60);
    expect(total.unpricedLines).toBe(0);
  });

  it("TC-CT-02 equals the sum of what the collect sheet asks each customer", async () => {
    store.seedCharge({ id: "chg-jan", amount: 30 });
    store.seedCollection("chg-jan", 10);
    store.seedCharge({ id: "chg-feb", billing_month: "2026-02-01", due_date: "2026-02-01" });
    store.seedCharge({
      id: "chg-sale",
      kind: "sale",
      customer_plan_id: null,
      billing_month: null,
      amount: 15,
    });
    const skips = [skip("2026-03-01")];
    const owed = await ledgerService.getOwed({
      customer: C,
      lines: [L],
      skips,
      unpaidRule: "month_start",
      currencies: [LBP],
    });
    const asked = owed.reduce((sum, i) => sum + i.balance / i.ratePerUsdSnapshot, 0);
    const total = await totalFor([C], skips);
    expect(total.totalUsd).toBe(asked);
    expect(total.totalUsd).toBe(20 + 20 + 15);
    expect(total.byKind).toEqual({ month: 40, sale: 15, manual: 0 });
  });

  it("TC-CT-03 an empty stored month bill is not counted twice", async () => {
    store.seedCharge({ id: "chg-jan", amount: 30 });
    const total = await totalFor([C]);
    expect(total.totalUsd).toBe(60);
  });

  it("TC-CT-04 a customer outside the list counts only their Debts", async () => {
    store.seedCharge({ id: "chg-part", customer_id: "cust-2", customer_plan_id: "line-2", amount: 20 });
    store.seedCollection("chg-part", 5);
    store.seedCharge({
      id: "chg-empty",
      customer_id: "cust-2",
      customer_plan_id: "line-2",
      billing_month: "2026-02-01",
      due_date: "2026-02-01",
    });
    store.seedCharge({
      id: "chg-sale",
      kind: "sale",
      customer_id: "cust-2",
      customer_plan_id: null,
      billing_month: null,
      amount: 40,
    });
    const total = await totalFor([]);
    expect(total.totalUsd).toBe(15 + 40);
  });

  it("TC-CT-05 skipped months and inactive lines are not counted", async () => {
    const cancelled = line({ id: "line-2", startDate: "2026-01-01", plan: P, active: false });
    const both = customer({ id: "cust-1", customerPlans: [L, cancelled] });
    const total = await totalFor([both], [skip("2026-02-01")]);
    expect(total.totalUsd).toBe(40);
  });

  it("TC-CT-06 a plan with no set price adds nothing but is counted as left out", async () => {
    const open = line({
      id: "line-2",
      startDate: "2026-01-01",
      plan: plan({ id: "p2", isCustomPrice: true, price: 0 }),
    });
    const both = customer({ id: "cust-1", customerPlans: [L, open] });
    const total = await totalFor([both]);
    expect(total.totalUsd).toBe(60);
    expect(total.unpricedLines).toBe(1);
  });

  it("TC-CT-07 an unpaid LBP month is valued at today's rate", async () => {
    const lbp = line({
      id: "line-1",
      startDate: "2026-03-01",
      plan: plan({ id: "p3", price: 900000, currencyId: LBP.id }),
    });
    const total = await totalFor([customer({ id: "cust-1", customerPlans: [lbp] })]);
    expect(total.totalUsd).toBe(10);
  });
});
