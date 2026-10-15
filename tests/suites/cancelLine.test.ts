import i18n from "@shared/core/i18n";
import type { CustomerPlan } from "@shared/core/types";
import type { DbCustomerPlan } from "@shared/core/types/db";
import { lastBillableMonth } from "@shared/modules/customer/customer-payments/utils/payWindow";
import customerPlanService, {
  type RemovedLine,
} from "@shared/modules/customer/customer-plans/services/CustomerPlanService";
import {
  cancelDateBounds,
  isCancelDateAllowed,
} from "@shared/modules/customer/customer-plans/utils/cancelDate";
import { lineStore } from "../helpers/fakePriceHistory";
import { store } from "../helpers/fakeLedger";
import { customer, line } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";

// TC-CL-* — a stopped plan ends its pay window on the picked day, never before money.

const LIMITS = { customers: 100, plans: 100 };

const dbRow = (l: CustomerPlan): DbCustomerPlan => ({
  id: l.id,
  customer_id: l.customerId,
  plan_id: l.planId,
  start_date: l.startDate,
  cancelled_at: null,
  active: true,
  custom_price: l.customPrice,
  custom_currency_id: l.customCurrencyId,
  tenant_id: "t1",
  created_at: l.createdAt,
  updated_at: l.updatedAt,
});

describe("cancel date bounds", () => {
  it("TC-CL-01 an unpaid line allows its start date up to today, nothing outside", () => {
    const bounds = cancelDateBounds("2026-03-01", null, "2026-10-15");
    expect(isCancelDateAllowed("2026-03-01", bounds)).toBe(true);
    expect(isCancelDateAllowed("2026-10-15", bounds)).toBe(true);
    expect(isCancelDateAllowed("2026-02-28", bounds)).toBe(false);
    expect(isCancelDateAllowed("2026-10-16", bounds)).toBe(false);
    expect(isCancelDateAllowed("", bounds)).toBe(false);
  });

  it("TC-CL-02 a line that starts later can only stop today", () => {
    expect(cancelDateBounds("2026-12-01", null, "2026-10-15")).toEqual({
      min: "2026-10-15",
      max: "2026-10-15",
    });
  });

  it("TC-CL-03 the last paid month is the earliest stop month", () => {
    const bounds = cancelDateBounds("2026-01-01", "2026-09-01", "2026-10-15");
    expect(bounds).toEqual({ min: "2026-09-01", max: "2026-10-15" });
    expect(isCancelDateAllowed("2026-08-31", bounds)).toBe(false);
  });

  it("TC-CL-04 a line paid ahead can only stop in its last paid month", () => {
    expect(cancelDateBounds("2026-01-01", "2026-12-01", "2026-10-15")).toEqual({
      min: "2026-12-01",
      max: "2026-12-01",
    });
  });
});

describe("cancelling a paid line on a picked day", () => {
  const kept = line({ id: "line-1", startDate: "2026-01-01" });
  const other = line({ id: "line-2", startDate: "2026-01-01" });

  const monthBill = (month: string) =>
    store.seedCharge({
      customer_plan_id: "line-1",
      billing_month: month,
      due_date: month,
    });

  const payMonths = (...months: string[]) => {
    for (const month of months) store.seedCollection(monthBill(month).id, 20);
  };

  const sync = (removed: RemovedLine[]) =>
    customerPlanService.syncLines(
      "cust-1",
      [
        {
          id: other.id,
          planId: other.planId,
          startDate: other.startDate,
          customPrice: other.customPrice,
          customCurrencyId: other.customCurrencyId,
        },
      ],
      removed,
      [],
      "t1",
      [kept, other],
      LIMITS,
      { customers: 1, plans: 2 },
    );

  const stopOn = (cancelDate: string) => sync([{ id: "line-1", hardDelete: false, cancelDate }]);

  beforeEach(() => {
    store.reset();
    lineStore.reset();
    lineStore.rows = [dbRow(kept), dbRow(other)];
    lineStore.paidLineIds = ["line-1"];
    freezeToday(2026, 10, 15);
  });
  afterEach(unfreeze);

  it("TC-CL-05 an earlier stop day closes the pay window at that month", async () => {
    payMonths("2026-01-01", "2026-02-01");
    const { cancelled } = await stopOn("2026-06-20");
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].active).toBe(false);
    expect(lastBillableMonth(customer(), cancelled[0])).toEqual({ year: 2026, month: 6 });
  });

  it("TC-CL-06 a stop day inside the last paid month is allowed", async () => {
    payMonths("2026-08-01", "2026-09-01");
    const { cancelled } = await stopOn("2026-09-10");
    expect(lastBillableMonth(customer(), cancelled[0])).toEqual({ year: 2026, month: 9 });
  });

  it("TC-CL-07 a stop day one month before the last paid month is refused, nothing written", async () => {
    payMonths("2026-08-01", "2026-09-01");
    await expect(stopOn("2026-08-31")).rejects.toThrow(i18n.t("errors.cancel_date_range"));
    expect(lineStore.rows[0].active).toBe(true);
    expect(lineStore.rows[0].cancelled_at).toBeNull();
  });

  it("TC-CL-08 voided cash does not hold the stop day back", async () => {
    store.seedCollection(monthBill("2026-09-01").id, 20, {
      voided_at: "2026-09-05T10:00:00.000Z",
    });
    payMonths("2026-02-01");
    const { cancelled } = await stopOn("2026-06-20");
    expect(lastBillableMonth(customer(), cancelled[0])).toEqual({ year: 2026, month: 6 });
  });

  it("TC-CL-09 a stop day before the start or after today is refused, nothing written", async () => {
    await expect(stopOn("2025-12-31")).rejects.toThrow(i18n.t("errors.cancel_date_range"));
    await expect(stopOn("2026-10-16")).rejects.toThrow(i18n.t("errors.cancel_date_range"));
    expect(lineStore.rows[0].active).toBe(true);
    expect(lineStore.rows[0].cancelled_at).toBeNull();
  });
});
