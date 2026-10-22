import i18n from "@shared/core/i18n";
import type { CustomerPlan, PlanUsage } from "@shared/core/types";
import type { DbCustomerPlan } from "@shared/core/types/db";
import planService from "@shared/modules/admin/plans/services/PlanService";
import { planDraftOf, planInput, withBillingType } from "@shared/modules/admin/plans/utils/planForm";
import { customerImportService } from "@shared/modules/customer/customer-import/services/CustomerImportService";
import type { ImportLookups } from "@shared/modules/customer/customer-import/utils/types";
import customerPlanService, {
  type LineDraft,
} from "@shared/modules/customer/customer-plans/services/CustomerPlanService";
import {
  lineRowsChanged,
  newLineRow,
  rowsFromCustomer,
  toLineDrafts,
  withRowPlan,
  withRowPrepaid,
  withRowStartDate,
  type LineRow,
} from "@shared/modules/customer/customer-plans/utils/lineDrafts";
import {
  prepaidStartDate,
  withPlanPrepaid,
  withPrepaidStart,
} from "@shared/modules/customer/customer-plans/utils/prepaidLine";
import { lineStore, priceStore } from "../helpers/fakePriceHistory";
import { FIXED_PLAN_COLUMNS, line, plan } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";

// TC-PP-* — the prepaid switch: plan default, start on the 1st, locked once money reached it.

const METER: PlanUsage = { entry: "reading", unitName: "kWh", feeName: "Fee", highUsagePercent: null };
const prepaidPlan = plan({ id: "p-pre", prepaid: true });
const postpaidPlan = plan({ id: "p-post" });
const meterPlan = plan({ id: "p-meter", price: null, usage: METER, prepaid: true });
const PLANS = [prepaidPlan, postpaidPlan, meterPlan];

const row = (over: Partial<LineRow> = {}): LineRow => ({ ...newLineRow(1, "2026-03-17"), ...over });

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
  prepaid: l.prepaid,
  tenant_id: "t1",
  created_at: l.createdAt,
  updated_at: l.updatedAt,
});

const draftOf = (l: CustomerPlan, over: Partial<LineDraft> = {}): LineDraft => ({
  id: l.id,
  planId: l.planId,
  startDate: l.startDate,
  customPrice: l.customPrice,
  customCurrencyId: l.customCurrencyId,
  meterNumber: l.meterNumber,
  startReading: l.startReading,
  prepaid: l.prepaid,
  ...over,
});

const LIMITS = { customers: 100, plans: 100 };

describe("prepaid line drafts", () => {
  it("TC-PP-01 a prepaid line starts on the 1st of its month; a postpaid one keeps its day", () => {
    expect(prepaidStartDate("2026-03-17")).toBe("2026-03-01");
    expect(withPrepaidStart({ prepaid: true, startDate: "2026-03-17" }).startDate).toBe("2026-03-01");
    expect(withPrepaidStart({ prepaid: false, startDate: "2026-03-17" }).startDate).toBe("2026-03-17");
  });

  it("TC-PP-02 picking a plan brings its prepaid default and moves the start to the 1st", () => {
    const picked = withRowPlan(row(), "p-pre", PLANS);
    expect(picked).toMatchObject({ planId: "p-pre", prepaid: true, startDate: "2026-03-01" });
    expect(withRowPlan(picked, "p-post", PLANS)).toMatchObject({ planId: "p-post", prepaid: false });
  });

  it("TC-PP-03 a meter plan is never prepaid, even when its row says so", () => {
    expect(withRowPlan(row(), "p-meter", PLANS).prepaid).toBe(false);
    const [draft] = toLineDrafts([row({ planId: "p-meter", prepaid: true })], PLANS);
    expect(draft.prepaid).toBe(false);
  });

  it("TC-PP-04 a plan the list does not hold keeps its id and the row's switch", () => {
    const picked = withRowPlan(row({ prepaid: true }), "p-unknown", PLANS);
    expect(picked).toMatchObject({ planId: "p-unknown", prepaid: true });
  });

  it("TC-PP-05 a date typed on a prepaid row snaps to the 1st; turning prepaid on snaps it too", () => {
    expect(withRowStartDate(row({ prepaid: true }), "2026-05-20").startDate).toBe("2026-05-01");
    expect(withRowStartDate(row(), "2026-05-20").startDate).toBe("2026-05-20");
    expect(withRowPrepaid(row(), true).startDate).toBe("2026-03-01");
  });

  it("TC-PP-06 the saved switch is read back and a flip counts as a change", () => {
    const saved = line({ id: "l-1", prepaid: true, plan: prepaidPlan, planId: "p-pre" });
    const initial = rowsFromCustomer({ customerPlans: [saved] }, "2026-10-01");
    expect(initial[0].prepaid).toBe(true);
    expect(lineRowsChanged(initial, [{ ...initial[0], prepaid: false }], [])).toBe(true);
  });

  it("TC-PP-07 loaded lines on a plan follow a plan-wide switch; other lines stay", () => {
    const lines = [
      line({ id: "a", planId: "p-post", startDate: "2026-02-14" }),
      line({ id: "b", planId: "p-other", startDate: "2026-02-14" }),
    ];
    const next = withPlanPrepaid(lines, "p-post", true);
    expect(next[0]).toMatchObject({ prepaid: true, startDate: "2026-02-01" });
    expect(next[1]).toBe(lines[1]);
  });
});

describe("saving prepaid lines", () => {
  const saved = line({ id: "line-1", planId: "p-post", startDate: "2026-03-17" });
  const sync = (over: Partial<LineDraft>) =>
    customerPlanService.syncLines(
      "cust-1",
      [draftOf(saved, over)],
      [],
      [],
      "t1",
      [saved],
      LIMITS,
      { customers: 1, plans: 1 },
    );

  beforeEach(() => {
    lineStore.reset();
    priceStore.reset();
    priceStore.catalog = [
      { ...FIXED_PLAN_COLUMNS, id: "p-post", name: "Net", price: 20, is_custom_price: false, duration_months: 1, currency_id: null, branch_id: null, tenant_id: "t1", created_at: "2026-01-01T00:00:00.000Z" },
      { ...FIXED_PLAN_COLUMNS, billing_type: "usage", usage_entry: "reading", unit_name: "kWh", fee_name: "Fee", id: "p-meter", name: "Gen", price: null, is_custom_price: false, duration_months: 1, currency_id: null, branch_id: null, tenant_id: "t1", created_at: "2026-01-01T00:00:00.000Z" },
    ];
    lineStore.rows = [dbRow(saved)];
    freezeToday(2026, 10, 15);
  });
  afterEach(unfreeze);

  it("TC-PP-08 a line with no money can turn prepaid; its start moves to the 1st", async () => {
    await sync({ prepaid: true });
    expect(lineStore.rows[0]).toMatchObject({ prepaid: true, start_date: "2026-03-01" });
  });

  it("TC-PP-09 a line money reached keeps its prepaid switch, in both directions", async () => {
    lineStore.paidLineIds = ["line-1"];
    await expect(sync({ prepaid: true })).rejects.toThrow(i18n.t("errors.prepaid_locked_paid"));
    expect(lineStore.rows[0].prepaid).toBe(false);
    const prepaidLine = { ...saved, prepaid: true, startDate: "2026-03-01" };
    lineStore.rows = [dbRow(prepaidLine)];
    await expect(
      customerPlanService.syncLines(
        "cust-1",
        [draftOf(prepaidLine, { prepaid: false })],
        [],
        [],
        "t1",
        [prepaidLine],
        LIMITS,
        { customers: 1, plans: 1 },
      ),
    ).rejects.toThrow(i18n.t("errors.prepaid_locked_paid"));
  });

  it("TC-PP-10 the service refuses a prepaid meter line even if a form sends one", async () => {
    await expect(sync({ planId: "p-meter", prepaid: true })).rejects.toThrow(
      i18n.t("errors.prepaid_usage_plan"),
    );
  });
});

describe("the plan's prepaid switch", () => {
  const base = { ...FIXED_PLAN_COLUMNS, name: "Net", price: 20, is_custom_price: false, duration_months: 1, currency_id: null, branch_id: null, tenant_id: "t1", created_at: "2026-01-01T00:00:00.000Z" };
  const savedPlan = plan({ id: "p-1", name: "Net", price: 20 });
  const input = (prepaid: boolean) => ({ ...planInput(planDraftOf(savedPlan, null)), prepaid });

  beforeEach(() => {
    lineStore.reset();
    priceStore.reset();
    priceStore.catalog = [{ ...base, id: "p-1" }];
    lineStore.rows = [
      dbRow(line({ id: "l-1", planId: "p-1", startDate: "2026-04-09" })),
      dbRow(line({ id: "l-2", planId: "p-other", startDate: "2026-04-09" })),
    ];
  });

  it("TC-PP-11 a new plan saves its prepaid default; a usage plan never does", async () => {
    const created = await planService.createPlan({ ...input(true), name: "Fiber" }, "t1");
    expect(created.prepaid).toBe(true);
    const usage = withBillingType({ ...planDraftOf(null, null), name: "Gen", prepaid: true }, "usage");
    expect(planInput({ ...usage, usage: { ...usage.usage!, unitName: "kWh", feeName: "Fee" } }).prepaid).toBe(false);
    await expect(
      planService.createPlan({ ...input(true), name: "Gen2", usage: METER, price: null }, "t1"),
    ).rejects.toThrow(i18n.t("errors.prepaid_usage_plan"));
  });

  it("TC-PP-12 while no line on the plan has money, the switch reaches all its lines", async () => {
    const updated = await planService.updatePlan(savedPlan, input(true));
    expect(updated.prepaid).toBe(true);
    expect(lineStore.rows[0]).toMatchObject({ prepaid: true, start_date: "2026-04-01" });
    expect(lineStore.rows[1]).toMatchObject({ prepaid: false, start_date: "2026-04-09" });
  });

  it("TC-PP-13 once a line on the plan has money, the switch is refused both ways", async () => {
    priceStore.paidPlanIds = ["p-1"];
    await expect(planService.updatePlan(savedPlan, input(true))).rejects.toThrow(
      i18n.t("errors.plan_prepaid_locked_paid"),
    );
    expect(lineStore.rows[0].prepaid).toBe(false);
    expect(await planService.hasPaidLine("p-1")).toBe(true);
  });
});

describe("importing prepaid lines", () => {
  const lookups: ImportLookups = {
    branches: [],
    plans: [prepaidPlan, postpaidPlan],
    currencies: [],
    phoneOwners: new Map(),
    ownBranchId: null,
    defaultBranchId: null,
    today: "2026-10-20",
  };

  it("TC-PP-14 an imported line takes its plan's prepaid default and starts on the 1st", () => {
    const sheet = customerImportService.preview(
      "x.csv",
      [
        ["Name", "Plan", "Start date"],
        ["Ali", "Prepaid Net", "2026-09-15"],
        ["Sara", "Postpaid Net", "2026-09-15"],
      ],
      {
        ...lookups,
        plans: [
          { ...prepaidPlan, name: "Prepaid Net" },
          { ...postpaidPlan, name: "Postpaid Net" },
        ],
      },
    );
    const [ali, sara] = sheet.customers;
    expect(ali.lines[0]).toMatchObject({ prepaid: true, startDate: "2026-09-01" });
    expect(sara.lines[0]).toMatchObject({ prepaid: false, startDate: "2026-09-15" });
  });
});
