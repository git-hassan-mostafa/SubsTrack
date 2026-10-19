import i18n from "@shared/core/i18n";
import type { CustomerPlan, PlanUsage } from "@shared/core/types";
import type { DbCustomerPlan } from "@shared/core/types/db";
import { isStartReadingLocked } from "@shared/modules/customer/customer-payments/utils/usageBill";
import customerPlanService, {
  type LineDraft,
} from "@shared/modules/customer/customer-plans/services/CustomerPlanService";
import {
  lineRowsChanged,
  newLineRow,
  rowsFromCustomer,
  toLineDrafts,
  type LineRow,
} from "@shared/modules/customer/customer-plans/utils/lineDrafts";
import { lineStore } from "../helpers/fakePriceHistory";
import { store } from "../helpers/fakeLedger";
import { line, plan } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";

// TC-ML-* — a meter line's number and start reading: what is saved, and when the reading locks.

const METER: PlanUsage = {
  entry: "reading",
  unitName: "kWh",
  feeName: "Fixed fee",
  highUsagePercent: null,
};

const fixedPlan = plan({ id: "p-fixed" });
const meterPlan = plan({ id: "p-meter", price: null, usage: METER });
const typedPlan = plan({ id: "p-typed", price: null, usage: { ...METER, entry: "direct" } });
const PLANS = [fixedPlan, meterPlan, typedPlan];

function row(over: Partial<LineRow> = {}): LineRow {
  return { ...newLineRow(1, "2026-01-01"), ...over };
}

describe("meter fields in the line drafts", () => {
  it("TC-ML-01 a meter line keeps its trimmed meter number and start reading, never a special price", () => {
    const [draft] = toLineDrafts(
      [row({ planId: "p-meter", meterNumber: "  M-7 ", startReading: 1520, customPrice: 30 })],
      PLANS,
    );
    expect(draft).toMatchObject({
      meterNumber: "M-7",
      startReading: 1520,
      customPrice: null,
      customCurrencyId: null,
    });
  });

  it("TC-ML-02 a typed-usage or fixed line saves no meter fields", () => {
    const drafts = toLineDrafts(
      [
        row({ planId: "p-typed", meterNumber: "M-7", startReading: 10, customPrice: 30 }),
        row({ planId: "p-fixed", meterNumber: "M-7", startReading: 10, customPrice: 30 }),
      ],
      PLANS,
    );
    expect(drafts.map((d) => [d.meterNumber, d.startReading, d.customPrice])).toEqual([
      [null, null, null],
      [null, null, 30],
    ]);
  });

  it("TC-ML-03 a blank meter number is saved as none", () => {
    const [draft] = toLineDrafts([row({ planId: "p-meter", meterNumber: "   " })], PLANS);
    expect(draft.meterNumber).toBeNull();
  });

  it("TC-ML-04 editing the meter number or start reading marks the form changed", () => {
    const initial = [row({ planId: "p-meter" })];
    expect(lineRowsChanged(initial, [{ ...initial[0], meterNumber: "M-1" }], [])).toBe(true);
    expect(lineRowsChanged(initial, [{ ...initial[0], startReading: 5 }], [])).toBe(true);
    expect(lineRowsChanged(initial, [{ ...initial[0] }], [])).toBe(false);
  });

  it("TC-ML-04b a saved meter line keeps its fields when the plan list has not loaded it", () => {
    const saved = line({ id: "l-1", planId: "p-meter", plan: meterPlan, meterNumber: "M-7", startReading: 1520 });
    const [draft] = toLineDrafts(rowsFromCustomer({ customerPlans: [saved] }, "2026-01-01"), []);
    expect(draft).toMatchObject({ meterNumber: "M-7", startReading: 1520, customPrice: null });
  });

  it("TC-ML-04c a line moved to another plan reads that plan, not the saved one", () => {
    const saved = line({ id: "l-1", planId: "p-meter", plan: meterPlan, meterNumber: "M-7", startReading: 1520 });
    const [moved] = rowsFromCustomer({ customerPlans: [saved] }, "2026-01-01");
    const [draft] = toLineDrafts([{ ...moved, planId: "p-fixed" }], PLANS);
    expect([draft.meterNumber, draft.startReading]).toEqual([null, null]);
  });
});

describe("start reading lock", () => {
  it("TC-ML-05 money on the start month locks the start reading; later months alone do not", () => {
    expect(isStartReadingLocked("2026-03-15", ["2026-03-01"])).toBe(true);
    expect(isStartReadingLocked("2026-03-15", ["2026-04-01", "2026-05-01"])).toBe(false);
    expect(isStartReadingLocked("2026-03-15", [])).toBe(false);
  });
});

describe("saving a meter line", () => {
  const LIMITS = { customers: 100, plans: 100 };
  const saved = line({
    id: "line-1",
    planId: "p-meter",
    plan: meterPlan,
    startDate: "2026-03-01",
    meterNumber: "M-7",
    startReading: 1000,
  });

  const dbRow = (l: CustomerPlan): DbCustomerPlan => ({
    id: l.id,
    customer_id: l.customerId,
    plan_id: l.planId,
    start_date: l.startDate,
    cancelled_at: null,
    active: true,
    custom_price: l.customPrice,
    custom_currency_id: l.customCurrencyId,
    meter_number: l.meterNumber,
    start_reading: l.startReading,
    tenant_id: "t1",
    created_at: l.createdAt,
    updated_at: l.updatedAt,
  });

  const payMonth = (month: string) => {
    const charge = store.seedCharge({ customer_plan_id: "line-1", billing_month: month, due_date: month });
    store.seedCollection(charge.id, 20);
  };

  const sync = (next: Partial<LineDraft>) =>
    customerPlanService.syncLines(
      "cust-1",
      [
        {
          id: saved.id,
          planId: saved.planId,
          startDate: saved.startDate,
          customPrice: null,
          customCurrencyId: null,
          meterNumber: saved.meterNumber,
          startReading: saved.startReading,
          ...next,
        },
      ],
      [],
      [],
      "t1",
      [saved],
      LIMITS,
      { customers: 1, plans: 1 },
    );

  beforeEach(() => {
    store.reset();
    lineStore.reset();
    lineStore.rows = [dbRow(saved)];
    freezeToday(2026, 10, 15);
  });
  afterEach(unfreeze);

  it("TC-ML-06 the start reading cannot change once the start month got money", async () => {
    payMonth("2026-03-01");
    lineStore.paidLineIds = ["line-1"];
    await expect(sync({ startReading: 900 })).rejects.toThrow(
      i18n.t("errors.start_reading_locked_paid"),
    );
    expect(lineStore.rows[0].start_reading).toBe(1000);
  });

  it("TC-ML-07 the start reading can still be fixed when only later months got money", async () => {
    payMonth("2026-04-01");
    lineStore.paidLineIds = ["line-1"];
    await sync({ startReading: 900 });
    expect(lineStore.rows[0].start_reading).toBe(900);
  });

  it("TC-ML-08 the meter number stays editable on a paid line", async () => {
    payMonth("2026-03-01");
    lineStore.paidLineIds = ["line-1"];
    await sync({ meterNumber: "M-8" });
    expect(lineStore.rows[0].meter_number).toBe("M-8");
  });

  it("TC-ML-09 a start reading below 0 is refused", async () => {
    await expect(sync({ startReading: -1 })).rejects.toThrow(
      i18n.t("errors.start_reading_not_negative"),
    );
  });
});
