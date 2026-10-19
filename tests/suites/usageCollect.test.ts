import i18n from "@shared/core/i18n";
import type { OpenItem, PlanUsage } from "@shared/core/types";
import type { DbPlanPriceChange, DbUsageReading } from "@shared/core/types/db";
import { chargeService } from "@shared/modules/ledger/services/ChargeService";
import { collectionService } from "@shared/modules/ledger/services/CollectionService";
import { ledgerService } from "@shared/modules/ledger/services/LedgerService";
import { billInfoRows } from "@shared/modules/ledger/utils/billView";
import { mapDbChargeToCharge } from "@shared/modules/ledger/utils/mapper";
import { monthItemFromEntry } from "@shared/modules/ledger/utils/openItems";
import { monthPriceOf } from "@shared/modules/customer/customer-payments/utils/usageBill";
import { canRetypeUsageBill } from "@shared/modules/customer/customer-payments/utils/monthActions";
import { monthBillFigure } from "@shared/modules/customer/customer-payments/utils/monthView";
import { buildMonthGrid } from "@shared/modules/customer/customer-payments/utils/monthStatus";
import { usageByLineOf } from "@shared/modules/customer/customer-payments/utils/usageBill";
import { priceHistoryOf } from "@shared/modules/customer/customer-plans/utils/priceHistory";
import { mapDbPlanPriceChange } from "@shared/modules/customer/customer-plans/utils/mapper";
import { store } from "../helpers/fakeLedger";
import { priceStore } from "../helpers/fakePriceHistory";
import { readingStore } from "../helpers/fakeUsageReadings";
import { customer, line, plan, LBP } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";

// TC-UC-* — a usage month's bill: owed at its worked-out amount, saved with its parts, retyped by staff.

const METER: PlanUsage = {
  entry: "reading",
  unitName: "kWh",
  feeName: "Fixed fee",
  highUsagePercent: null,
};

const P = plan({ id: "p-10a", price: null, currencyId: "cur-lbp", usage: METER });
const L = line({ id: "line-1", planId: "p-10a", plan: P, startDate: "2026-08-10", startReading: 1000 });
const C = customer({ id: "cust-1", customerPlans: [L] });

const AUG = "2026-08-01";
const SEP = "2026-09-01";
const OCT = "2026-10-01";
const NOW = "2026-10-15T09:00:00.000Z";

function seedReading(month: string, value: number): void {
  readingStore.rows = readingStore.rows.filter((r) => r.billing_month !== month);
  const row: DbUsageReading = {
    id: `reading-${month}`,
    tenant_id: "t1",
    customer_id: "cust-1",
    customer_plan_id: "line-1",
    billing_month: month,
    reading: value,
    units: null,
    old_meter_final: null,
    new_meter_start: null,
    new_meter_number: null,
    recorded_by_user_id: "user-1",
    recorded_at: `${month.slice(0, 7)}-28T10:00:00.000Z`,
    voided_at: null,
    voided_by: null,
    created_at: `${month.slice(0, 7)}-28T10:00:00.000Z`,
    updated_at: `${month.slice(0, 7)}-28T10:00:00.000Z`,
  };
  readingStore.rows.push(row);
}

function seedPrice(month: string, unitPrice: number, fixedFee: number): void {
  const row: DbPlanPriceChange = {
    id: `price-${month}`,
    tenant_id: "t1",
    plan_id: "p-10a",
    from_month: month,
    price: unitPrice,
    currency_id: "cur-lbp",
    duration_months: 1,
    is_custom_price: false,
    fixed_fee: fixedFee,
    created_at: `${month.slice(0, 7)}-25T10:00:00.000Z`,
    updated_at: `${month.slice(0, 7)}-25T10:00:00.000Z`,
  };
  priceStore.plans.push(row);
}

const owed = () =>
  ledgerService.getOwed({
    customer: C,
    lines: [L],
    skips: [],
    unpaidRule: "month_start",
    currencies: [LBP],
  });

const owedMonth = async (month: string) =>
  (await owed()).find((i) => i.billingMonth === month) ?? null;

const pay = (item: OpenItem, amount = item.balance) =>
  collectionService.collect({
    tenantId: "t1",
    customerId: "cust-1",
    branchId: null,
    amount,
    currencyId: item.currencyId,
    ratePerUsdSnapshot: item.ratePerUsdSnapshot,
    receivedAt: NOW,
    receivedByUserId: "user-1",
    notes: null,
    lines: [{ item, amount, settles: amount >= item.balance }],
  });

const retype = (item: OpenItem, amount: number) =>
  chargeService.retypeUsageBill({ item, amount, tenantId: "t1", recordedByUserId: "user-1" });

const monthRow = (month: string) =>
  store.charges.find((c) => c.customer_plan_id === "line-1" && c.billing_month === month) ?? null;

beforeEach(() => {
  freezeToday(2026, 10, 15);
  store.reset();
  priceStore.reset();
  readingStore.reset();
  seedReading(AUG, 1100);
  seedReading(SEP, 1250);
  seedPrice(AUG, 2000, 50000);
  seedPrice(SEP, 2000, 50000);
});
afterEach(unfreeze);

describe("what a usage line owes", () => {
  it("TC-UC-01 each worked-out month is owed at its bill, in the price's currency", async () => {
    const items = await owed();
    expect(items.map((i) => [i.billingMonth, i.amount])).toEqual([
      [AUG, 250000],
      [SEP, 350000],
    ]);
    const aug = items[0];
    expect(aug.chargeId).toBeNull();
    expect(aug.currencyId).toBe("cur-lbp");
    expect(aug.ratePerUsdSnapshot).toBe(LBP.ratePerUsd);
    expect(aug.openAmount).toBe(false);
    expect(aug.earlierPrice).toBe(false);
    expect(aug.isDebt).toBe(false);
    expect(aug.usage).toEqual({
      previousReading: 1000,
      reading: 1100,
      units: 100,
      unitPrice: 2000,
      fixedFee: 50000,
      computedAmount: 250000,
    });
  });

  it("TC-UC-02 a month still waiting (no reading, no price) owes nothing", async () => {
    seedReading(OCT, 1400);
    expect(await owedMonth(OCT)).toBeNull();
  });

  it("TC-UC-03 collecting a usage month saves the bill with its parts", async () => {
    await pay((await owedMonth(AUG))!);
    expect(monthRow(AUG)).toMatchObject({
      amount: 250000,
      currency_id: "cur-lbp",
      rate_per_usd_snapshot: LBP.ratePerUsd,
      usage_previous_reading: 1000,
      usage_reading: 1100,
      usage_units: 100,
      unit_price: 2000,
      fixed_fee: 50000,
      computed_amount: 250000,
    });
    expect((await owed()).map((i) => i.billingMonth)).toEqual([SEP]);
  });

  it("TC-UC-04 an emptied bill is worked out again from today's reading", async () => {
    const paid = await pay((await owedMonth(AUG))!);
    await collectionService.voidCollection(paid.id, "user-1", null);
    seedReading(AUG, 1150);
    const aug = (await owedMonth(AUG))!;
    expect(aug.chargeId).toBeNull();
    expect(aug.amount).toBe(350000);
    await pay(aug);
    expect(monthRow(AUG)).toMatchObject({ amount: 350000, usage_units: 150, computed_amount: 350000 });
  });

  it("TC-UC-05 an emptied bill owes nothing once its month waits again", async () => {
    const paid = await pay((await owedMonth(AUG))!);
    await collectionService.voidCollection(paid.id, "user-1", null);
    readingStore.rows = readingStore.rows.filter((r) => r.billing_month !== AUG);
    expect(await owedMonth(AUG)).toBeNull();
  });

  it("TC-UC-06 writing off an unpaid usage month keeps its parts", async () => {
    const [charge] = await chargeService.writeOffOwed([(await owedMonth(AUG))!], "t1", "user-1", null);
    expect(charge.writtenOffAt).not.toBeNull();
    expect(charge.amount).toBe(250000);
    expect(charge.usage?.computedAmount).toBe(250000);
    expect(charge.usage?.units).toBe(100);
  });
});

describe("staff retyping a usage bill", () => {
  it("TC-UC-07 a retyped bill is owed as typed, even after the reading changes", async () => {
    await retype((await owedMonth(AUG))!, 200000);
    expect(monthRow(AUG)).toMatchObject({ amount: 200000, computed_amount: 250000 });
    seedReading(AUG, 1300);
    const aug = (await owedMonth(AUG))!;
    expect(aug.chargeId).toBe(monthRow(AUG)!.id);
    expect(aug.amount).toBe(200000);
    expect(aug.isDebt).toBe(false);
  });

  it("TC-UC-08 collecting a retyped bill pays the typed amount on the same row", async () => {
    await retype((await owedMonth(AUG))!, 200000);
    await pay((await owedMonth(AUG))!);
    expect(store.charges.filter((c) => c.billing_month === AUG)).toHaveLength(1);
    expect((await owed()).map((i) => i.billingMonth)).toEqual([SEP]);
  });

  it("TC-UC-09 typing the worked-out amount again goes back to it", async () => {
    await retype((await owedMonth(AUG))!, 200000);
    await retype((await owedMonth(AUG))!, 250000);
    seedReading(AUG, 1150);
    const aug = (await owedMonth(AUG))!;
    expect(aug.chargeId).toBeNull();
    expect(aug.amount).toBe(350000);
  });

  it("TC-UC-10 a retyped bill stays owed when its reading is removed", async () => {
    await retype((await owedMonth(AUG))!, 200000);
    readingStore.rows = readingStore.rows.filter((r) => r.billing_month !== AUG);
    expect((await owedMonth(AUG))?.amount).toBe(200000);
  });

  it("TC-UC-11 refused once money is on the month", async () => {
    const aug = (await owedMonth(AUG))!;
    await pay(aug, 100000);
    await expect(retype(aug, 200000)).rejects.toThrow(i18n.t("errors.usage_bill_locked"));
  });

  it("TC-UC-12 refused on a written-off month", async () => {
    const aug = (await owedMonth(AUG))!;
    await chargeService.writeOffOwed([aug], "t1", "user-1", null);
    await expect(retype(aug, 200000)).rejects.toThrow(i18n.t("errors.usage_bill_locked"));
  });

  it("TC-UC-13 refuses an amount of 0", async () => {
    await expect(retype((await owedMonth(AUG))!, 0)).rejects.toThrow(
      i18n.t("errors.debt_amount_positive"),
    );
  });

  it("TC-UC-14 refuses a month that is not a usage bill", async () => {
    const aug = (await owedMonth(AUG))!;
    await expect(retype({ ...aug, usage: null }, 200000)).rejects.toThrow(
      i18n.t("errors.usage_line_not_usage"),
    );
  });
});

describe("the customer grid's usage month", () => {
  const history = () =>
    priceHistoryOf({ planChanges: priceStore.plans.map(mapDbPlanPriceChange), lineChanges: [] });

  const gridFor = () => {
    const usage = usageByLineOf([L], readingStore.rows.map((r) => ({
      customerPlanId: r.customer_plan_id,
      billingMonth: r.billing_month,
      reading: r.reading,
      units: r.units,
      meterChange: null,
      recordedAt: r.recorded_at,
    })), history());
    const bills = store.charges.map((c) => ({ charge: mapDbChargeToCharge(c), collected: 0 }));
    return buildMonthGrid(L, bills, [], 2026, "month_start", usage.get("line-1") ?? null);
  };

  const cell = (month: string) => gridFor().find((e) => e.billingMonth === month)!;

  const itemOf = (month: string) => {
    const entry = cell(month);
    const price = monthPriceOf(L, entry, history());
    return monthItemFromEntry({
      entry,
      customerId: "cust-1",
      customerName: "Ali",
      branchId: null,
      customerPlanId: "line-1",
      planId: "p-10a",
      label: month,
      price,
      ratePerUsd: LBP.ratePerUsd,
    })!;
  };

  it("TC-UC-15 a usage month is priced by its bill, never the plan's price rows", () => {
    expect(monthPriceOf(L, cell(SEP), history())).toMatchObject({
      amount: 350000,
      currencyId: "cur-lbp",
      isFixed: true,
      kind: "usage",
    });
    expect(monthPriceOf(L, cell(OCT), history())).toMatchObject({ amount: null, isFixed: false });
  });

  it("TC-UC-16 the collect item carries the worked-out parts", () => {
    const item = itemOf(AUG);
    expect(item.amount).toBe(250000);
    expect(item.openAmount).toBe(false);
    expect(item.usage?.computedAmount).toBe(250000);
  });

  it("TC-UC-17 a retyped month collects against its stored row and shows the typed figure", async () => {
    await retype((await owedMonth(AUG))!, 200000);
    const item = itemOf(AUG);
    expect(item.chargeId).toBe(monthRow(AUG)!.id);
    expect(item.amount).toBe(200000);
    const figure = monthBillFigure(cell(AUG), monthPriceOf(L, cell(AUG), history()));
    expect(figure).toMatchObject({ from: "bill" });
  });

  it("TC-UC-18 only an unpaid usage month can be retyped", () => {
    expect(canRetypeUsageBill(cell(AUG))).toBe(true);
    expect(canRetypeUsageBill(cell(OCT))).toBe(false);
  });

  it("TC-UC-19 the bill sheet prints the readings and the worked-out sum", async () => {
    await retype((await owedMonth(AUG))!, 200000);
    const t = i18n.t.bind(i18n) as (key: string, opts?: Record<string, unknown>) => string;
    const rows = billInfoRows(mapDbChargeToCharge(monthRow(AUG)!), LBP, t, () => null);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    expect(byKey.get("usage_readings")?.value).toBe("1,000 → 1,100");
    expect(byKey.get("usage_worked_out")?.label).toBe(i18n.t("ledger.usage_worked_out_changed"));
    expect(byKey.get("usage_worked_out")?.value).toContain("units=100");
  });
});
