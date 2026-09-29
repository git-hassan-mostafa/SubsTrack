import {
  allowanceFloor,
  openingAllowanceTotal,
  readAllowanceDraft,
  withCustomerTotal,
} from "@shared/modules/admin/billing/utils/allowanceDraft";
import type { QuotaPair } from "@shared/modules/admin/billing/utils/types";

// TC-AD-* — the "update your limits" form rules both apps share.

const limits: QuotaPair = { customers: 50, plans: 60 };
const active: QuotaPair = { customers: 40, plans: 45 };

const draftFor = (total: QuotaPair, editing = false) =>
  readAllowanceDraft({ total, limits, active, editing });

describe("allowance draft", () => {
  it("TC-AD-01 an unchanged form is not valid", () => {
    const draft = draftFor(limits);
    expect(draft.raising).toBe(false);
    expect(draft.lowering).toBe(false);
    expect(draft.valid).toBe(false);
  });

  it("TC-AD-02 a raise must ask for at least 10 in total, across both limits", () => {
    expect(draftFor({ customers: 55, plans: 64 }).tooSmallRaise).toBe(true);
    const draft = draftFor({ customers: 55, plans: 65 });
    expect(draft.tooSmallRaise).toBe(false);
    expect(draft.valid).toBe(true);
    expect(draft.extra).toEqual({ customers: 5, plans: 5 });
  });

  it("TC-AD-03 raising one limit and lowering the other is refused", () => {
    const draft = draftFor({ customers: 70, plans: 55 });
    expect(draft.mixed).toBe(true);
    expect(draft.valid).toBe(false);
    expect(draft.extra).toEqual({ customers: 20, plans: 0 });
  });

  it("TC-AD-04 a cut below what is active names that limit", () => {
    const draft = draftFor({ customers: 45, plans: 44 });
    expect(draft.overCap).toEqual(["plans"]);
    expect(draft.valid).toBe(false);
  });

  it("TC-AD-05 the customer limit never goes under 30", () => {
    const low = readAllowanceDraft({
      total: { customers: 29, plans: 60 },
      limits,
      active: { customers: 0, plans: 0 },
      editing: false,
    });
    expect(low.belowMinimum).toBe(true);
    expect(low.valid).toBe(false);
  });

  it("TC-AD-06 a valid cut is valid and asks for nothing", () => {
    const draft = draftFor({ customers: 45, plans: 50 });
    expect(draft.lowering).toBe(true);
    expect(draft.valid).toBe(true);
    expect(draft.extra).toEqual({ customers: 0, plans: 0 });
  });

  it("TC-AD-07 editing a request never lowers and ignores the active floor", () => {
    const pending = { customers: 10, plans: 0 };
    const total = openingAllowanceTotal(limits, pending);
    expect(total).toEqual({ customers: 60, plans: 60 });
    const draft = draftFor(total, true);
    expect(draft.lowering).toBe(false);
    expect(draft.overCap).toEqual([]);
    expect(draft.valid).toBe(true);
  });

  it("TC-AD-08 raising customers carries plans up, never down", () => {
    expect(withCustomerTotal({ customers: 50, plans: 60 }, 70)).toEqual({
      customers: 70,
      plans: 70,
    });
    expect(withCustomerTotal({ customers: 50, plans: 60 }, 40)).toEqual({
      customers: 40,
      plans: 60,
    });
  });

  it("TC-AD-09 floors: 30 customers, plans at customers, the limits when editing", () => {
    const total = { customers: 45, plans: 50 };
    expect(allowanceFloor("customers", total, limits, false)).toBe(30);
    expect(allowanceFloor("plans", total, limits, false)).toBe(45);
    expect(allowanceFloor("customers", total, limits, true)).toBe(50);
    expect(allowanceFloor("plans", total, limits, true)).toBe(60);
  });
});
