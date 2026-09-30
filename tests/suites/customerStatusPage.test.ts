import type {
  Customer,
  CustomerPlan,
  MonthBill,
  OpenItem,
  SkippedMonth,
} from "@shared/core/types";
import { getTodayDateString } from "@shared/core/utils/date";
import { chargeService } from "@shared/modules/ledger/services/ChargeService";
import { isDebtItem } from "@shared/modules/ledger/utils/debtRule";
import {
  buildCustomerStatus,
  getCustomerStatuses,
} from "@shared/modules/customer/customer-payments/utils/monthStatus";
import {
  readCustomerStatusFacts,
  type CustomerStatusFactsWire,
  type WireBill,
  type WireCustomer,
  type WireDebt,
  type WireLine,
} from "@shared/modules/customer/customers/utils/customerStatusFacts";
import {
  customerStatusPage,
  factsRpcArgs,
  pageCustomerStatuses,
  parseCustomerStatusRequest,
} from "@shared/modules/customer/customers/utils/customerStatusPage";
import {
  CUSTOMER_TABS,
  matchesCustomerTab,
  type CustomerTab,
} from "@shared/modules/customer/customers/utils/customerTabs";
import { bill, customer, line, openItem, skip } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";

interface Fixture {
  customers: Customer[];
  bills: MonthBill[];
  skips: SkippedMonth[];
  open: OpenItem[];
}

function lineOf(customerId: string, lineId: string, over: Partial<CustomerPlan> = {}) {
  return line({ id: lineId, customerId, startDate: "2025-11-01", ...over });
}

function monthsPaid(customerId: string, lineId: string, months: string[], amount = 20) {
  return months.map((m) =>
    bill(m, amount, { customerId, customerPlanId: lineId }),
  );
}

function open(customerId: string, over: Partial<OpenItem>): OpenItem {
  const item = openItem({ customerId, ...over });
  return { ...item, isDebt: isDebtItem(item.kind, item.paid) };
}

// Built as the phone holds it; `toWire` then encodes it the way the SQL does.
function fixture(): Fixture {
  const paidUp = customer({
    id: "c-paid",
    name: "Basma",
    customerPlans: [lineOf("c-paid", "l-paid")],
  });
  const overdue = customer({
    id: "c-overdue",
    name: "ali haddad",
    phoneNumber: "03111222",
    customerPlans: [lineOf("c-overdue", "l-overdue")],
  });
  const mixed = customer({
    id: "c-mixed",
    name: "Karim",
    area: "Hamra",
    customerPlans: [
      lineOf("c-mixed", "l-mixed-a"),
      lineOf("c-mixed", "l-mixed-b"),
    ],
  });
  const notDue = customer({
    id: "c-notdue",
    name: "Dana",
    address: "Verdun street",
    customerPlans: [lineOf("c-notdue", "l-notdue", { startDate: "2026-04-01" })],
  });
  const skipped = customer({
    id: "c-skipped",
    name: "Elie",
    customerPlans: [lineOf("c-skipped", "l-skipped", { startDate: "2026-03-01" })],
  });
  const partial = customer({
    id: "c-partial",
    name: "Fadi",
    customerPlans: [lineOf("c-partial", "l-partial", { startDate: "2026-02-01" })],
  });
  const unpaidOnlyNow = customer({
    id: "c-unpaid",
    name: "Ghada",
    customerPlans: [lineOf("c-unpaid", "l-unpaid", { startDate: "2026-03-01" })],
  });
  const inactive = customer({
    id: "c-inactive",
    name: "Hadi",
    active: false,
    customerPlans: [lineOf("c-inactive", "l-inactive")],
  });
  const walkIn = customer({
    id: "c-walkin",
    name: "Ali Walk-in",
    isRegular: false,
    customerPlans: [],
  });
  const sameName = customer({
    id: "c-basma-2",
    name: "Basma",
    customerPlans: [lineOf("c-basma-2", "l-basma-2", { active: false })],
  });

  const allMonths = ["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01"];
  const bills = [
    ...monthsPaid("c-paid", "l-paid", allMonths),
    ...monthsPaid("c-overdue", "l-overdue", ["2025-11-01", "2025-12-01"]),
    ...monthsPaid("c-mixed", "l-mixed-a", allMonths),
    ...monthsPaid("c-mixed", "l-mixed-b", ["2025-11-01"]),
    ...monthsPaid("c-partial", "l-partial", ["2026-02-01", "2026-03-01"], 5),
    bill("2026-02-01", 0, { customerId: "c-overdue", customerPlanId: "l-overdue" }),
    ...monthsPaid("c-inactive", "l-inactive", ["2025-11-01"]),
  ];
  const skips = [
    skip("2026-03-01", { customerId: "c-skipped", customerPlanId: "l-skipped" }),
  ];
  const openItems = [
    open("c-partial", { kind: "month", amount: 20, paid: 5 }),
    open("c-partial", { kind: "month", amount: 20, paid: 5 }),
    open("c-overdue", { kind: "month", amount: 20, paid: 0 }),
    open("c-walkin", { kind: "sale", amount: 890000, paid: 0, ratePerUsdSnapshot: 89000 }),
    open("c-inactive", { kind: "manual", amount: 15, paid: 0 }),
  ];
  return {
    customers: [paidUp, overdue, mixed, notDue, skipped, partial, unpaidOnlyNow, inactive, walkIn, sameName],
    bills,
    skips,
    open: openItems,
  };
}

function toWire(f: Fixture): CustomerStatusFactsWire {
  return {
    customers: f.customers.map((c): WireCustomer => [
      c.id,
      c.name,
      c.phoneNumber,
      c.address,
      c.area,
      c.active,
      c.isRegular,
    ]),
    lines: f.customers.flatMap((c) =>
      (c.customerPlans ?? []).map((l): WireLine => [
        l.id,
        c.id,
        l.startDate,
        l.active,
        f.bills
          .filter((b) => b.charge.customerPlanId === l.id)
          .sort((a, b) => a.charge.billingMonth!.localeCompare(b.charge.billingMonth!))
          .map((b): WireBill => [b.charge.billingMonth!, b.charge.durationMonths, b.charge.amount, b.collected]),
        f.skips.filter((s) => s.customerPlanId === l.id && s.skipped).map((s) => s.billingMonth),
      ]),
    ),
    debts: f.open
      .filter((i) => i.balance > 0)
      .map((i): WireDebt => [i.customerId, i.kind, i.balance, i.paid, i.ratePerUsdSnapshot]),
  };
}

// Today's phone path: statuses from the slice helper, debt from the debts view.
function phoneTab(f: Fixture, tab: CustomerTab) {
  const statuses = getCustomerStatuses(f.customers, f.bills, f.skips);
  const net = new Map(
    chargeService.buildDebtsView(f.open).customers.map((c) => [c.customerId, c.debtUsd]),
  );
  return [...f.customers]
    .sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1))
    .filter((c) => matchesCustomerTab(c, statuses.get(c.id) ?? null, net.get(c.id), tab))
    .map((c) => ({
      customerId: c.id,
      status: statuses.get(c.id) ?? null,
      debtUsd: net.get(c.id) ?? 0,
    }));
}

const query = (tab: CustomerTab, over: Partial<{ search: string; offset: number; limit: number }> = {}) => ({
  search: "",
  tab,
  offset: 0,
  limit: 100,
  ...over,
});

describe("pageCustomerStatuses — server tabs equal the phone list", () => {
  beforeEach(() => freezeToday(2026, 3, 15));
  afterEach(unfreeze);

  it("TC-CT-01 every tab lists the same customers, statuses and debt", () => {
    const f = fixture();
    const facts = readCustomerStatusFacts(toWire(f), "month_start");
    for (const tab of CUSTOMER_TABS) {
      const page = pageCustomerStatuses(facts, query(tab));
      const expected = phoneTab(f, tab);
      expect(page.rows.map((r) => r.customerId)).toEqual(expected.map((r) => r.customerId));
      expect(page.rows.map((r) => r.status)).toEqual(expected.map((r) => r.status));
      page.rows.forEach((r, i) => expect(r.debtUsd).toBeCloseTo(expected[i].debtUsd, 8));
      expect(page.total).toBe(expected.length);
    }
  });

  it("TC-CT-02 the fixture reaches every payment tab (so TC-CT-01 means something)", () => {
    const facts = readCustomerStatusFacts(toWire(fixture()), "month_start");
    const { counts } = pageCustomerStatuses(facts, query("all"));
    expect(counts).toEqual({
      active: 9,
      unpaid: 1,
      overdue: 2,
      mixed: 1,
      paid: 2,
      not_due_yet: 2,
      has_debt: 3,
      all: 10,
      inactive: 1,
    });
  });

  it("TC-CT-03 counts are the same whichever tab is open", () => {
    const facts = readCustomerStatusFacts(toWire(fixture()), "month_start");
    const counts = CUSTOMER_TABS.map((tab) => pageCustomerStatuses(facts, query(tab)).counts);
    counts.forEach((c) => expect(c).toEqual(counts[0]));
  });

  it("TC-CT-04 paging slices one tab; the total stays the whole tab", () => {
    const facts = readCustomerStatusFacts(toWire(fixture()), "month_start");
    const all = pageCustomerStatuses(facts, query("all")).rows.map((r) => r.customerId);
    const second = pageCustomerStatuses(facts, query("all", { offset: 3, limit: 3 }));
    expect(second.rows.map((r) => r.customerId)).toEqual(all.slice(3, 6));
    expect(second.total).toBe(10);
    expect(pageCustomerStatuses(facts, query("all", { offset: 10, limit: 3 })).rows).toEqual([]);
  });

  it("TC-CT-05 sorted by name, then id — the two Basmas keep a fixed order", () => {
    const facts = readCustomerStatusFacts(toWire(fixture()), "month_start");
    const ids = pageCustomerStatuses(facts, query("all")).rows.map((r) => r.customerId);
    expect(ids.indexOf("c-basma-2")).toBe(ids.indexOf("c-paid") - 1);
  });

  it("TC-CT-06 search reads name, phone, address and area, any case", () => {
    const facts = readCustomerStatusFacts(toWire(fixture()), "month_start");
    const found = (search: string) =>
      pageCustomerStatuses(facts, query("all", { search })).rows.map((r) => r.customerId);
    expect(found("ALI")).toEqual(["c-overdue", "c-walkin"]);
    expect(found("0311")).toEqual(["c-overdue"]);
    expect(found("verdun")).toEqual(["c-notdue"]);
    expect(found("hamra")).toEqual(["c-mixed"]);
    expect(found("  %Karim(  ")).toEqual(["c-mixed"]);
    expect(found("nobody")).toEqual([]);
  });

  it("TC-CT-07 counts follow the search, not the whole organization", () => {
    const facts = readCustomerStatusFacts(toWire(fixture()), "month_start");
    const { counts } = pageCustomerStatuses(facts, query("active", { search: "ali" }));
    expect(counts.all).toBe(2);
    expect(counts.overdue).toBe(1);
    expect(counts.has_debt).toBe(1);
  });

  it("TC-CT-08 compact facts give the same status as the full rows", () => {
    const f = fixture();
    const facts = readCustomerStatusFacts(toWire(f), "month_start");
    for (const c of f.customers) {
      const compact = facts.customers.find((x) => x.id === c.id)!;
      expect(
        buildCustomerStatus(
          compact.customerPlans ?? [],
          facts.bills.filter((b) => b.charge.customerId === c.id),
          facts.skips.filter((s) => s.customerId === c.id),
        ),
      ).toEqual(
        buildCustomerStatus(
          c.customerPlans ?? [],
          f.bills.filter((b) => b.charge.customerId === c.id),
          f.skips.filter((s) => s.customerId === c.id),
        ),
      );
    }
  });

  it("TC-CT-09 a fully unpaid month is owed, not debt; LBP is read at its frozen rate", () => {
    const facts = readCustomerStatusFacts(toWire(fixture()), "month_start");
    expect(facts.debtUsd.has("c-overdue")).toBe(false);
    expect(facts.debtUsd.get("c-partial")).toBeCloseTo(30, 8);
    expect(facts.debtUsd.get("c-walkin")).toBeCloseTo(10, 8);
    expect(facts.debtUsd.get("c-inactive")).toBeCloseTo(15, 8);
  });

  it("TC-CT-10 inactive and walk-in customers carry no status pill", () => {
    const facts = readCustomerStatusFacts(toWire(fixture()), "month_start");
    const rows = pageCustomerStatuses(facts, query("all")).rows;
    expect(rows.find((r) => r.customerId === "c-inactive")!.status).toBeNull();
    expect(rows.find((r) => r.customerId === "c-walkin")!.status).toBeNull();
  });
});

describe("customerStatusPage — the caller's calendar day", () => {
  afterEach(unfreeze);

  const startDayFixture = (): CustomerStatusFactsWire => ({
    customers: [["c1", "Ali", null, null, null, true, true]],
    lines: [
      ["l1", "c1", "2026-01-20", true, [["2026-01-01", 1, 20, 20], ["2026-02-01", 1, 20, 20]], []],
    ],
    debts: [],
  });
  const settings = [{ key: "UnpaidStartRule", value: "customer_start_day" }];
  const request = (today: string) => ({
    search: "",
    tab: "all" as CustomerTab,
    branch: null,
    offset: 0,
    limit: 25,
    today,
  });

  it("TC-CT-11 the rules run on the caller's day, not the server's", () => {
    freezeToday(2026, 3, 25);
    const before = customerStatusPage(startDayFixture(), settings, request("2026-03-19"));
    const onDay = customerStatusPage(startDayFixture(), settings, request("2026-03-20"));
    expect(before.rows[0].status!.status).toBe("not_due_yet");
    expect(onDay.rows[0].status!.status).toBe("unpaid");
  });

  it("TC-CT-12 the pinned day is released after the call", () => {
    freezeToday(2026, 3, 25);
    customerStatusPage(startDayFixture(), settings, request("2026-03-19"));
    expect(getTodayDateString()).toBe("2026-03-25");
  });

  it("TC-CT-13 the unpaid rule comes from the settings rows; unknown reads as default", () => {
    freezeToday(2026, 3, 25);
    const unknown = customerStatusPage(
      startDayFixture(),
      [{ key: "UnpaidStartRule", value: "bogus" }],
      request("2026-03-19"),
    );
    const missing = customerStatusPage(startDayFixture(), [], request("2026-03-19"));
    expect(unknown.rows[0].status!.status).toBe("unpaid");
    expect(missing.rows[0].status!.status).toBe("unpaid");
  });
});

describe("parseCustomerStatusRequest", () => {
  const now = new Date(Date.UTC(2026, 2, 15, 23, 30));
  const valid = {
    search: "ali",
    tab: "overdue",
    branch: null,
    offset: 0,
    limit: 25,
    today: "2026-03-16",
  };
  const parse = (over: Record<string, unknown>) =>
    parseCustomerStatusRequest({ ...valid, ...over }, now);

  it("TC-CT-14 a well-formed request passes as-is", () => {
    expect(parse({})).toEqual({ ok: true, request: valid });
    expect(parse({ branch: "unassigned" }).ok).toBe(true);
    expect(parse({ branch: "0b9f8a4e-8a3c-4c1e-9d5f-2f6b8a1c0d3e" }).ok).toBe(true);
    expect(parse({ today: "2026-03-14" }).ok).toBe(true);
  });

  it("TC-CT-15 anything malformed is refused before any read", () => {
    const refused = [
      { tab: "owing" },
      { limit: 0 },
      { limit: 101 },
      { offset: -1 },
      { offset: 1.5 },
      { branch: "main" },
      { today: "2026-03-18" },
      { today: "16/03/2026" },
      { search: "x".repeat(201) },
      { search: 5 },
    ];
    for (const over of refused) expect(parse(over).ok).toBe(false);
  });

  it("TC-CT-16 the branch filter maps onto the SQL arguments", () => {
    expect(factsRpcArgs(null)).toEqual({ p_branch_id: null, p_unassigned: false });
    expect(factsRpcArgs("unassigned")).toEqual({ p_branch_id: null, p_unassigned: true });
    expect(factsRpcArgs("b1")).toEqual({ p_branch_id: "b1", p_unassigned: false });
  });
});

describe("matchesCustomerTab", () => {
  it("TC-CT-17 an overdue customer is not also listed under Unpaid", () => {
    const c = customer();
    const status = buildCustomerStatus([line({ startDate: "2020-01-01" })], [], []);
    expect(matchesCustomerTab(c, status, 0, "overdue")).toBe(true);
    expect(matchesCustomerTab(c, status, 0, "unpaid")).toBe(false);
  });

  it("TC-CT-18 no status means no payment tab; debt alone decides Has debts", () => {
    const c = customer({ active: false });
    expect(matchesCustomerTab(c, null, 12, "has_debt")).toBe(true);
    expect(matchesCustomerTab(c, null, 0, "has_debt")).toBe(false);
    for (const tab of ["unpaid", "overdue", "mixed", "paid", "not_due_yet"] as const)
      expect(matchesCustomerTab(customer(), null, 0, tab)).toBe(false);
  });
});
