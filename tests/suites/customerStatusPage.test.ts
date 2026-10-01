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
  DEFAULT_CUSTOMER_FILTERS,
  hasCustomerFilters,
  isCustomerFilterQuery,
  matchesCustomerFilters,
  toCustomerFilterQuery,
  type CustomerFilterQuery,
  type CustomerFilters,
  type CustomerListFacts,
  type CustomerSort,
  type PaymentFilter,
} from "@shared/modules/customer/customers/utils/customerFilters";
import { bill, customer, line, openItem, skip } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";

interface Fixture {
  customers: Customer[];
  bills: MonthBill[];
  skips: SkippedMonth[];
  open: OpenItem[];
  lastPaid: Map<string, string>;
}

const PLAN_10A = "0b9f8a4e-8a3c-4c1e-9d5f-2f6b8a1c0d3e";
const PLAN_5A = "1c8e7b3d-7b2b-4b0d-8c4e-1e5a7b0c9d2f";

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
    portalEnabled: true,
    portalPassword: "1234",
    createdAt: "2025-10-01T08:00:00.000Z",
    customerPlans: [lineOf("c-paid", "l-paid", { planId: PLAN_10A })],
  });
  const overdue = customer({
    id: "c-overdue",
    name: "ali haddad",
    phoneNumber: "03111222",
    createdAt: "2026-02-01T08:00:00.000Z",
    customerPlans: [lineOf("c-overdue", "l-overdue", { planId: PLAN_5A })],
  });
  const mixed = customer({
    id: "c-mixed",
    name: "Karim",
    area: "Hamra",
    phoneNumber: "  ",
    customerPlans: [
      lineOf("c-mixed", "l-mixed-a", { planId: PLAN_10A }),
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
    phoneNumber: null,
    customerPlans: [lineOf("c-basma-2", "l-basma-2", { active: false, planId: PLAN_5A })],
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
    lastPaid: new Map([
      ["c-paid", "2026-03-02T10:00:00.000Z"],
      ["c-overdue", "2025-12-05T10:00:00+00:00"],
      ["c-mixed", "2026-02-20T21:30:00.000Z"],
      ["c-partial", "2026-03-10T09:00:00.000Z"],
      ["c-inactive", "2025-11-03T09:00:00.000Z"],
    ]),
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
      c.portalEnabled,
      c.createdAt,
      f.lastPaid.get(c.id) ?? null,
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
        l.planId,
      ]),
    ),
    debts: f.open
      .filter((i) => i.balance > 0)
      .map((i): WireDebt => [i.customerId, i.kind, i.balance, i.paid, i.ratePerUsdSnapshot]),
  };
}

// The phone path: statuses from the slice helper, debt from the debts view.
function phoneList(f: Fixture, filters: CustomerFilterQuery) {
  const statuses = getCustomerStatuses(f.customers, f.bills, f.skips);
  const net = new Map(
    chargeService.buildDebtsView(f.open).customers.map((c) => [c.customerId, c.debtUsd]),
  );
  return [...f.customers]
    .sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1))
    .filter((c) =>
      matchesCustomerFilters(
        c,
        { status: statuses.get(c.id) ?? null, debtUsd: net.get(c.id), lastPaidAt: f.lastPaid.get(c.id) },
        filters,
      ),
    )
    .map((c) => ({
      customerId: c.id,
      status: statuses.get(c.id) ?? null,
      debtUsd: net.get(c.id) ?? 0,
    }));
}

const pick = (over: Partial<CustomerFilters> = {}) =>
  toCustomerFilterQuery({ ...DEFAULT_CUSTOMER_FILTERS, status: "all", ...over });

const query = (
  filters: CustomerFilterQuery = pick(),
  over: Partial<{ search: string; offset: number; limit: number; sort: CustomerSort }> = {},
) => ({
  search: "",
  filters,
  sort: "name" as CustomerSort,
  offset: 0,
  limit: 100,
  ...over,
});

const PAYMENTS: PaymentFilter[] = ["unpaid", "overdue", "mixed", "paid", "not_due_yet"];

const COMBOS: Partial<CustomerFilters>[] = [
  {},
  { status: "active" },
  { status: "inactive" },
  ...PAYMENTS.map((payment) => ({ payment })),
  { debt: "yes" },
  { debt: "no" },
  { planId: PLAN_10A },
  { planId: PLAN_5A },
  { unpaidMonths: 1 },
  { unpaidMonths: 2 },
  { unpaidMonths: 3 },
  { type: "regular" },
  { type: "occasional" },
  { phone: "yes" },
  { phone: "no" },
  { portal: "yes" },
  { portal: "no" },
  { paidFrom: "2026-02-01" },
  { paidTo: "2026-01-31" },
  { paidFrom: "2026-02-01", paidTo: "2026-03-05" },
  { status: "active", debt: "yes", payment: "unpaid" },
  { planId: PLAN_10A, phone: "no", unpaidMonths: 1 },
];

describe("pageCustomerStatuses — server filters equal the phone list", () => {
  beforeEach(() => freezeToday(2026, 3, 15));
  afterEach(unfreeze);

  it("TC-CT-01 every filter lists the same customers, statuses and debt as the phone", () => {
    const f = fixture();
    const facts = readCustomerStatusFacts(toWire(f), "month_start");
    for (const combo of COMBOS) {
      const filters = pick(combo);
      const page = pageCustomerStatuses(facts, query(filters));
      const expected = phoneList(f, filters);
      expect(page.rows.map((r) => r.customerId)).toEqual(expected.map((r) => r.customerId));
      expect(page.rows.map((r) => r.status)).toEqual(expected.map((r) => r.status));
      page.rows.forEach((r, i) => expect(r.debtUsd).toBeCloseTo(expected[i].debtUsd, 8));
      expect(page.total).toBe(expected.length);
    }
  });

  it("TC-CT-02 the fixture reaches every filter value (so TC-CT-01 means something)", () => {
    const facts = readCustomerStatusFacts(toWire(fixture()), "month_start");
    const total = (combo: Partial<CustomerFilters>) =>
      pageCustomerStatuses(facts, query(pick(combo))).total;
    expect(total({})).toBe(10);
    expect(total({ status: "active" })).toBe(9);
    expect(total({ status: "inactive" })).toBe(1);
    expect(PAYMENTS.map((payment) => total({ payment }))).toEqual([1, 2, 1, 2, 2]);
    expect(total({ debt: "yes" })).toBe(3);
    expect(total({ debt: "no" })).toBe(7);
    expect(total({ planId: PLAN_10A })).toBe(2);
    expect(total({ planId: PLAN_5A })).toBe(1);
    expect(total({ type: "occasional" })).toBe(1);
    expect(total({ phone: "no" })).toBe(2);
    expect(total({ portal: "yes" })).toBe(1);
    expect(total({ paidFrom: "2026-02-01" })).toBe(3);
  });

  it("TC-CT-03 filters stack: every picked filter must hold", () => {
    const facts = readCustomerStatusFacts(toWire(fixture()), "month_start");
    const ids = (combo: Partial<CustomerFilters>) =>
      pageCustomerStatuses(facts, query(pick(combo))).rows.map((r) => r.customerId);
    expect(ids({ planId: PLAN_10A, phone: "no" })).toEqual(["c-mixed"]);
    expect(ids({ status: "inactive", payment: "unpaid" })).toEqual([]);
    expect(ids({ debt: "yes", status: "active" })).toEqual(["c-walkin", "c-partial"]);
  });

  it("TC-CT-04 paging slices one filter; the total stays the whole filter", () => {
    const facts = readCustomerStatusFacts(toWire(fixture()), "month_start");
    const all = pageCustomerStatuses(facts, query()).rows.map((r) => r.customerId);
    const second = pageCustomerStatuses(facts, query(pick(), { offset: 3, limit: 3 }));
    expect(second.rows.map((r) => r.customerId)).toEqual(all.slice(3, 6));
    expect(second.total).toBe(10);
    expect(pageCustomerStatuses(facts, query(pick(), { offset: 10, limit: 3 })).rows).toEqual([]);
  });

  it("TC-CT-05 sorted by name, then id — the two Basmas keep a fixed order", () => {
    const facts = readCustomerStatusFacts(toWire(fixture()), "month_start");
    const ids = pageCustomerStatuses(facts, query()).rows.map((r) => r.customerId);
    expect(ids.indexOf("c-basma-2")).toBe(ids.indexOf("c-paid") - 1);
  });

  it("TC-CT-06 search reads name, phone, address and area, any case", () => {
    const facts = readCustomerStatusFacts(toWire(fixture()), "month_start");
    const found = (search: string) =>
      pageCustomerStatuses(facts, query(pick(), { search })).rows.map((r) => r.customerId);
    expect(found("ALI")).toEqual(["c-overdue", "c-walkin"]);
    expect(found("0311")).toEqual(["c-overdue"]);
    expect(found("verdun")).toEqual(["c-notdue"]);
    expect(found("hamra")).toEqual(["c-mixed"]);
    expect(found("  %Karim(  ")).toEqual(["c-mixed"]);
    expect(found("nobody")).toEqual([]);
  });

  it("TC-CT-07 each sort puts the right customer first; ties fall back to name", () => {
    const facts = readCustomerStatusFacts(toWire(fixture()), "month_start");
    const ids = (sort: CustomerSort) =>
      pageCustomerStatuses(facts, query(pick({ status: "active" }), { sort })).rows.map(
        (r) => r.customerId,
      );
    expect(ids("debt").slice(0, 2)).toEqual(["c-partial", "c-walkin"]);
    expect(ids("unpaid_months").slice(0, 2)).toEqual(["c-mixed", "c-overdue"]);
    expect(ids("longest_unpaid").slice(0, 2)).toEqual(["c-walkin", "c-basma-2"]);
    expect(ids("longest_unpaid").slice(-1)).toEqual(["c-partial"]);
    expect(ids("newest")[0]).toBe("c-overdue");
    expect(ids("newest").slice(-1)).toEqual(["c-paid"]);
  });

  it("TC-CT-08 compact facts give the same status as the full rows", () => {
    const f = fixture();
    const facts = readCustomerStatusFacts(toWire(f), "month_start");
    for (const c of f.customers) {
      const compact = facts.customers.find((x) => x.id === c.id)!;
      expect(
        buildCustomerStatus(
          compact.customerPlans,
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
    const rows = pageCustomerStatuses(facts, query()).rows;
    expect(rows.find((r) => r.customerId === "c-inactive")!.status).toBeNull();
    expect(rows.find((r) => r.customerId === "c-walkin")!.status).toBeNull();
  });

  it("TC-CT-23 old SQL without the new columns still reads, with empty defaults", () => {
    const facts = readCustomerStatusFacts(
      {
        customers: [["c1", "Ali", null, null, null, true, true]],
        lines: [["l1", "c1", "2026-01-01", true, [], []]],
        debts: [],
      },
      "month_start",
    );
    expect(facts.customers[0]).toMatchObject({
      portalEnabled: false,
      lastPaidAt: null,
      customerPlans: [{ id: "l1", planId: null }],
    });
  });
});

describe("customerStatusPage — the caller's calendar day", () => {
  afterEach(unfreeze);

  const startDayFixture = (): CustomerStatusFactsWire => ({
    customers: [["c1", "Ali", null, null, null, true, true, false, "2026-01-01T00:00:00Z", null]],
    lines: [
      ["l1", "c1", "2026-01-20", true, [["2026-01-01", 1, 20, 20], ["2026-02-01", 1, 20, 20]], [], null],
    ],
    debts: [],
  });
  const settings = [{ key: "UnpaidStartRule", value: "customer_start_day" }];
  const request = (today: string) => ({
    search: "",
    filters: pick(),
    sort: "name" as CustomerSort,
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
    filters: pick({ payment: "overdue", planId: PLAN_5A, unpaidMonths: 2, paidFrom: "2026-02-01" }),
    sort: "debt",
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
    const { sort: _sort, ...noSort } = valid;
    expect(parseCustomerStatusRequest(noSort, now)).toMatchObject({ ok: true, request: { sort: "name" } });
  });

  it("TC-CT-15 anything malformed is refused before any read", () => {
    const refused = [
      { filters: undefined },
      { filters: "overdue" },
      { filters: { ...pick(), payment: "owing" } },
      { filters: { ...pick(), status: null } },
      { filters: { ...pick(), unpaidMonths: 4 } },
      { filters: { ...pick(), planId: "main" } },
      { filters: { ...pick(), paidSinceIso: "yesterday" } },
      { sort: "price" },
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

describe("matchesCustomerFilters", () => {
  const facts = (over: Partial<CustomerListFacts> = {}): CustomerListFacts => ({
    status: null,
    debtUsd: 0,
    lastPaidAt: null,
    ...over,
  });

  it("TC-CT-17 an overdue customer is not also listed under Unpaid", () => {
    const c = customer();
    const status = buildCustomerStatus([line({ startDate: "2020-01-01" })], [], []);
    expect(matchesCustomerFilters(c, facts({ status }), pick({ payment: "overdue" }))).toBe(true);
    expect(matchesCustomerFilters(c, facts({ status }), pick({ payment: "unpaid" }))).toBe(false);
  });

  it("TC-CT-18 no status means no payment filter; debt alone decides Has debts", () => {
    const c = customer({ active: false });
    expect(matchesCustomerFilters(c, facts({ debtUsd: 12 }), pick({ debt: "yes" }))).toBe(true);
    expect(matchesCustomerFilters(c, facts(), pick({ debt: "yes" }))).toBe(false);
    expect(matchesCustomerFilters(c, facts(), pick({ debt: "no" }))).toBe(true);
    for (const payment of PAYMENTS)
      expect(matchesCustomerFilters(customer(), facts(), pick({ payment }))).toBe(false);
  });

  it("TC-CT-19 a cancelled line's plan does not match the plan filter", () => {
    const c = customer({ customerPlans: [line({ planId: PLAN_10A, active: false })] });
    expect(matchesCustomerFilters(c, facts(), pick({ planId: PLAN_10A }))).toBe(false);
  });

  it("TC-CT-20 last paid covers whole local days; never paid is outside any range", () => {
    const c = customer();
    const at = (d: Date) => facts({ lastPaidAt: d.toISOString() });
    const day = pick({ paidFrom: "2026-03-10", paidTo: "2026-03-10" });
    expect(matchesCustomerFilters(c, at(new Date(2026, 2, 10, 0, 0)), day)).toBe(true);
    expect(matchesCustomerFilters(c, at(new Date(2026, 2, 10, 23, 59)), day)).toBe(true);
    expect(matchesCustomerFilters(c, at(new Date(2026, 2, 11, 0, 0)), day)).toBe(false);
    expect(matchesCustomerFilters(c, at(new Date(2026, 2, 9, 23, 59)), day)).toBe(false);
    expect(matchesCustomerFilters(c, facts(), day)).toBe(false);
    expect(matchesCustomerFilters(c, facts(), pick())).toBe(true);
  });

  it("TC-CT-21 unpaid months counts distinct months, the current one included", () => {
    freezeToday(2026, 3, 15);
    const status = buildCustomerStatus(
      [line({ id: "a", startDate: "2026-01-01" }), line({ id: "b", startDate: "2026-02-01" })],
      [],
      [],
    );
    unfreeze();
    expect(status.unpaidMonths).toBe(3);
    expect(matchesCustomerFilters(customer(), facts({ status }), pick({ unpaidMonths: 3 }))).toBe(true);
    expect(matchesCustomerFilters(customer(), facts({ status }), pick({ unpaidMonths: 6 }))).toBe(false);
  });

  it("TC-CT-22 the default view is active customers and counts as unfiltered", () => {
    const defaults = toCustomerFilterQuery(DEFAULT_CUSTOMER_FILTERS);
    expect(hasCustomerFilters(DEFAULT_CUSTOMER_FILTERS)).toBe(false);
    expect(hasCustomerFilters({ ...DEFAULT_CUSTOMER_FILTERS, status: "all" })).toBe(true);
    expect(hasCustomerFilters({ ...DEFAULT_CUSTOMER_FILTERS, paidTo: "2026-01-01" })).toBe(true);
    expect(isCustomerFilterQuery(defaults)).toBe(true);
    expect(matchesCustomerFilters(customer({ active: false }), facts(), defaults)).toBe(false);
  });
});
