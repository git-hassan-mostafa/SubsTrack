import type { CustomerStatus } from "@shared/core/types";
import { onCalendarDay } from "@shared/core/utils/date";
import { buildCustomerStatus } from "@shared/modules/customer/customer-payments/utils/monthStatus";
import {
  prepaidLabel,
  prepaidPillLabel,
  prepaidTextParts,
} from "@shared/modules/customer/customer-payments/utils/prepaidText";
import { customerFlags } from "@shared/modules/customer/customers/utils/customerFlags";
import {
  DEFAULT_CUSTOMER_FILTERS,
  matchesCustomerFilters,
  toCustomerFilterQuery,
  type PaymentFilter,
} from "@shared/modules/customer/customers/utils/customerFilters";
import { bill, line, plan } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";

// TC-PE-* — a prepaid customer is "Paid until", "Expires in X days" or "Expired X days ago"; never Overdue.
const P = plan({ id: "p1", price: 20, prepaid: true });
const PREPAID = line({ id: "line-1", startDate: "2026-01-01", planId: "p1", plan: P, prepaid: true });
const SECOND = line({ ...PREPAID, id: "line-2" });
const POSTPAID = line({ ...PREPAID, id: "line-post", prepaid: false });

const statusOf = (...bills: Parameters<typeof bill>[]) =>
  buildCustomerStatus([PREPAID], bills.map((args) => bill(...args)), [], "month_start");

const t = ((key: string, values?: object) =>
  values ? `${key} ${JSON.stringify(values)}` : key) as unknown as Parameters<typeof prepaidLabel>[0];

const ANYONE = { active: true, isRegular: true, phoneNumber: null, portalEnabled: false };

function shownUnder(status: CustomerStatus, payment: PaymentFilter): boolean {
  return matchesCustomerFilters(
    ANYONE,
    { status, debtUsd: 0, toCollectUsd: 0, lastPaidAt: null },
    toCustomerFilterQuery({ ...DEFAULT_CUSTOMER_FILTERS, payment: [payment] }),
  );
}

afterEach(unfreeze);

describe("prepaid expiry", () => {
  it("TC-PE-01 paid months ahead → Paid until, with the days left", () => {
    freezeToday(2026, 6, 15);
    expect(statusOf(["2026-06-01", 20], ["2026-08-01", 20]).prepaid).toEqual({
      state: "paid_until",
      paidUntil: "2026-08-31",
      days: 77,
      everyLine: true,
    });
  });

  it("TC-PE-02 three days or less left → expiring; the last paid day still counts", () => {
    freezeToday(2026, 6, 27);
    expect(statusOf(["2026-06-01", 20]).prepaid).toMatchObject({ state: "expiring", days: 3 });
    freezeToday(2026, 6, 30);
    expect(statusOf(["2026-06-01", 20]).prepaid).toMatchObject({ state: "expiring", days: 0 });
    freezeToday(2026, 6, 26);
    expect(statusOf(["2026-06-01", 20]).prepaid).toMatchObject({ state: "paid_until", days: 4 });
  });

  it("TC-PE-03 past the paid-until day → expired, counted from the day after", () => {
    freezeToday(2026, 7, 1);
    expect(statusOf(["2026-06-01", 20]).prepaid).toMatchObject({ state: "expired", days: 0 });
    freezeToday(2026, 7, 15);
    expect(statusOf(["2026-06-01", 20]).prepaid).toMatchObject({ state: "expired", days: 14 });
  });

  it("TC-PE-04 expired owes nothing: never Overdue, never Unpaid", () => {
    freezeToday(2026, 9, 15);
    const status = statusOf(["2026-06-01", 20]);
    expect(status).toMatchObject({ overdue: false, unpaidMonths: 0 });
    expect(customerFlags(status)).toEqual(["expired"]);
  });

  it("TC-PE-05 a part payment and a voided one count like the paid-until date does", () => {
    freezeToday(2026, 6, 15);
    expect(statusOf(["2026-06-01", 5, { amount: 20 }]).prepaid?.paidUntil).toBe("2026-06-30");
    expect(
      statusOf(["2026-05-01", 20], ["2026-06-01", 20, { voidedAt: "2026-06-02T10:00:00Z" }]).prepaid,
    ).toMatchObject({ state: "expired", paidUntil: "2026-05-31", days: 14 });
  });

  it("TC-PE-06 never paid → expired with no date; a line not started yet → nothing", () => {
    freezeToday(2026, 6, 15);
    expect(statusOf().prepaid).toMatchObject({ state: "expired", paidUntil: null });
    const later = line({ ...PREPAID, startDate: "2026-08-01" });
    expect(buildCustomerStatus([later], [], [], "month_start").prepaid).toBeNull();
  });

  it("TC-PE-07 several prepaid lines → the one that runs out first", () => {
    freezeToday(2026, 6, 15);
    const bills = [bill("2026-08-01", 20), bill("2026-06-01", 20, { customerPlanId: "line-2" })];
    expect(buildCustomerStatus([PREPAID, SECOND], bills, [], "month_start").prepaid).toMatchObject({
      paidUntil: "2026-06-30",
    });
    expect(
      buildCustomerStatus([PREPAID, SECOND], bills.slice(0, 1), [], "month_start").prepaid,
    ).toMatchObject({ state: "expired", paidUntil: null });
  });

  it("TC-PE-08 inactive prepaid lines and postpaid-only customers have no expiry", () => {
    freezeToday(2026, 6, 15);
    expect(buildCustomerStatus([{ ...PREPAID, active: false }], [], [], "month_start").prepaid).toBeNull();
    expect(buildCustomerStatus([POSTPAID], [], [], "month_start").prepaid).toBeNull();
  });

  it("TC-PE-09 the server reads expiry on the caller's own day (#173)", () => {
    const status = onCalendarDay("2026-07-02", () => statusOf(["2026-06-01", 20]));
    expect(status.prepaid).toMatchObject({ state: "expired", days: 1 });
  });
});

describe("prepaid pills and filters", () => {
  it("TC-PE-20 an all-prepaid customer shows only the expiry pill", () => {
    freezeToday(2026, 6, 15);
    expect(customerFlags(statusOf(["2026-06-01", 20], ["2026-08-01", 20]))).toEqual(["paid_until"]);
    freezeToday(2026, 6, 29);
    expect(customerFlags(statusOf(["2026-06-01", 20]))).toEqual(["expiring"]);
  });

  it("TC-PE-21 a customer with a postpaid line keeps its own pill beside the expiry", () => {
    freezeToday(2026, 6, 15);
    const paidUp = [1, 2, 3, 4, 5, 6].map((m) =>
      bill(`2026-0${m}-01`, 20, { customerPlanId: "line-post" }),
    );
    const status = buildCustomerStatus([PREPAID, POSTPAID], paidUp, [], "month_start");
    expect(status.prepaid?.everyLine).toBe(false);
    expect(customerFlags(status)).toEqual(["paid", "expired"]);
  });

  it("TC-PE-22 Paid lists paid and expiring prepaid customers; Expired and Not due yet do not mix", () => {
    freezeToday(2026, 6, 29);
    const expiring = statusOf(["2026-06-01", 20]);
    expect(shownUnder(expiring, "paid")).toBe(true);
    expect(shownUnder(expiring, "expiring")).toBe(true);
    expect(shownUnder(expiring, "expired")).toBe(false);

    freezeToday(2026, 7, 10);
    const expired = statusOf(["2026-06-01", 20]);
    expect(expired.status).toBe("not_due_yet");
    expect(shownUnder(expired, "expired")).toBe(true);
    expect(shownUnder(expired, "not_due_yet")).toBe(false);
    expect(shownUnder(expired, "paid")).toBe(false);
    expect(shownUnder(expired, "unpaid")).toBe(false);
    expect(shownUnder(expired, "overdue")).toBe(false);
  });
});

describe("prepaid text", () => {
  it("TC-PE-30 header parts: paid until, then how soon it ends", () => {
    freezeToday(2026, 6, 28);
    const expiry = statusOf(["2026-06-01", 20]).prepaid;
    expect(prepaidLabel(t, prepaidTextParts(expiry))).toBe(
      'payments.paid_until {"date":"30/06/2026"} · payments.expires_in {"count":2}',
    );
    expect(prepaidLabel(t, prepaidTextParts(null), "portal")).toBe("portal.no_payment_yet");
  });

  it("TC-PE-31 the pill keeps only the last part", () => {
    freezeToday(2026, 6, 30);
    expect(prepaidPillLabel(t, statusOf(["2026-06-01", 20]).prepaid!)).toBe("payments.expires_today");
    freezeToday(2026, 7, 1);
    expect(prepaidPillLabel(t, statusOf(["2026-06-01", 20]).prepaid!)).toBe("payments.expired_today");
    freezeToday(2026, 7, 6);
    expect(prepaidPillLabel(t, statusOf(["2026-06-01", 20]).prepaid!)).toBe(
      'payments.expired_ago {"count":5}',
    );
    freezeToday(2026, 6, 10);
    expect(prepaidPillLabel(t, statusOf(["2026-06-01", 20]).prepaid!)).toBe(
      'payments.paid_until {"date":"30/06/2026"}',
    );
    expect(prepaidPillLabel(t, statusOf().prepaid!)).toBe("payments.no_payment_yet");
  });
});
