import type {
  CashRow,
  Customer,
  CustomerDebts,
  CustomerPlan,
  DashboardMetrics,
  ExpenseItem,
  OpenItem,
  Plan,
  Sale,
  SaleItem,
} from "@shared/core/types";
import type { ReportPeriod } from "@shared/core/utils/dateRange";
import { revenueHero, dashboardTiles } from "@shared/modules/dashboard/utils/dashboardView";
import {
  applyFilter,
  filterOptions,
  groupRows,
  NO_KEY,
} from "@shared/modules/reports/utils/analysis";
import { groupsCsv, recordsCsv } from "@shared/modules/reports/utils/csvRows";
import {
  customerKeyOf,
  customersAnalysis,
  CUSTOM_PRICE_KEY,
  expectedMonthlyUsd,
} from "@shared/modules/reports/utils/customersView";
import { debtsAnalysis } from "@shared/modules/reports/utils/debtsView";
import { moneyInView, moneyOutView, moneyTrend } from "@shared/modules/reports/utils/moneyViews";
import { ageBucket, type SectionViewState } from "@shared/modules/reports/utils/reportDimensions";
import { formatKpiValue, money } from "@shared/modules/reports/utils/reportKpis";
import { cashRecords, withTotal } from "@shared/modules/reports/utils/reportRecords";
import {
  defaultViews,
  drilledInto,
  splitTargets,
  withGrain,
} from "@shared/modules/reports/utils/reportSections";
import { salesAnalysis, unitsOf, linesOf } from "@shared/modules/reports/utils/salesView";
import { staffAnalysis } from "@shared/modules/reports/utils/staffView";
import { bucketOf, defaultGrain, periodBuckets } from "@shared/modules/reports/utils/timeBuckets";
import type { DebtsReport, MoneyReport } from "@shared/modules/reports/utils/types";

const MARCH: ReportPeriod = { preset: "custom", fromDate: "2026-03-01", toDate: "2026-03-31" };
const Q1: ReportPeriod = { preset: "custom", fromDate: "2026-01-01", toDate: "2026-03-31" };
const YEAR: ReportPeriod = { preset: "custom", fromDate: "2026-01-01", toDate: "2026-12-31" };

const view = (over: Partial<SectionViewState> = {}): SectionViewState => ({
  filter: {},
  groupBy: "stream",
  grain: null,
  ...over,
});

function cash(over: Partial<CashRow> = {}): CashRow {
  return {
    id: "i1",
    collectionId: "c1",
    date: "2026-03-10T12:00:00.000Z",
    amount: 10,
    currencyId: null,
    ratePerUsdSnapshot: 1,
    branchId: null,
    receivedByUserId: "u1",
    customerId: "cu1",
    customerName: "Ali",
    planId: "p1",
    label: "2026-03-01",
    stream: "month",
    ...over,
  };
}

function expense(over: Partial<ExpenseItem> = {}): ExpenseItem {
  return {
    id: "e1",
    source: "manual",
    category: "rent",
    label: "Rent",
    amount: 30,
    currencyId: null,
    ratePerUsdSnapshot: 1,
    date: "2026-03-05T12:00:00.000Z",
    branchId: null,
    recordedByUserId: "u1",
    productId: null,
    canVoid: true,
    ...over,
  };
}

function moneyReport(over: Partial<MoneyReport> = {}): MoneyReport {
  return {
    cash: [],
    expenses: [],
    prevCash: [],
    prevExpenses: [],
    collectedUsd: 0,
    spentUsd: 0,
    netUsd: 0,
    prevCollectedUsd: 0,
    prevSpentUsd: 0,
    prevNetUsd: 0,
    streamEntries: [],
    categoryEntries: [],
    byCurrency: [],
    ...over,
  };
}

describe("TC-RA-01..06 — the analysis engine", () => {
  const rows = [
    { id: "a", who: "u1", tags: ["x", "y"] },
    { id: "b", who: "u2", tags: ["x"] },
    { id: "c", who: "u1", tags: [] as string[] },
  ];
  type Dim = "who" | "tag";
  type Row = (typeof rows)[number];
  const keyOf = (row: Row, dim: Dim) =>
    dim === "who" ? row.who : row.tags.length > 0 ? row.tags : NO_KEY;

  it("TC-RA-01 a filter keeps only rows with that key", () => {
    expect(applyFilter(rows, { who: "u1" }, keyOf).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("TC-RA-02 a row with several keys matches any one of them", () => {
    expect(applyFilter(rows, { tag: "y" }, keyOf).map((r) => r.id)).toEqual(["a"]);
  });

  it("TC-RA-03 options for one filter honour every OTHER filter, never empty the view", () => {
    expect(filterOptions<Row, Dim>(rows, { who: "u2" }, "tag", keyOf)).toEqual(["x"]);
    expect(filterOptions<Row, Dim>(rows, { who: "u2", tag: "x" }, "who", keyOf).sort()).toEqual([
      "u1",
      "u2",
    ]);
  });

  it("TC-RA-04 a multi-key row counts once in EACH of its groups", () => {
    const groups = groupRows(rows, "tag", keyOf, () => 1);
    expect(groups.find((g) => g.key === "x")?.count).toBe(2);
    expect(groups.find((g) => g.key === "y")?.count).toBe(1);
    expect(groups.find((g) => g.key === NO_KEY)?.count).toBe(1);
  });

  it("TC-RA-05 a fixed order keeps empty groups as zero rows, in that order", () => {
    const groups = groupRows(rows, "who", keyOf, () => 1, ["u3", "u2", "u1"]);
    expect(groups.map((g) => [g.key, g.count])).toEqual([
      ["u3", 0],
      ["u2", 1],
      ["u1", 2],
    ]);
  });

  it("TC-RA-06 without an order, largest value first and shares add to one", () => {
    const groups = groupRows(rows, "who", keyOf, (r) => (r.id === "b" ? 5 : 1));
    expect(groups.map((g) => g.key)).toEqual(["u2", "u1"]);
    expect(groups.reduce((s, g) => s + g.share, 0)).toBeCloseTo(1);
  });
});

describe("TC-RA-07..10 — time buckets", () => {
  it("TC-RA-07 a month reads by day, a quarter by week, a year by month", () => {
    expect(defaultGrain(MARCH)).toBe("day");
    expect(defaultGrain(Q1)).toBe("week");
    expect(defaultGrain(YEAR)).toBe("month");
  });

  it("TC-RA-08 a week starts on Monday", () => {
    expect(bucketOf("2026-03-11T12:00:00", "week")).toBe("2026-03-09");
    expect(bucketOf("2026-03-09T12:00:00", "week")).toBe("2026-03-09");
    expect(bucketOf("2026-03-15T12:00:00", "week")).toBe("2026-03-09");
  });

  it("TC-RA-09 every bucket of the period, oldest first", () => {
    expect(periodBuckets(YEAR, "month")).toHaveLength(12);
    expect(periodBuckets(MARCH, "day")).toHaveLength(31);
    expect(periodBuckets(MARCH, "week")[0]).toBe("2026-02-23");
  });

  it("TC-RA-10 a month bucket is the first of the month", () => {
    expect(bucketOf("2026-03-31T12:00:00", "month")).toBe("2026-03-01");
  });
});

describe("TC-RA-11..17 — money in, money out, trend", () => {
  const report = moneyReport({
    cash: [
      cash({ id: "i1", collectionId: "c1", amount: 10, stream: "month" }),
      cash({ id: "i2", collectionId: "c1", amount: 5, stream: "sale", planId: null }),
      cash({
        id: "i3",
        collectionId: "c2",
        amount: 900000,
        currencyId: "lbp",
        ratePerUsdSnapshot: 90000,
        receivedByUserId: "u2",
        date: "2026-03-20T12:00:00.000Z",
      }),
    ],
    prevCash: [cash({ id: "p1", collectionId: "c0", amount: 20 })],
    expenses: [expense(), expense({ id: "e2", source: "stock", category: "stock", amount: 10 })],
    prevExpenses: [expense({ id: "e0", amount: 40 })],
  });

  it("TC-RA-11 collected is USD at each row's FROZEN rate, and payments count hand-overs", () => {
    const v = moneyInView(report, view(), MARCH);
    expect(v.kpis.find((k) => k.key === "collected")?.value).toEqual(money(25));
    expect(v.kpis.find((k) => k.key === "hand_overs")?.value).toEqual({ kind: "count", value: 2 });
  });

  it("TC-RA-12 the groups add up to exactly the collected figure", () => {
    const v = moneyInView(report, view({ groupBy: "stream" }), MARCH);
    expect(v.groups.reduce((s, g) => s + g.value, 0)).toBeCloseTo(25);
  });

  it("TC-RA-13 a collector filter scopes the figure AND the previous period", () => {
    const v = moneyInView(report, view({ filter: { collector: "u2" } }), MARCH);
    const collected = v.kpis.find((k) => k.key === "collected");
    expect(collected?.value).toEqual(money(10));
    expect(collected?.delta).toEqual({ abs: 10, pct: null });
  });

  it("TC-RA-14 a time filter drops the comparison — it has no twin last period", () => {
    const v = moneyInView(report, view({ filter: { time: "2026-03-10" }, grain: "day" }), MARCH);
    expect(v.kpis.find((k) => k.key === "collected")?.delta).toBeUndefined();
    expect(v.rows.map((r) => r.id)).toEqual(["i1", "i2"]);
  });

  it("TC-RA-15 money out splits stock purchases from other spending", () => {
    const v = moneyOutView(report, view({ groupBy: "category" }), MARCH);
    expect(v.kpis.find((k) => k.key === "spent")?.value).toEqual(money(40));
    expect(v.kpis.find((k) => k.key === "stock")?.value).toEqual(money(10));
    expect(v.kpis.find((k) => k.key === "other")?.value).toEqual(money(30));
  });

  it("TC-RA-16 the trend's in and out columns sum to the period totals", () => {
    const trend = moneyTrend(report, MARCH, "day");
    expect(trend).toHaveLength(31);
    expect(trend.reduce((s, r) => s + r.inUsd, 0)).toBeCloseTo(25);
    expect(trend.reduce((s, r) => s + r.outUsd, 0)).toBeCloseTo(40);
    expect(trend.every((r) => r.netUsd === r.inUsd - r.outUsd)).toBe(true);
  });

  it("TC-RA-17 a drill-down total equals the group it came from", () => {
    const v = moneyInView(report, view({ groupBy: "collector" }), MARCH);
    for (const group of v.groups) {
      expect(withTotal(cashRecords(group.rows)).totalUsd).toBeCloseTo(group.value);
    }
  });
});

function openItem(over: Partial<OpenItem> = {}): OpenItem {
  return {
    chargeId: "ch1",
    kind: "sale",
    customerId: "cu1",
    customerName: "Ali",
    branchId: null,
    customerPlanId: null,
    billingMonth: null,
    durationMonths: 1,
    planId: null,
    saleId: "s1",
    label: "Sale",
    amount: 50,
    paid: 0,
    balance: 50,
    currencyId: null,
    ratePerUsdSnapshot: 1,
    dueDate: "2020-01-01",
    issuedAt: "2020-01-01T00:00:00.000Z",
    createdAt: "2020-01-01T00:00:00.000Z",
    isDebt: true,
    ...over,
  };
}

describe("TC-RA-18..21 — debts", () => {
  const debtor = (customerId: string, items: OpenItem[]): CustomerDebts => ({
    customerId,
    customerName: customerId,
    items,
    unpaidMonths: [],
    debtUsd: items.reduce((s, i) => s + i.balance, 0),
    unpaidMonthsUsd: 0,
    oldestDaysLate: 10,
  });
  const report: DebtsReport = {
    outstandingUsd: 80,
    writtenOffUsd: 7,
    debtorCount: 2,
    debtors: [
      debtor("cu1", [openItem(), openItem({ chargeId: "ch2", kind: "month", balance: 10, paid: 5 })]),
      debtor("cu2", [openItem({ chargeId: "ch3", customerId: "cu2", kind: "manual", balance: 20 })]),
    ],
    topDebtors: [],
    categoryEntries: [],
    collected: [cash({ stream: "sale", customerId: "cu1", amount: 4 })],
    collectedUsd: 4,
    prevCollectedUsd: 0,
    aging: [{ customerId: "cu1", customerName: "Ali", months: 2 }],
  };

  it("TC-RA-18 unfiltered: the phone's four figures plus written off", () => {
    const v = debtsAnalysis(report, view({ groupBy: "customer" }), MARCH);
    expect(v.kpis.map((k) => k.key)).toEqual(["outstanding", "collected", "debtors", "overdue", "written_off"]);
  });

  it("TC-RA-19 a kind filter scopes what is owed AND the cash collected on it", () => {
    const v = debtsAnalysis(report, view({ groupBy: "customer", filter: { kind: "sale" } }), MARCH);
    expect(v.kpis.find((k) => k.key === "outstanding")?.value).toEqual(money(50));
    expect(v.kpis.find((k) => k.key === "collected")?.value).toEqual(money(4));
    expect(v.kpis.find((k) => k.key === "written_off")).toBeUndefined();
  });

  it("TC-RA-20 by customer, the groups add up to what is owed", () => {
    const v = debtsAnalysis(report, view({ groupBy: "customer" }), MARCH);
    expect(v.groups.reduce((s, g) => s + g.value, 0)).toBeCloseTo(80);
    expect(v.monthsBehind.get("cu1")).toBe(2);
  });

  it("TC-RA-21 lateness buckets have fixed edges", () => {
    expect(ageBucket(0)).toBe("0_30");
    expect(ageBucket(30)).toBe("0_30");
    expect(ageBucket(31)).toBe("31_60");
    expect(ageBucket(180)).toBe("91_180");
    expect(ageBucket(181)).toBe("181_plus");
  });
});

const PLAN: Plan = {
  id: "p1",
  name: "Basic",
  price: 30,
  isCustomPrice: false,
  durationMonths: 3,
  currencyId: null,
  branchId: null,
  tenantId: "t1",
  createdAt: "2025-01-01T00:00:00.000Z",
};

function line(over: Partial<CustomerPlan> = {}): CustomerPlan {
  return {
    id: "l1",
    customerId: "cu1",
    planId: "p1",
    startDate: "2025-01-01",
    cancelledAt: null,
    active: true,
    customPrice: null,
    customCurrencyId: null,
    tenantId: "t1",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    plan: PLAN,
    ...over,
  };
}

function customer(over: Partial<Customer> = {}): Customer {
  return {
    id: "cu1",
    name: "Ali",
    phoneNumber: null,
    address: null,
    area: "Hamra",
    notes: null,
    locationUrl: null,
    active: true,
    isRegular: true,
    branchId: null,
    tenantId: "t1",
    cancelledAt: null,
    portalPassword: null,
    portalEnabled: false,
    createdAt: "2025-06-01T12:00:00.000Z",
    updatedAt: "2025-06-01T12:00:00.000Z",
    customerPlans: [line()],
    ...over,
  };
}

describe("TC-RA-22..26 — customers", () => {
  const customers = [
    customer(),
    customer({ id: "cu2", createdAt: "2026-03-05T12:00:00.000Z", customerPlans: [line({ id: "l2", planId: null, plan: null, customPrice: 12 })] }),
    customer({ id: "cu3", active: false, cancelledAt: "2026-03-20T12:00:00.000Z", customerPlans: [line({ id: "l3", active: false })] }),
    customer({ id: "cu4", createdAt: "2026-02-10T12:00:00.000Z", customerPlans: [line({ id: "l4", planId: "p2", plan: { ...PLAN, id: "p2", isCustomPrice: true, price: null } })] }),
  ];

  it("TC-RA-22 joined and left count only inside the period; the previous period compares", () => {
    const v = customersAnalysis({ customers }, view({ groupBy: "plan" }), MARCH, []);
    expect(v.kpis.find((k) => k.key === "joined")?.value).toEqual({ kind: "count", value: 1 });
    expect(v.kpis.find((k) => k.key === "left")?.value).toEqual({ kind: "count", value: 1 });
    expect(v.kpis.find((k) => k.key === "joined")?.delta).toEqual({ abs: 0, pct: 0 });
  });

  it("TC-RA-23 expected per month = set price ÷ the plan's months; cancelled and unpriced add nothing", () => {
    expect(expectedMonthlyUsd(customers[0], [])).toBeCloseTo(10);
    expect(expectedMonthlyUsd(customers[1], [])).toBeCloseTo(12);
    expect(expectedMonthlyUsd(customers[2], [])).toBe(0);
    expect(expectedMonthlyUsd(customers[3], [])).toBe(0);
    const v = customersAnalysis({ customers }, view({ groupBy: "plan" }), MARCH, []);
    expect(v.kpis.find((k) => k.key === "monthly")?.value).toEqual(money(22));
    expect(v.unpricedLines).toBe(1);
  });

  it("TC-RA-24 a line with no plan is a special price; a cancelled customer keeps its old plan", () => {
    expect(customerKeyOf(customers[1], "plan")).toEqual([CUSTOM_PRICE_KEY]);
    expect(customerKeyOf(customers[2], "plan")).toEqual(["p1"]);
  });

  it("TC-RA-25 trend buckets hold the joins and leaves of the period", () => {
    const v = customersAnalysis({ customers }, view({ groupBy: "plan", grain: "month" }), MARCH, []);
    expect(v.trend).toEqual([{ key: "2026-03-01", joined: 1, left: 1, net: 0 }]);
  });

  it("TC-RA-26 a status filter narrows every figure", () => {
    const v = customersAnalysis({ customers }, view({ groupBy: "plan", filter: { status: "cancelled" } }), MARCH, []);
    expect(v.rows.map((c) => c.id)).toEqual(["cu3"]);
  });
});

function saleItem(over: Partial<SaleItem> = {}): SaleItem {
  return {
    id: "si1",
    saleId: "s1",
    tenantId: "t1",
    lineType: "product",
    productId: "pr1",
    serviceId: null,
    itemNameSnapshot: "Router",
    quantity: 2,
    unitAmount: 30,
    lineTotal: 60,
    createdAt: "2026-03-01T00:00:00.000Z",
    ...over,
  };
}

function sale(over: Partial<Sale> = {}): Sale {
  return {
    id: "s1",
    tenantId: "t1",
    branchId: null,
    itemsSummary: "Router",
    customerId: "cu1",
    recordedByUserId: "u1",
    totalAmount: 50,
    currencyId: null,
    ratePerUsdSnapshot: 1,
    soldAt: "2026-03-03T12:00:00.000Z",
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    notes: null,
    createdAt: "2026-03-03T12:00:00.000Z",
    amountPaid: 0,
    chargeId: null,
    charge: null,
    items: [saleItem()],
    ...over,
  };
}

describe("TC-RA-27..31 — sales", () => {
  const sales = [
    sale(),
    sale({
      id: "s2",
      recordedByUserId: "u2",
      totalAmount: 20,
      items: [saleItem({ id: "si2", saleId: "s2", lineType: "service", productId: null, serviceId: "sv1", itemNameSnapshot: "Install", quantity: 1, lineTotal: 20 })],
    }),
    sale({ id: "s3", totalAmount: 5, items: [] }),
  ];
  const cashOnSales = [cash({ stream: "sale", amount: 15 }), cash({ id: "i9", stream: "month", amount: 99 })];

  it("TC-RA-27 sold is the TYPED total, never the line sum (discount kept)", () => {
    const v = salesAnalysis({ sales, prevSales: [] }, cashOnSales, view({ groupBy: "recorded_by" }), MARCH);
    expect(v.kpis.find((k) => k.key === "sold")?.value).toEqual(money(75));
    expect(v.grouped.level).toBe("sale");
  });

  it("TC-RA-28 an item filter keeps the sales holding that item", () => {
    const v = salesAnalysis({ sales, prevSales: [] }, cashOnSales, view({ groupBy: "item", filter: { item: "service:sv1" } }), MARCH);
    expect(v.sales.map((s) => s.id)).toEqual(["s2"]);
    expect(v.grouped.level).toBe("line");
  });

  it("TC-RA-29 units count product lines only", () => {
    expect(unitsOf(linesOf(sales))).toBe(2);
  });

  it("TC-RA-30 collected on sales reads only sale cash, and hides under a filter cash can't follow", () => {
    const plain = salesAnalysis({ sales, prevSales: [] }, cashOnSales, view({ groupBy: "item" }), MARCH);
    expect(plain.kpis.find((k) => k.key === "collected")?.value).toEqual(money(15));
    const byStaff = salesAnalysis({ sales, prevSales: [] }, cashOnSales, view({ groupBy: "item", filter: { recorded_by: "u1" } }), MARCH);
    expect(byStaff.kpis.find((k) => k.key === "collected")).toBeUndefined();
  });

  it("TC-RA-31 a sale with no lines is still a sale", () => {
    const v = salesAnalysis({ sales, prevSales: [] }, null, view({ groupBy: "time", grain: "month" }), MARCH);
    expect(v.kpis.find((k) => k.key === "sales")?.value).toEqual({ kind: "count", value: 3 });
  });
});

describe("TC-RA-32..33 — staff", () => {
  it("TC-RA-32 one row per person, cash and sales and spending kept apart", () => {
    const v = staffAnalysis(
      { cash: [cash(), cash({ id: "i2", collectionId: "c1", amount: 5 }), cash({ id: "i3", collectionId: "c2", receivedByUserId: "u2" })], expenses: [expense()] },
      { sales: [sale()] },
    );
    const u1 = v.rows.find((r) => r.id === "u1")!;
    expect(u1).toMatchObject({ collectedUsd: 15, handOvers: 1, salesCount: 1, soldUsd: 50, spentUsd: 30 });
    expect(v.rows[0].id).toBe("u1");
  });

  it("TC-RA-33 money with no person goes to one 'unknown' row, not counted as staff", () => {
    const v = staffAnalysis({ cash: [cash({ receivedByUserId: null })], expenses: [] }, { sales: [] });
    expect(v.rows[0].id).toBe(NO_KEY);
    expect(v.kpis.find((k) => k.key === "people")?.value).toEqual({ kind: "count", value: 0 });
  });
});

function metrics(over: Partial<DashboardMetrics> = {}): DashboardMetrics {
  return {
    totalCustomers: 10,
    activeCustomers: 8,
    monthlyRevenue: 100,
    subscriptionRevenue: 100,
    salesRevenue: 0,
    manualRevenue: 0,
    monthlyExpenses: 0,
    stockExpenses: 0,
    customExpenses: 0,
    netIncome: 100,
    unpaidThisMonth: 2,
    dueThisMonth: 8,
    totalUsers: 2,
    totalPlans: 1,
    totalDebt: 0,
    totalToCollect: 0,
    toCollectMonths: 0,
    toCollectSales: 0,
    toCollectManual: 0,
    unpricedLines: 0,
    monthsDebt: 0,
    salesDebt: 0,
    manualDebt: 0,
    walletCash: 0,
    walletCollectors: 0,
    walletTransactions: 0,
    newCustomersThisMonth: 1,
    cancelledThisMonth: 0,
    paymentsCollectedCount: 5,
    salesCount: 0,
    prevMonthRevenue: 80,
    ...over,
  };
}

describe("TC-RA-34..37 — dashboard", () => {
  it("TC-RA-34 one earning stream shows no mix; two do", () => {
    expect(revenueHero(metrics(), true).mix).toEqual([]);
    const both = revenueHero(metrics({ salesRevenue: 20, monthlyRevenue: 120 }), true);
    expect(both.mix.map((p) => p.key)).toEqual(["subscriptions", "sales"]);
  });

  it("TC-RA-35 paid and due count the same people; nothing due reads 100%", () => {
    const hero = revenueHero(metrics(), true);
    expect([hero.paid, hero.due, hero.collectedPct]).toEqual([6, 8, 75]);
    expect(revenueHero(metrics({ dueThisMonth: 0, unpaidThisMonth: 0 }), true).collectedPct).toBe(100);
    expect(hero.changePct).toBe(25);
    expect(revenueHero(metrics({ prevMonthRevenue: 0 }), true).changePct).toBeNull();
  });

  it("TC-RA-36 spending and net only for an admin with something spent", () => {
    const spent = metrics({ monthlyExpenses: 30, netIncome: 70 });
    expect(dashboardTiles(spent, true).map((t) => t.key)).toContain("net");
    expect(dashboardTiles(spent, false).map((t) => t.key)).not.toContain("net");
    expect(dashboardTiles(metrics(), true).map((t) => t.key)).not.toContain("expenses");
  });

  it("TC-RA-36b to collect splits by stream, adds up, and drops empty parts", () => {
    const hero = revenueHero(
      metrics({ totalToCollect: 140, toCollectMonths: 40, toCollectSales: 100 }),
      true,
    );
    expect(hero.toCollectMix.map((p) => [p.key, p.usd])).toEqual([
      ["subscriptions", 40],
      ["sales", 100],
    ]);
    expect(hero.toCollectMix.reduce((sum, p) => sum + p.usd, 0)).toBe(hero.toCollectUsd);
  });

  it("TC-RA-37 a loss reads with a minus in front", () => {
    expect(formatKpiValue(money(-5), null)).toMatch(/^−/);
    expect(formatKpiValue(money(5), null)).not.toMatch(/^−/);
  });
});

describe("TC-RA-38..40 — view state and files", () => {
  it("TC-RA-38 changing the time step drops a picked day", () => {
    const next = withGrain(view({ filter: { time: "2026-03-01", collector: "u1" } }), "week");
    expect(next.filter).toEqual({ collector: "u1" });
    expect(next.grain).toBe("week");
  });

  it("TC-RA-39 drilling pins the group and splits it by the next question", () => {
    const next = drilledInto(view({ groupBy: "collector" }), "collector", "u1", "customer");
    expect(next).toMatchObject({ filter: { collector: "u1" }, groupBy: "customer" });
    expect(splitTargets(["stream", "collector", "customer", "time"], next)).toEqual(["stream", "time"]);
    expect(defaultViews().money_in.groupBy).toBe("stream");
  });

  it("TC-RA-40 CSV amounts are plain 2-decimal numbers, USD at the frozen rate", () => {
    const table = recordsCsv(cashRecords([cash({ amount: 900000, currencyId: "lbp", ratePerUsdSnapshot: 90000 })]), []);
    expect(table.rows[0].slice(3)).toEqual(["900000.00", "USD", "10.00"]);
    const groups = groupsCsv([{ key: "a", value: 1234.5, count: 2, share: 0.5, rows: [] }], { dim: "d", count: "c", value: "v", share: "s" }, (k) => k);
    expect(groups.rows[0]).toEqual(["a", 2, "1234.50", "50%"]);
  });
});
