import {
  bulkQuickPayPlan,
  canQuickPay,
  currentMonthItems,
  fixedMonthItems,
  isMultiPlan,
  quickPayInputs,
  startedActiveLines,
} from "@shared/modules/customer/customers/utils/quickPay";
import { onCalendarDay } from "@shared/core/utils/date";
import type { Currency, CustomerStatus } from "@shared/core/types";
import { LBP, customer, line, plan } from "../helpers/factories";

// TC-QP-* — quick pay from the customer list, both apps: which lines it may
// touch this month, which it can charge without asking, and the hand-overs a
// tap becomes (one per customer per currency, gotcha #108).

const TODAY = "2026-03-10";
const on = <T>(rule: () => T): T => onCalendarDay(TODAY, rule);

const currencies: Currency[] = [LBP];
const USD_PLAN = plan({ id: "plan-usd", name: "Internet", price: 20 });
const LBP_PLAN = plan({ id: "plan-lbp", name: "TV", price: 900_000, currencyId: LBP.id });
const TYPED_PLAN = plan({ id: "plan-typed", name: "Custom", price: null, isCustomPrice: true });
const BUNDLE_PLAN = plan({ id: "plan-3m", name: "Quarter", price: 55, durationMonths: 3 });

const usdLine = line({ id: "l-usd", plan: USD_PLAN, planId: USD_PLAN.id });
const lbpLine = line({ id: "l-lbp", plan: LBP_PLAN, planId: LBP_PLAN.id });
const typedLine = line({ id: "l-typed", plan: TYPED_PLAN, planId: TYPED_PLAN.id });
const bundleLine = line({ id: "l-3m", plan: BUNDLE_PLAN, planId: BUNDLE_PLAN.id });
const laterLine = line({ id: "l-later", plan: USD_PLAN, planId: USD_PLAN.id, startDate: "2026-05-01" });

const status = (over: Partial<CustomerStatus> = {}): CustomerStatus => ({
  status: "unpaid",
  overdue: false,
  planCount: { paid: 0, total: 1 },
  notDueLineIds: [],
  uncoveredLineIds: [],
  unpaidMonths: 0,
  ...over,
});

const author = { tenantId: "t1", receivedByUserId: "user-1" };

describe("which lines quick pay may touch", () => {
  it("TC-QP-01 a line that has not started yet is left out", () =>
    on(() => {
      const c = customer({ customerPlans: [usdLine, laterLine] });
      expect(startedActiveLines(c).map((l) => l.id)).toEqual(["l-usd"]);
      expect(isMultiPlan(c)).toBe(false);
    }));

  it("TC-QP-02 a cancelled line is left out", () =>
    on(() => {
      const c = customer({ customerPlans: [usdLine, { ...lbpLine, active: false }] });
      expect(currentMonthItems(c, status(), currencies).map((i) => i.customerPlanId)).toEqual(["l-usd"]);
    }));

  it("TC-QP-03 a line already paid or skipped this month is not due", () =>
    on(() => {
      const c = customer({ customerPlans: [usdLine, lbpLine] });
      const items = currentMonthItems(c, status({ notDueLineIds: ["l-usd"] }), currencies);
      expect(items.map((i) => i.customerPlanId)).toEqual(["l-lbp"]);
    }));

  it("TC-QP-04 a line with an OLDER unpaid month is sent to the grid (oldest first)", () =>
    on(() => {
      const c = customer({ customerPlans: [usdLine, lbpLine] });
      const items = currentMonthItems(c, status({ uncoveredLineIds: ["l-lbp"] }), currencies);
      expect(items.map((i) => i.customerPlanId)).toEqual(["l-usd"]);
    }));

  it("TC-QP-05 an inactive or non-regular customer never gets quick pay", () =>
    on(() => {
      expect(canQuickPay(customer({ customerPlans: [usdLine] }), status())).toBe(true);
      expect(canQuickPay(customer({ active: false, customerPlans: [usdLine] }), status())).toBe(false);
      expect(canQuickPay(customer({ isRegular: false, customerPlans: [usdLine] }), status())).toBe(false);
      expect(
        canQuickPay(customer({ customerPlans: [usdLine] }), status({ notDueLineIds: ["l-usd"] })),
      ).toBe(false);
    }));
});

describe("the month items", () => {
  it("TC-QP-06 a priced line is this month at the line's price, in its currency", () =>
    on(() => {
      const c = customer({ customerPlans: [lbpLine] });
      const [item] = currentMonthItems(c, status(), currencies);
      expect(item).toMatchObject({
        chargeId: null,
        billingMonth: "2026-03-01",
        dueDate: "2026-03-01",
        amount: 900_000,
        balance: 900_000,
        currencyId: LBP.id,
        ratePerUsdSnapshot: LBP.ratePerUsd,
        openAmount: false,
      });
      expect(item.label).toContain("TV");
    }));

  it("TC-QP-07 a line with no set price is an OPEN item and is not charged without asking", () =>
    on(() => {
      const c = customer({ customerPlans: [usdLine, typedLine] });
      const items = currentMonthItems(c, status(), currencies);
      expect(items.find((i) => i.customerPlanId === "l-typed")).toMatchObject({
        amount: 0,
        currencyId: null,
        openAmount: true,
      });
      expect(fixedMonthItems(c, status(), currencies).map((i) => i.customerPlanId)).toEqual(["l-usd"]);
    }));

  it("TC-QP-08 a multi-month plan keeps its duration", () =>
    on(() => {
      const [item] = currentMonthItems(customer({ customerPlans: [bundleLine] }), status(), currencies);
      expect(item.durationMonths).toBe(3);
      expect(item.amount).toBe(55);
    }));
});

describe("bulkQuickPayPlan", () => {
  it("TC-QP-09 counts skipped typed lines and multi-month lines per LINE", () =>
    on(() => {
      const a = customer({ id: "c-a", customerPlans: [usdLine, typedLine] });
      const b = customer({ id: "c-b", customerPlans: [bundleLine] });
      const off = customer({ id: "c-off", active: false, customerPlans: [usdLine] });
      const plan = bulkQuickPayPlan(
        [
          { customer: a, status: status() },
          { customer: b, status: status() },
          { customer: off, status: status() },
        ],
        currencies,
      );
      expect(plan.requests.map((r) => `${r.customerId}:${r.customerPlanId}`)).toEqual([
        "c-a:l-usd",
        "c-b:l-3m",
      ]);
      expect(plan.typedCount).toBe(1);
      expect(plan.multiCount).toBe(1);
    }));

  it("TC-QP-10 nothing to pay when every selected customer is covered", () =>
    on(() => {
      const plan = bulkQuickPayPlan(
        [{ customer: customer({ customerPlans: [usdLine] }), status: status({ notDueLineIds: ["l-usd"] }) }],
        currencies,
      );
      expect(plan.requests).toEqual([]);
    }));
});

describe("quickPayInputs", () => {
  it("TC-QP-11 one hand-over per customer per currency, each paying its whole month", () =>
    on(() => {
      const a = customer({ id: "c-a", branchId: "b-1", customerPlans: [usdLine, lbpLine, bundleLine] });
      const b = customer({ id: "c-b", branchId: "b-2", customerPlans: [usdLine] });
      const items = [
        ...fixedMonthItems(a, status(), currencies),
        ...fixedMonthItems(b, status(), currencies),
      ];
      const inputs = quickPayInputs(items, author, "2026-03-10T09:00:00.000Z");
      expect(inputs.map((i) => [i.customerId, i.currencyId, i.amount, i.lines.length])).toEqual([
        ["c-a", null, 75, 2],
        ["c-a", LBP.id, 900_000, 1],
        ["c-b", null, 20, 1],
      ]);
      for (const input of inputs) {
        expect(input.lines.every((l) => l.settles && l.amount === l.item.balance)).toBe(true);
        expect(input.receivedAt).toBe("2026-03-10T09:00:00.000Z");
        expect(input.receivedByUserId).toBe("user-1");
        expect(input.notes).toBeNull();
      }
      expect(inputs[0].branchId).toBe("b-1");
      expect(inputs[2].branchId).toBe("b-2");
      expect(inputs[1].ratePerUsdSnapshot).toBe(LBP.ratePerUsd);
    }));

  it("TC-QP-12 no items, no hand-overs", () => {
    expect(quickPayInputs([], author, "x")).toEqual([]);
  });
});
