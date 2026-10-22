import i18n from "@shared/core/i18n";
import type { PlanUsage } from "@shared/core/types";
import planService from "@shared/modules/admin/plans/services/PlanService";
import { mapDbPlanToPlan } from "@shared/modules/admin/plans/utils/mapper";
import { priceHistoryService } from "@shared/modules/customer/customer-plans/services/PriceHistoryService";
import { usageReadingService } from "@shared/modules/customer/customer-payments/services/UsageReadingService";
import { mapDbChargeToCharge } from "@shared/modules/ledger/utils/mapper";
import { priceStore } from "../helpers/fakePriceHistory";
import { readingStore } from "../helpers/fakeUsageReadings";
import { charge, line, plan } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";

// TC-UP-* — usage plans: saving the plan, its month prices and its readings.

const METER: PlanUsage = {
  entry: "reading",
  unitName: "kWh",
  feeName: "Fixed fee",
  highUsagePercent: 50,
};

const usageInput = (over: Partial<PlanUsage> = {}) => ({
  name: "10A",
  isCustomPrice: false,
  price: null,
  durationMonths: 1,
  currencyId: "cur-lbp",
  branchId: null,
  usage: { ...METER, ...over },
  prepaid: false,
});

const usagePlan = plan({ id: "p-10a", name: "10A", price: null, currencyId: "cur-lbp", usage: METER });
const meterLine = line({ id: "line-1", planId: "p-10a", plan: usagePlan, startDate: "2026-03-01" });

beforeEach(() => {
  priceStore.reset();
  readingStore.reset();
  freezeToday(2026, 9, 3);
});
afterEach(unfreeze);

describe("saving a usage plan", () => {
  it("TC-UP-01 a usage plan is stored with no plan price, one month, and its own names", async () => {
    const saved = await planService.createPlan(usageInput(), "t1");
    const row = priceStore.catalog[0];
    expect(row).toMatchObject({
      billing_type: "usage",
      usage_entry: "reading",
      unit_name: "kWh",
      fee_name: "Fixed fee",
      high_usage_percent: 50,
      price: null,
      is_custom_price: false,
      duration_months: 1,
      currency_id: "cur-lbp",
    });
    expect(saved.usage).toEqual(METER);
  });

  it("TC-UP-02 a usage plan needs a unit name and a fee name", async () => {
    await expect(planService.createPlan(usageInput({ unitName: " " }), "t1")).rejects.toThrow(
      i18n.t("errors.plan_unit_name_required"),
    );
    await expect(planService.createPlan(usageInput({ feeName: "" }), "t1")).rejects.toThrow(
      i18n.t("errors.plan_fee_name_required"),
    );
    await expect(
      planService.createPlan(usageInput({ highUsagePercent: 0 }), "t1"),
    ).rejects.toThrow(i18n.t("errors.plan_high_usage_percent_positive"));
    expect(priceStore.catalog).toEqual([]);
  });

  it("TC-UP-03 a plan never switches between fixed price and usage", async () => {
    const fixed = plan({ id: "p1", price: 20 });
    await expect(planService.updatePlan(fixed, usageInput())).rejects.toThrow(
      i18n.t("errors.plan_type_locked"),
    );
    await expect(
      planService.updatePlan(usagePlan, { ...usageInput(), usage: null, price: 20 }),
    ).rejects.toThrow(i18n.t("errors.plan_type_locked"));
  });

  it("TC-UP-03b a saved usage plan never switches between meter reading and typed usage", async () => {
    await expect(planService.updatePlan(usagePlan, usageInput({ entry: "direct" }))).rejects.toThrow(
      i18n.t("errors.plan_usage_entry_locked"),
    );
    expect(priceStore.catalog).toEqual([]);
  });

  it("TC-UP-04 editing a usage plan writes no price history row", async () => {
    const before = await planService.createPlan(usageInput(), "t1");
    await planService.updatePlan(before, usageInput({ unitName: "kWh (day)" }));
    expect(priceStore.plans).toEqual([]);
    expect(priceStore.catalog[0].unit_name).toBe("kWh (day)");
  });

  it("TC-UP-05 an old mirror row with no billing type reads as a fixed plan", () => {
    const old = mapDbPlanToPlan({
      id: "p1",
      name: "Internet",
      price: 20,
      is_custom_price: false,
      duration_months: 1,
      currency_id: null,
      branch_id: null,
      tenant_id: "t1",
      created_at: "2026-01-01T00:00:00.000Z",
      billing_type: null,
      usage_entry: null,
      unit_name: null,
      fee_name: null,
      high_usage_percent: null,
      prepaid: false,
    });
    expect(old.usage).toBeNull();
  });
});

describe("month prices", () => {
  const plan15 = plan({ id: "p-15a", name: "15A", price: null, currencyId: "cur-lbp", usage: METER });

  it("TC-UP-06 one save prices the month on every picked plan, each with its own fee", async () => {
    const rows = await priceHistoryService.setUsageMonthPrices("2026-08-01", [
      { plan: usagePlan, unitPrice: 48241, fixedFee: 685000 },
      { plan: plan15, unitPrice: 48241, fixedFee: 985000 },
    ]);
    expect(rows.map((r) => [r.planId, r.fromMonth, r.price, r.fixedFee, r.currencyId])).toEqual([
      ["p-10a", "2026-08-01", 48241, 685000, "cur-lbp"],
      ["p-15a", "2026-08-01", 48241, 985000, "cur-lbp"],
    ]);
  });

  it("TC-UP-07 a month price is never set for a future month, a fixed plan, or a bad number", async () => {
    await expect(
      priceHistoryService.setUsageMonthPrices("2026-10-01", [
        { plan: usagePlan, unitPrice: 40000, fixedFee: 685000 },
      ]),
    ).rejects.toThrow(i18n.t("errors.usage_price_month"));
    await expect(
      priceHistoryService.setUsageMonthPrices("2026-08-01", [
        { plan: plan({ id: "p1", price: 20 }), unitPrice: 40000, fixedFee: 0 },
      ]),
    ).rejects.toThrow(i18n.t("errors.usage_price_fixed_plan"));
    await expect(
      priceHistoryService.setUsageMonthPrices("2026-08-01", [
        { plan: usagePlan, unitPrice: 0, fixedFee: 685000 },
      ]),
    ).rejects.toThrow(i18n.t("errors.usage_unit_price_positive"));
    await expect(
      priceHistoryService.setUsageMonthPrices("2026-08-01", [
        { plan: usagePlan, unitPrice: 40000, fixedFee: -1 },
      ]),
    ).rejects.toThrow(i18n.t("errors.usage_fixed_fee_not_negative"));
    expect(priceStore.plans).toEqual([]);
  });

  it("TC-UP-08 a refused plan in the batch saves none of them", async () => {
    await expect(
      priceHistoryService.setUsageMonthPrices("2026-08-01", [
        { plan: usagePlan, unitPrice: 48241, fixedFee: 685000 },
        { plan: plan15, unitPrice: -5, fixedFee: 985000 },
      ]),
    ).rejects.toThrow();
    expect(priceStore.plans).toEqual([]);
  });
});

describe("usage readings", () => {
  const save = (billingMonth: string, value: number, by = "user-1") =>
    usageReadingService.save({
      line: meterLine,
      billingMonth,
      value,
      meterChange: null,
      recordedByUserId: by,
    });

  it("TC-UP-09 a meter plan stores the reading, never typed units", async () => {
    const saved = await save("2026-08-01", 1250);
    expect(saved).toMatchObject({ reading: 1250, units: null, billingMonth: "2026-08-01" });
  });

  it("TC-UP-10 a typed-usage plan stores units, never a reading", async () => {
    const gb = line({
      id: "line-2",
      plan: plan({ id: "p-gb", price: null, usage: { ...METER, entry: "direct", unitName: "GB" } }),
      startDate: "2026-03-01",
    });
    const saved = await usageReadingService.save({
      line: gb,
      billingMonth: "2026-08-01",
      value: 40,
      meterChange: { oldMeterFinal: 1, newMeterStart: 0, newMeterNumber: null },
      recordedByUserId: "user-1",
    });
    expect(saved).toMatchObject({ reading: null, units: 40, meterChange: null });
  });

  it("TC-UP-11 fixing a reading keeps ONE row, and the first save's time and author", async () => {
    const first = await save("2026-08-01", 1250, "collector");
    jest.advanceTimersByTime(3 * 24 * 60 * 60 * 1000);
    const fixed = await save("2026-08-01", 1205, "admin");
    expect(readingStore.rows).toHaveLength(1);
    expect(fixed.reading).toBe(1205);
    expect(fixed.recordedAt).toBe(first.recordedAt);
    expect(fixed.recordedByUserId).toBe("collector");
  });

  it("TC-UP-12 a removed reading is gone from reads; saving again brings the month back", async () => {
    const first = await save("2026-08-01", 1250);
    await usageReadingService.remove(first, "admin");
    expect(await usageReadingService.getForLines(["line-1"])).toEqual([]);
    await save("2026-08-01", 1260);
    const again = await usageReadingService.getForLines(["line-1"]);
    expect(again.map((r) => r.reading)).toEqual([1260]);
    expect(readingStore.rows).toHaveLength(1);
  });

  it("TC-UP-13 usage is never saved before the line starts, for a future month, or below 0", async () => {
    await expect(save("2026-02-01", 100)).rejects.toThrow(i18n.t("errors.usage_before_start"));
    await expect(save("2026-10-01", 100)).rejects.toThrow(i18n.t("errors.usage_future_month"));
    await expect(save("2026-08-01", -1)).rejects.toThrow(i18n.t("errors.usage_value_invalid"));
    await expect(save("2026-08-15", 100)).rejects.toThrow(i18n.t("errors.billing_month_format"));
    expect(readingStore.rows).toEqual([]);
  });

  it("TC-UP-14 a fixed-price line takes no usage", async () => {
    await expect(
      usageReadingService.save({
        line: line({ plan: plan({ price: 20 }) }),
        billingMonth: "2026-08-01",
        value: 5,
        meterChange: null,
        recordedByUserId: "user-1",
      }),
    ).rejects.toThrow(i18n.t("errors.usage_line_not_usage"));
  });

  it("TC-UP-15 a meter change is kept with the month it happened in", async () => {
    const saved = await usageReadingService.save({
      line: meterLine,
      billingMonth: "2026-08-01",
      value: 40,
      meterChange: { oldMeterFinal: 1300, newMeterStart: 0, newMeterNumber: " M-77 " },
      recordedByUserId: "user-1",
    });
    expect(saved.meterChange).toEqual({ oldMeterFinal: 1300, newMeterStart: 0, newMeterNumber: "M-77" });
  });
});

describe("bill parts on a charge", () => {
  it("TC-UP-16 a usage bill keeps its parts; any other bill has none", () => {
    const usage = mapDbChargeToCharge({
      ...toDb(charge({ amount: 5_000_000 })),
      usage_previous_reading: 1130,
      usage_reading: 1250,
      usage_units: 120,
      unit_price: 40746,
      fixed_fee: 685000,
      computed_amount: 5574520,
    });
    expect(usage.usage).toEqual({
      previousReading: 1130,
      reading: 1250,
      units: 120,
      unitPrice: 40746,
      fixedFee: 685000,
      computedAmount: 5574520,
    });
    expect(usage.amount).toBe(5_000_000);
    expect(mapDbChargeToCharge(toDb(charge())).usage).toBeNull();
  });
});

function toDb(c: ReturnType<typeof charge>) {
  return {
    id: c.id,
    tenant_id: c.tenantId,
    branch_id: c.branchId,
    customer_id: c.customerId,
    kind: c.kind,
    customer_plan_id: c.customerPlanId,
    billing_month: c.billingMonth,
    duration_months: c.durationMonths,
    plan_id: c.planId,
    sale_id: c.saleId,
    description: c.description,
    amount: c.amount,
    currency_id: c.currencyId,
    rate_per_usd_snapshot: c.ratePerUsdSnapshot,
    issued_at: c.issuedAt,
    due_date: c.dueDate,
    recorded_by_user_id: c.recordedByUserId,
    notes: c.notes,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    voided_at: c.voidedAt,
    voided_by: c.voidedBy,
    void_reason: c.voidReason,
    written_off_at: c.writtenOffAt,
    written_off_by: c.writtenOffBy,
    write_off_reason: c.writeOffReason,
  };
}
