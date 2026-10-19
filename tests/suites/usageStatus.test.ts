import type {
  PlanPriceChange,
  PlanUsage,
  StatusReading,
} from "@shared/core/types";
import { priceHistoryOf } from "@shared/modules/customer/customer-plans/utils/priceHistory";
import { usageByLineOf } from "@shared/modules/customer/customer-payments/utils/usageBill";
import {
  buildCustomerStatus,
  countThisMonth,
} from "@shared/modules/customer/customer-payments/utils/monthStatus";
import {
  readCustomerStatusFacts,
  type CustomerStatusFactsWire,
} from "@shared/modules/customer/customers/utils/customerStatusFacts";
import { pageCustomerStatuses } from "@shared/modules/customer/customers/utils/customerStatusPage";
import {
  DEFAULT_CUSTOMER_FILTERS,
  toCustomerFilterQuery,
} from "@shared/modules/customer/customers/utils/customerFilters";
import { bill, customer, line, plan } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";

const METER: PlanUsage = {
  entry: "reading",
  unitName: "kWh",
  feeName: "Fixed fee",
  highUsagePercent: null,
};

const LBP_RATE = 89500;
const JUNE = "2026-06-01";
const JULY = "2026-07-01";
const AUG = "2026-08-01";
const SEP = "2026-09-01";
const OCT = "2026-10-01";
const JUNE_BILL = 685000 + 120 * 40000;
const JULY_BILL = 685000 + 130 * 40000;

const meterPlan = plan({ id: "p-meter", price: null, currencyId: "cur-lbp", usage: METER });
const fixedPlan = plan({ id: "p-fixed", price: 10, currencyId: null });

type LineReading = StatusReading & { customerPlanId: string };

function reading(customerPlanId: string, billingMonth: string, value: number): LineReading {
  return {
    customerPlanId,
    billingMonth,
    reading: value,
    units: null,
    meterChange: null,
    recordedAt: `${billingMonth.slice(0, 7)}-28T10:00:00.000Z`,
  };
}

function price(month: string): PlanPriceChange {
  return {
    id: `price-${month}`,
    planId: "p-meter",
    fromMonth: month,
    price: 40000,
    currencyId: "cur-lbp",
    durationMonths: 1,
    isCustomPrice: false,
    fixedFee: 685000,
    createdAt: `${month.slice(0, 7)}-25T10:00:00.000Z`,
  };
}

const meterLine = (id: string, customerId: string) =>
  line({
    id,
    customerId,
    planId: "p-meter",
    plan: meterPlan,
    startDate: "2026-06-10",
    startReading: 1000,
  });

beforeEach(() => freezeToday(2026, 10, 15));
afterEach(unfreeze);

describe("the dashboard's this-month bar", () => {
  const fixedCustomer = customer({
    id: "c-fixed",
    customerPlans: [line({ id: "l-fixed", customerId: "c-fixed", planId: "p-fixed", plan: fixedPlan, startDate: "2026-01-01" })],
  });
  const waitingCustomer = customer({
    id: "c-waiting",
    customerPlans: [meterLine("l-waiting", "c-waiting")],
  });
  const billedCustomer = customer({
    id: "c-billed",
    customerPlans: [meterLine("l-billed", "c-billed")],
  });
  const prices = priceHistoryOf({ planChanges: [price(OCT)], lineChanges: [] });
  const lines = [waitingCustomer, billedCustomer].flatMap((c) => c.customerPlans ?? []);
  const usageByLine = usageByLineOf(
    lines,
    [reading("l-billed", SEP, 1300), reading("l-billed", OCT, 1400)],
    prices,
  );
  const customers = [fixedCustomer, waitingCustomer, billedCustomer];

  it("TC-US-01 a meter line waiting for this month's reading is not due this month", () => {
    expect(countThisMonth(customers, new Map(), [], "month_start", usageByLine)).toEqual({
      due: 2,
      unpaid: 2,
    });
  });

  it("TC-US-02 money on this month's worked-out bill takes the customer off unpaid", () => {
    const paid = new Map([
      ["l-billed", [bill(OCT, 4_685_000, { customerId: "c-billed", customerPlanId: "l-billed", amount: 4_685_000 })]],
    ]);
    expect(countThisMonth(customers, paid, [], "month_start", usageByLine)).toEqual({
      due: 2,
      unpaid: 1,
    });
  });

  it("TC-US-03 without meter facts the same line would count as unpaid — the facts matter", () => {
    expect(countThisMonth(customers, new Map(), [], "month_start")).toEqual({
      due: 3,
      unpaid: 3,
    });
  });
});

describe("the server's customer list page", () => {
  const CID = "c-meter";
  const LID = "l-meter";

  const wire: CustomerStatusFactsWire = {
    customers: [[CID, "Nabil", null, null, null, true, true, false, "2026-06-01T08:00:00.000Z", null]],
    lines: [
      [
        LID,
        CID,
        "2026-06-10",
        true,
        [
          [JUNE, 1, JUNE_BILL, JUNE_BILL, null, JUNE_BILL],
          [AUG, 1, 5_000_000, 0, null, 5_000_000],
          [SEP, 1, 3_000_000, 0, null, 2_500_000],
        ],
        [],
        "p-meter",
        null,
        null,
        1000,
      ],
    ],
    debts: [
      [CID, "month", 5_000_000, 0, LBP_RATE, LID, AUG],
      [CID, "month", 3_000_000, 0, LBP_RATE, LID, SEP],
    ],
    plans: [
      ["p-meter", "10A meter", null, false, 1, "cur-lbp", null, "t1", "2026-01-01T00:00:00.000Z", "usage", "reading", "kWh", "Fixed fee", null],
    ],
    currencies: [["cur-lbp", LBP_RATE]],
    planChanges: [JUNE, JULY].map((month) => {
      const p = price(month);
      return [p.id, p.planId, p.fromMonth, p.price, p.currencyId, 1, false, p.createdAt, p.fixedFee];
    }),
    specialPriceChanges: [],
    readings: [
      [LID, JUNE, 1120, null, null, null, null, "2026-06-28T10:00:00.000Z"],
      [LID, JULY, 1250, null, null, null, null, "2026-07-28T10:00:00.000Z"],
    ],
  };

  const page = () =>
    pageCustomerStatuses(readCustomerStatusFacts(wire, "month_start"), {
      search: "",
      filters: toCustomerFilterQuery(DEFAULT_CUSTOMER_FILTERS),
      sort: "name",
      offset: 0,
      limit: 100,
    }).rows[0];

  it("TC-US-04 waiting months are not unpaid; the worked-out and the retyped bill are", () => {
    expect(page().status).toMatchObject({
      status: "unpaid",
      overdue: true,
      unpaidMonths: 2,
    });
  });

  it("TC-US-05 To collect = July's worked-out bill + September's retyped bill, never August's empty one", () => {
    expect(page().toCollectUsd).toBeCloseTo((JULY_BILL + 3_000_000) / LBP_RATE, 6);
  });

  it("TC-US-06 the server badge matches the phone's on the same facts", () => {
    const ln = meterLine(LID, CID);
    const prices = priceHistoryOf({ planChanges: [price(JUNE), price(JULY)], lineChanges: [] });
    const phoneUsage = usageByLineOf(
      [ln],
      [reading(LID, JUNE, 1120), reading(LID, JULY, 1250)],
      prices,
    );
    const phoneBills = [
      bill(JUNE, JUNE_BILL, { customerId: CID, customerPlanId: LID, amount: JUNE_BILL, usage: { previousReading: 1000, reading: 1120, units: 120, unitPrice: 40000, fixedFee: 685000, computedAmount: JUNE_BILL } }),
      bill(AUG, 0, { customerId: CID, customerPlanId: LID, amount: 5_000_000, usage: { previousReading: null, reading: null, units: 0, unitPrice: 0, fixedFee: 0, computedAmount: 5_000_000 } }),
      bill(SEP, 0, { customerId: CID, customerPlanId: LID, amount: 3_000_000, usage: { previousReading: null, reading: null, units: 0, unitPrice: 0, fixedFee: 0, computedAmount: 2_500_000 } }),
    ];
    expect(page().status).toEqual(
      buildCustomerStatus([ln], phoneBills, [], "month_start", phoneUsage),
    );
  });
});

describe("a retyped usage bill whose month waits again", () => {
  const LID = "line-retyped";
  const CID = "cust-retyped";
  const retyped = (month: string) =>
    bill(month, 0, {
      customerId: CID,
      customerPlanId: LID,
      amount: 3_000_000,
      usage: { previousReading: null, reading: null, units: 0, unitPrice: 0, fixedFee: 0, computedAmount: 2_500_000 },
    });
  const statusWith = (month: string) => {
    const ln = meterLine(LID, CID);
    const usage = usageByLineOf([ln], [], priceHistoryOf({ planChanges: [], lineChanges: [] }));
    return buildCustomerStatus([ln], [retyped(month)], [], "month_start", usage);
  };

  it("TC-US-07 turns Overdue one month after its own month ends", () => {
    expect(statusWith(JULY)).toMatchObject({ overdue: true, unpaidMonths: 1 });
  });

  it("TC-US-08 last month's retyped bill is owed but not late yet", () => {
    expect(statusWith(SEP)).toMatchObject({ overdue: false, unpaidMonths: 1 });
  });
});
