import planService from "@shared/modules/admin/plans/services/PlanService";
import { chargeService } from "@shared/modules/ledger/services/ChargeService";
import { ledgerService } from "@shared/modules/ledger/services/LedgerService";
import {
  buildCustomerStatus,
  buildMonthGrid,
} from "@shared/modules/customer/customer-payments/utils/monthStatus";
import { writeOffItems } from "@shared/modules/ledger/utils/writeOffItems";
import { mapDbChargeToCharge } from "@shared/modules/ledger/utils/mapper";
import type { OpenItem } from "@shared/core/types";
import { priceStore } from "../helpers/fakePriceHistory";
import { store } from "../helpers/fakeLedger";
import { customer, line, plan, LBP } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";

// TC-WO-* — writing off unpaid months that money never reached (gotcha #186).

const P = plan({ id: "p1", price: 20, currencyId: null, durationMonths: 1 });
const L = line({ id: "line-1", startDate: "2026-01-01", planId: "p1", plan: P });
const C = customer({ id: "cust-1", customerPlans: [L] });

const owedFor = (lines = [L]) =>
  ledgerService.getOwed({
    customer: C,
    lines,
    skips: [],
    unpaidRule: "month_start",
    currencies: [LBP],
  });

const writeOff = (items: OpenItem[]) =>
  chargeService.writeOffOwed(items, "t1", "user-1", "moved away");

const monthRows = (month: string) =>
  store.charges.filter(
    (c) => c.customer_plan_id === "line-1" && c.billing_month === month,
  );

const gridFor = (year = 2026) =>
  buildMonthGrid(
    L,
    store.charges
      .filter((c) => c.kind === "month" && c.voided_at === null)
      .map((c) => ({ charge: mapDbChargeToCharge(c), collected: 0 })),
    [],
    year,
  );

beforeEach(() => {
  store.reset();
  priceStore.reset();
  freezeToday(2026, 4, 15);
});
afterEach(unfreeze);

describe("writing off months nobody paid", () => {
  it("TC-WO-01 every unpaid month gets a bill, already written off", async () => {
    const written = await writeOff(await owedFor());
    expect(written.map((c) => c.billingMonth).sort()).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
    ]);
    for (const charge of written) {
      expect(charge.writtenOffAt).not.toBeNull();
      expect(charge.writtenOffBy).toBe("user-1");
      expect(charge.writeOffReason).toBe("moved away");
    }
  });

  it("TC-WO-02 each month is written off at ITS OWN price, not today's (#185)", async () => {
    priceStore.catalog = [
      {
        id: "p1",
        name: "Internet",
        price: 20,
        is_custom_price: false,
        duration_months: 1,
        currency_id: null,
        branch_id: null,
        tenant_id: "t1",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ];
    const raised = await planService.updatePlan(
      P,
      {
        name: "Internet",
        isCustomPrice: false,
        price: 25,
        durationMonths: 1,
        currencyId: null,
        branchId: null,
      },
      "2026-03-01",
    );
    const now = line({ ...L, plan: raised });
    await writeOff(await owedFor([now]));
    expect(monthRows("2026-01-01")[0].amount).toBe(20);
    expect(monthRows("2026-02-01")[0].amount).toBe(20);
    expect(monthRows("2026-03-01")[0].amount).toBe(25);
  });

  it("TC-WO-03 the bill takes the SAME id a collect would, so two phones make one row", async () => {
    const owed = await owedFor();
    await writeOff(owed);
    const again = await writeOff(owed);
    expect(again).toEqual([]);
    expect(monthRows("2026-01-01")).toHaveLength(1);
    expect(monthRows("2026-01-01")[0].id).toBe(
      await chargeService.monthChargeId("line-1", "2026-01-01"),
    );
  });

  it("TC-WO-04 a written-off month stops being owed anywhere", async () => {
    await writeOff(await owedFor());
    expect(await owedFor()).toEqual([]);
    const open = await chargeService.getOpenCharges({ customerId: "cust-1" });
    expect(chargeService.buildDebtsView(open).summary.totalUsd).toBe(0);
  });

  it("TC-WO-05 it is a loss in Reports: the full month price", async () => {
    await writeOff(await owedFor());
    const lost = await chargeService.writtenOffUsdInRange(
      "1970-01-01T00:00:00.000Z",
      "2999-01-01T00:00:00.000Z",
      null,
    );
    expect(lost).toBe(80);
  });

  it("TC-WO-06 the grid reads written_off, never unpaid", async () => {
    await writeOff(await owedFor());
    const grid = gridFor();
    expect(grid.slice(0, 4).map((e) => e.status)).toEqual([
      "written_off",
      "written_off",
      "written_off",
      "written_off",
    ]);
    expect(grid[4].status).toBe("future");
  });

  it("TC-WO-07 undo makes the month owed again at its price", async () => {
    const [jan] = await writeOff((await owedFor()).slice(0, 1));
    await chargeService.revertWriteOff(jan.id);
    const owed = await owedFor();
    expect(owed.map((i) => i.billingMonth)).toContain("2026-01-01");
    expect(owed.find((i) => i.billingMonth === "2026-01-01")?.balance).toBe(20);
    expect(monthRows("2026-01-01")).toHaveLength(1);
  });

  it("TC-WO-08 an EMPTY month bill already there is reused and re-priced, never doubled", async () => {
    store.seedCharge({
      id: "other-device",
      customer_plan_id: "line-1",
      billing_month: "2026-01-01",
      due_date: "2026-01-01",
      amount: 99,
    });
    await writeOff((await owedFor()).slice(0, 1));
    const rows = monthRows("2026-01-01");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("other-device");
    expect(rows[0].amount).toBe(20);
    expect(rows[0].written_off_at).not.toBeNull();
  });

  it("TC-WO-09 a VOIDED empty month bill is reused: void lifted, write-off set, never both", async () => {
    store.seedCharge({
      id: "voided",
      customer_plan_id: "line-1",
      billing_month: "2026-01-01",
      due_date: "2026-01-01",
      amount: 20,
      voided_at: "2026-02-01T00:00:00.000Z",
      voided_by: "user-1",
    });
    await writeOff((await owedFor()).slice(0, 1));
    const row = store.charge("voided")!;
    expect(row.voided_at).toBeNull();
    expect(row.written_off_at).not.toBeNull();
  });

  it("TC-WO-10 a month with no set price is never written off", async () => {
    const open = line({
      ...L,
      plan: plan({ id: "p1", price: null, isCustomPrice: true }),
    });
    const owed = await ledgerService.getOwed({
      customer: C,
      lines: [open],
      skips: [],
      unpaidRule: "month_start",
      currencies: [LBP],
    });
    expect(writeOffItems(owed, "everything")).toEqual([]);
    expect(await writeOff(owed)).toEqual([]);
    expect(store.charges).toEqual([]);
  });

  it("TC-WO-11 money already on a month is kept; only the rest is given up", async () => {
    const chg = store.seedCharge({
      customer_plan_id: "line-1",
      billing_month: "2026-01-01",
      due_date: "2026-01-01",
      amount: 20,
    });
    store.seedCollection(chg.id, 5);
    await writeOff(await owedFor());
    expect(store.charge(chg.id)!.written_off_at).not.toBeNull();
    const lost = await chargeService.writtenOffUsdInRange(
      "1970-01-01T00:00:00.000Z",
      "2999-01-01T00:00:00.000Z",
      null,
    );
    expect(lost).toBe(15 + 60);
  });
});

describe("which doors reach which items", () => {
  it("TC-WO-12 'debts' never reaches an unpaid month; 'everything' does", async () => {
    const sale = store.seedCharge({
      kind: "sale",
      sale_id: "s1",
      customer_plan_id: null,
      billing_month: null,
      due_date: "2026-01-10",
      amount: 15,
    });
    const owed = await owedFor();
    expect(writeOffItems(owed, "debts").map((i) => i.chargeId)).toEqual([sale.id]);
    expect(writeOffItems(owed, "everything")).toHaveLength(5);
  });

  it("TC-WO-13 a repeated month in the list is written off once", async () => {
    const owed = await owedFor();
    expect(writeOffItems([...owed, ...owed], "everything")).toHaveLength(4);
  });
});

describe("the customer badge after a write-off", () => {
  it("TC-WO-14 written-off months are neither unpaid nor overdue: the customer owes nothing", async () => {
    await writeOff(await owedFor());
    const bills = store.charges.map((c) => ({
      charge: mapDbChargeToCharge(c),
      collected: 0,
    }));
    const status = buildCustomerStatus([L], bills, [], "month_start");
    expect(status.status).toBe("paid");
    expect(status.overdue).toBe(false);
    expect(status.unpaidMonths).toBe(0);
    expect(status.uncoveredLineIds).toEqual([]);
  });

  it("TC-WO-15 one written-off month leaves the others unpaid and overdue", async () => {
    await writeOff((await owedFor()).slice(0, 1));
    const bills = store.charges.map((c) => ({
      charge: mapDbChargeToCharge(c),
      collected: 0,
    }));
    const status = buildCustomerStatus([L], bills, [], "month_start");
    expect(status.overdue).toBe(true);
    expect(status.unpaidMonths).toBe(3);
  });
});
