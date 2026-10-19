import i18n from "@shared/core/i18n";
import type {
  CustomerPlan,
  LineUsage,
  MonthEntry,
  PlanPriceChange,
  PlanUsage,
  StatusReading,
} from "@shared/core/types";
import { usageReadingService } from "@shared/modules/customer/customer-payments/services/UsageReadingService";
import {
  isReadingDraftChanged,
  readingDraftOf,
  readingInputOf,
  readingPreview,
  type ReadingDraft,
} from "@shared/modules/customer/customer-payments/utils/meterReadingForm";
import {
  monthMenuItems,
  monthSelectionGroups,
  monthTap,
  quickPayLinkAction,
  type LineGates,
} from "@shared/modules/customer/customer-payments/utils/monthActions";
import { lineUsageOf, usageByLineOf } from "@shared/modules/customer/customer-payments/utils/usageBill";
import { priceHistoryOf } from "@shared/modules/customer/customer-plans/utils/priceHistory";
import { getStore } from "@shared/state/globalStore";
import { buildGridsFor } from "@shared/state/slices/payments/utils/buildGrids";
import { store } from "../helpers/fakeLedger";
import { priceStore } from "../helpers/fakePriceHistory";
import { readingStore } from "../helpers/fakeUsageReadings";
import { line, plan } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";
import { greyed } from "../helpers/menus";

// TC-MR-* — entering a month's meter reading: the preview, the lock, and the grid door.

const METER: PlanUsage = {
  entry: "reading",
  unitName: "kWh",
  feeName: "Fixed fee",
  highUsagePercent: 50,
};

const meterPlan = plan({ id: "p-10a", price: null, currencyId: "cur-lbp", usage: METER });
const typedPlan = plan({
  id: "p-gb",
  price: null,
  currencyId: "cur-lbp",
  usage: { ...METER, entry: "direct", unitName: "GB" },
});

const meterLine = line({
  id: "line-1",
  planId: "p-10a",
  plan: meterPlan,
  startDate: "2026-06-10",
  startReading: 1000,
});
const typedLine = line({ id: "line-1", planId: "p-gb", plan: typedPlan, startDate: "2026-06-10" });

const JUNE = "2026-06-01";
const JULY = "2026-07-01";
const AUG = "2026-08-01";
const SEP = "2026-09-01";
const OCT = "2026-10-01";
const NOV = "2026-11-01";
const NOW = "2026-10-15T09:00:00.000Z";

function reading(billingMonth: string, value: number): StatusReading & { customerPlanId: string } {
  return {
    customerPlanId: "line-1",
    billingMonth,
    reading: value,
    units: null,
    meterChange: null,
    recordedAt: `${billingMonth.slice(0, 7)}-28T10:00:00.000Z`,
  };
}

function price(month: string, unitPrice: number, fixedFee: number): PlanPriceChange {
  return {
    id: `price-${month}`,
    planId: "p-10a",
    fromMonth: month,
    price: unitPrice,
    currencyId: "cur-lbp",
    durationMonths: 1,
    isCustomPrice: false,
    fixedFee,
    createdAt: `${month.slice(0, 7)}-25T10:00:00.000Z`,
  };
}

function usageOf(
  readings: (StatusReading & { customerPlanId: string })[],
  prices: PlanPriceChange[] = [],
  ln: CustomerPlan = meterLine,
): LineUsage {
  return lineUsageOf(ln, readings, priceHistoryOf({ planChanges: prices, lineChanges: [] }))!;
}

const draft = (value: number | null, over: Partial<ReadingDraft> = {}): ReadingDraft => ({
  value,
  meterChange: null,
  ...over,
});

beforeEach(() => {
  freezeToday(2026, 10, 15);
  readingStore.reset();
  priceStore.reset();
  store.reset();
});
afterEach(unfreeze);

describe("the reading preview", () => {
  it("TC-MR-01 a typed reading shows its units and the bill the grid will show", () => {
    const usage = usageOf([reading(JUNE, 1120)], [price(JULY, 40000, 685000)]);
    const preview = readingPreview(usage, JULY, draft(1250), NOW, null);
    expect(preview.previousReading).toBe(1120);
    expect(preview.units).toBe(130);
    expect(preview.month).toMatchObject({ kind: "bill", bill: { amount: 685000 + 130 * 40000 } });
    expect(preview.warnings).toEqual([]);
  });

  it("TC-MR-02 no price yet → units still show, the month waits for its price", () => {
    const preview = readingPreview(usageOf([reading(JUNE, 1120)]), JULY, draft(1250), NOW, null);
    expect(preview.units).toBe(130);
    expect(preview.month).toEqual({ kind: "waiting", waitingFor: "price" });
  });

  it("TC-MR-03 a reading below last month's is refused and makes no bill", () => {
    const usage = usageOf([reading(JUNE, 1120)], [price(JULY, 40000, 685000)]);
    const preview = readingPreview(usage, JULY, draft(1100), NOW, null);
    expect(preview.problems).toEqual(["below_previous"]);
    expect(preview.warnings).toEqual([]);
    expect(preview.month).toEqual({ kind: "waiting", waitingFor: "reading_below_previous" });
  });

  it("TC-MR-21 a lower reading is fine once the meter was replaced, but each meter still counts up", () => {
    const usage = usageOf([reading(JUNE, 1120)]);
    const replaced = (oldMeterFinal: number, newMeterStart: number, value: number) =>
      readingPreview(
        usage,
        JULY,
        draft(value, { meterChange: { oldMeterFinal, newMeterStart, newMeterNumber: "" } }),
        NOW,
        null,
      ).problems;
    expect(replaced(1200, 0, 50)).toEqual([]);
    expect(replaced(1100, 0, 50)).toEqual(["old_meter_below_previous"]);
    expect(replaced(1200, 60, 50)).toEqual(["below_new_meter_start"]);
  });

  it("TC-MR-22 a fixed reading can't go above next month's, unless next month was already lower", () => {
    const usage = usageOf([reading(JUNE, 1120), reading(JULY, 1250)]);
    expect(readingPreview(usage, JUNE, draft(1200), NOW, null).problems).toEqual([]);
    expect(readingPreview(usage, JUNE, draft(1300), NOW, null)).toMatchObject({
      problems: ["above_next"],
      nextReading: 1250,
    });
    const alreadyLower = usageOf([reading(JUNE, 1300), reading(JULY, 1250)]);
    expect(readingPreview(alreadyLower, JUNE, draft(1310), NOW, null).problems).toEqual([]);
  });

  it("TC-MR-04 a meter replaced this month counts the old meter's tail plus the new one's head", () => {
    const usage = usageOf([reading(JUNE, 1120)]);
    const replaced = draft(50, {
      meterChange: { oldMeterFinal: 1200, newMeterStart: 0, newMeterNumber: " M-9 " },
    });
    expect(readingPreview(usage, JULY, replaced, NOW, null).units).toBe(130);
    expect(readingInputOf(replaced, "reading")?.meterChange).toEqual({
      oldMeterFinal: 1200,
      newMeterStart: 0,
      newMeterNumber: "M-9",
    });
  });

  it("TC-MR-05 a half-typed meter change or an empty box is not saveable", () => {
    const half = draft(50, { meterChange: { oldMeterFinal: 1200, newMeterStart: null, newMeterNumber: "" } });
    expect(readingInputOf(half, "reading")).toBeNull();
    expect(readingInputOf(draft(null), "reading")).toBeNull();
    expect(readingPreview(usageOf([]), JUNE, half, NOW, null).month).toBeNull();
  });

  it("TC-MR-06 high usage = above the average of up to 3 earlier months by the plan's percent", () => {
    const usage = usageOf([reading(JUNE, 1100), reading(JULY, 1200), reading(AUG, 1300)]);
    expect(readingPreview(usage, SEP, draft(1450), NOW, 50).warnings).toEqual([]);
    expect(readingPreview(usage, SEP, draft(1460), NOW, 50).warnings).toEqual(["high_usage"]);
    expect(readingPreview(usage, SEP, draft(1460), NOW, null).warnings).toEqual([]);
  });

  it("TC-MR-07 a typed-usage plan takes units, never a meter change", () => {
    const typed = draft(40, { meterChange: { oldMeterFinal: 1, newMeterStart: 0, newMeterNumber: "" } });
    expect(readingInputOf(typed, "direct")).toEqual({ value: 40, meterChange: null });
    const usage = usageOf([], [], typedLine);
    expect(readingPreview(usage, JULY, typed, NOW, null)).toMatchObject({
      previousReading: null,
      units: 40,
    });
  });

  it("TC-MR-08 the form only counts as changed when the saved reading would change", () => {
    const saved = reading(JULY, 1250);
    expect(isReadingDraftChanged(readingDraftOf(saved, "reading"), saved, "reading")).toBe(false);
    expect(isReadingDraftChanged(draft(1251), saved, "reading")).toBe(true);
    expect(isReadingDraftChanged(draft(null), null, "reading")).toBe(false);
  });
});

describe("the reading lock in the service", () => {
  const save = (ln: CustomerPlan, billingMonth: string, value: number) =>
    usageReadingService.save({
      line: ln,
      billingMonth,
      value,
      meterChange: null,
      recordedByUserId: "user-1",
    });

  const payMonth = (month: string) => {
    const charge = store.seedCharge({ customer_plan_id: "line-1", billing_month: month, due_date: month });
    store.seedCollection(charge.id, 20);
  };

  it("TC-MR-09 money on the month or the next one locks a meter reading", async () => {
    payMonth(AUG);
    await expect(save(meterLine, AUG, 1300)).rejects.toThrow(i18n.t("errors.usage_reading_locked_paid"));
    await expect(save(meterLine, JULY, 1250)).rejects.toThrow(i18n.t("errors.usage_reading_locked_paid"));
    await expect(save(meterLine, JUNE, 1120)).resolves.toMatchObject({ reading: 1120 });
    expect(readingStore.rows).toHaveLength(1);
  });

  it("TC-MR-10 typed usage locks only on its own month's money", async () => {
    payMonth(AUG);
    await expect(save(typedLine, AUG, 40)).rejects.toThrow(i18n.t("errors.usage_units_locked_paid"));
    await expect(save(typedLine, JULY, 40)).resolves.toMatchObject({ units: 40 });
  });

  it("TC-MR-11 a locked reading cannot be removed either", async () => {
    const saved = await save(meterLine, JULY, 1250);
    payMonth(AUG);
    await expect(usageReadingService.remove(saved, "admin")).rejects.toThrow(
      i18n.t("errors.usage_reading_locked_paid"),
    );
    expect(await usageReadingService.getForLines(["line-1"])).toHaveLength(1);
  });

  it("TC-MR-23 the service refuses a meter going down unless it was replaced", async () => {
    await save(meterLine, JUNE, 1120);
    await expect(save(meterLine, JULY, 1100)).rejects.toThrow(
      i18n.t("errors.usage_reading_out_of_order"),
    );
    await expect(
      usageReadingService.save({
        line: meterLine,
        billingMonth: JULY,
        value: 50,
        meterChange: { oldMeterFinal: 1200, newMeterStart: 0, newMeterNumber: null },
        recordedByUserId: "user-1",
      }),
    ).resolves.toMatchObject({ reading: 50 });
    await expect(save(meterLine, JUNE, 990)).rejects.toThrow(
      i18n.t("errors.usage_reading_out_of_order"),
    );
  });
});

describe("the month grid door", () => {
  function gridOf(readings: (StatusReading & { customerPlanId: string })[], prices: PlanPriceChange[] = []) {
    const history = priceHistoryOf({ planChanges: prices, lineChanges: [] });
    const derived = buildGridsFor(
      [meterLine],
      [],
      [],
      2026,
      "month_start",
      usageByLineOf([meterLine], readings, history),
    );
    const gates: LineGates = {
      payLimit: null,
      uncoveredMonths: derived.uncoveredMonths["line-1"],
      paidMonths: derived.paidMonths["line-1"],
      usageLine: true,
    };
    const month = (billingMonth: string) =>
      derived.grids["line-1"].find((e) => e.billingMonth === billingMonth) as MonthEntry;
    return { month, gates };
  }

  const viewer = { isAdmin: false, isFixed: false, canSend: true, usageEntry: "reading" as const };

  it("TC-MR-12 a month waiting for its reading opens the reading form", () => {
    const { month, gates } = gridOf([]);
    expect(month(JULY).status).toBe("waiting");
    expect(monthTap(month(JULY), gates)).toEqual({ kind: "reading" });
    const item = monthMenuItems(month(JULY), gates, viewer).find((i) => i.key === "reading");
    expect(item?.labelKey).toBe("payments.reading.enter_reading");
  });

  it("TC-MR-13 a month with its bill worked out offers to change the reading, not enter it", () => {
    const { month, gates } = gridOf(
      [reading(JUNE, 1120), reading(JULY, 1250)],
      [price(JULY, 40000, 685000)],
    );
    expect(month(JULY).status).toBe("unpaid");
    const item = monthMenuItems(month(JULY), gates, viewer).find((i) => i.key === "reading");
    expect(item?.labelKey).toBe("payments.reading.fix_reading");
  });

  it("TC-MR-14 a fixed line's months never offer a reading", () => {
    const { month, gates } = gridOf([]);
    const items = monthMenuItems(month(JULY), gates, { ...viewer, usageEntry: null });
    expect(items.some((i) => i.key === "reading")).toBe(false);
  });

  it("TC-MR-15 the reading row is greyed once next month has money", () => {
    const { month } = gridOf([reading(JULY, 1250)]);
    const gates: LineGates = { payLimit: null, uncoveredMonths: [], paidMonths: [AUG], usageLine: true };
    expect(greyed(monthMenuItems(month(JULY), gates, viewer)).reading).toBe("why_disabled.reading_locked");
  });

  it("TC-MR-17 a future usage month cannot be prepaid by any door", () => {
    const { month, gates } = gridOf(
      [reading(JUNE, 1120), reading(JULY, 1250), reading(AUG, 1300), reading(SEP, 1400), reading(OCT, 1500)],
      [price(JULY, 40000, 685000), price(AUG, 40000, 685000), price(SEP, 40000, 685000), price(OCT, 40000, 685000)],
    );
    expect(month(NOV).status).toBe("future");
    expect(monthTap(month(NOV), gates)).toEqual({ kind: "no_bill" });
    expect(monthMenuItems(month(NOV), gates, viewer).some((i) => i.key === "quick-pay")).toBe(false);
    expect(monthSelectionGroups([month(OCT), month(NOV)], gates).payable.map((e) => e.billingMonth)).toEqual([OCT]);
  });

  it("TC-MR-18 the quick-pay link refuses a month still waiting for its reading", () => {
    const { month, gates } = gridOf([]);
    expect(month(OCT).status).toBe("waiting");
    expect(quickPayLinkAction(month(OCT), gates)).toEqual({ kind: "no_bill" });
    expect(monthSelectionGroups([month(OCT)], gates).payable).toEqual([]);
  });

  it("TC-MR-19 a fixed line keeps prepaying future months", () => {
    const { month, gates } = gridOf([]);
    const fixed = { ...gates, usageLine: false };
    expect(monthTap(month(NOV), fixed)).not.toEqual({ kind: "no_bill" });
  });
});

describe("the payment slice", () => {
  it("TC-MR-16 a saved reading lands in the store and the next grid build bills the month", async () => {
    priceStore.plans.push({
      id: "pc-1",
      tenant_id: "t1",
      plan_id: "p-10a",
      from_month: JULY,
      price: 40000,
      currency_id: "cur-lbp",
      duration_months: 1,
      is_custom_price: false,
      fixed_fee: 685000,
      created_at: "2026-07-25T10:00:00.000Z",
      updated_at: "2026-07-25T10:00:00.000Z",
    });
    await usageReadingService.save({
      line: meterLine,
      billingMonth: JUNE,
      value: 1120,
      meterChange: null,
      recordedByUserId: "user-1",
    });
    const payments = () => getStore().getState().payments;
    await payments().fetchBills("cust-1", [meterLine]);
    payments().buildGrids([meterLine], 2026);
    const july = () => payments().monthGridsByLine["line-1"].find((e) => e.billingMonth === JULY)!;
    expect(july().status).toBe("waiting");

    const ok = await payments().saveReading({
      line: meterLine,
      billingMonth: JULY,
      value: 1250,
      meterChange: null,
      recordedByUserId: "user-1",
    });
    expect(ok).toBe(true);
    expect(payments().readings.map((r) => r.billingMonth).sort()).toEqual([JUNE, JULY]);
    payments().buildGrids([meterLine], 2026);
    expect(july().status).toBe("unpaid");
    expect(july().usage).toMatchObject({ kind: "bill", bill: { units: 130, amount: 685000 + 130 * 40000 } });
    payments().reset();
  });

  it("TC-MR-20 saving or removing a reading announces that what is owed changed", async () => {
    const payments = () => getStore().getState().payments;
    const owedVersion = () => getStore().getState().ledger.owedVersion;
    const v0 = owedVersion();
    await payments().saveReading({
      line: meterLine,
      billingMonth: JULY,
      value: 1250,
      meterChange: null,
      recordedByUserId: "user-1",
    });
    expect(owedVersion()).toBe(v0 + 1);
    const [saved] = payments().readings;
    expect(await payments().removeReading(saved, "admin")).toBe(true);
    expect(owedVersion()).toBe(v0 + 2);
    payments().reset();
  });
});
