import type {
  Customer,
  CustomerMonthStatus,
  CustomerPlan,
  CustomerStatus,
  MonthBill,
  MonthEntry,
  MonthStatus,
  SkippedMonth,
  UnpaidStartRule,
} from "@/src/core/types";
import { MONTHS } from "@/src/core/constants";
import { getCurrentYearMonth, toBillingMonth } from "@/src/core/utils/date";
import {
  isBeforeStartDate,
  isNotDueYet,
  isNotLateYet,
} from "../utils/monthDueRules";
import { DEFAULT_UNPAID_START_RULE } from "@/src/modules/admin/tenant-settings/services/TenantSettingService";
import i18n from "@/src/core/i18n";
import {
  billingMonthLabel,
  blockingPaidMonths,
  blockingUnpaidMonths,
} from "../utils/payOrder";

class PaymentService {
  // An unskip is a void of an EXPECTATION, so it follows the void rule: it turns
  // "nothing expected" back into an unpaid month, and may not run while a LATER
  // month of the same line is paid — that would leave a paid month sitting on an
  // unpaid one. Such a month can still be COLLECTED instead (a payment outranks
  // the skip in buildMonthGrid), which is what the grid offers in place of the
  // unskip. Months inside the same write never block each other.
  assertUnskippableInOrder(targetMonths: string[], lineBills: MonthBill[]): void {
    const blocking = blockingPaidMonths(this.paidBillingMonths(lineBills), targetMonths);
    // Only the newest is named — that is the one month standing in the way.
    if (blocking.length > 0) {
      throw new Error(
        i18n.t("errors.later_month_paid_unskip", { month: billingMonthLabel(blocking[0]) }),
      );
    }
  }

  // Builds the complete customer-list status for ONE customer, straight from
  // buildMonthGrid (rule #1) — this is the only place the list's badge data is
  // decided. `payments` / `skips` must be that customer's FULL history (all
  // lines, all years), because every count below looks back to each line's start.
  //
  // A line counts as paid only when it owes NOTHING up to its last required
  // month, so "paid" can never sit next to "overdue" — the two are mutually
  // exclusive by construction, not by display rules (gotcha #56). Only a month
  // that resolved to "paid" or "unpaid" was ever required: before_start, future
  // (incl. a current month the billing-day rule holds back) and skipped all mean
  // "nothing expected", so they are treated as if they did not exist.
  //
  // One walk yields TWO different "behind" facts, and they are not the same set:
  // `overdue` = an earlier month is LATE, while `uncoveredLineIds` = an earlier
  // month has nothing collected. Under 'customer_start_day' last month can be the
  // second without being the first — red, blocking, not yet overdue (#83).
  buildCustomerStatus(
    lines: CustomerPlan[],
    bills: MonthBill[],
    skips: SkippedMonth[],
    unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
  ): CustomerStatus {
    const { year: currentYear, month: currentMonth } = getCurrentYearMonth();
    const notDueLineIds: string[] = [];
    const uncoveredLineIds: string[] = [];
    let overdue = false;
    let anySkipped = false;
    let dueThisMonth = 0; // lines that owe THIS month — decides the "nothing owed" reason
    let inPlay = 0;       // lines that have ever had a required month
    let settled = 0;      // ...of those, the ones owing nothing at all

    for (const line of lines) {
      if (!line.active) continue;
      const lineBills = bills.filter((b) => b.charge.customerPlanId === line.id);
      const lineSkips = skips.filter((s) => s.customerPlanId === line.id);
      const startYear = new Date(line.startDate).getFullYear();

      let current: MonthEntry | null = null;
      let lineOverdue = false;
      let lineUncovered = false;
      let lineRequired = 0;
      let lineUnpaid = 0;
      for (let year = startYear; year <= currentYear; year++) {
        for (const entry of this.buildMonthGrid(line, lineBills, lineSkips, year, unpaidRule)) {
          if (entry.status === "paid" || entry.status === "unpaid") {
            // A partial payment resolves to "paid" (its balance becomes a debt),
            // so a covered month always counts as settled here.
            lineRequired++;
            if (entry.status === "unpaid") lineUnpaid++;
          }
          // This month is kept for the quick-pay decision below; it and the
          // calendar months after it are never "behind".
          if (entry.year === currentYear && entry.month >= currentMonth) {
            if (entry.month === currentMonth) current = entry;
            continue;
          }
          // Only a month strictly BEFORE this one can leave the line behind.
          if (entry.status !== "unpaid") continue;
          // Nothing was collected, so oldest-first bars THIS month from being
          // quick-paid — whether or not the customer reads as overdue yet.
          lineUncovered = true;
          // Last month is not LATE until this month's billing day passes
          // ('customer_start_day', #83). It stays red and still blocks; only the
          // "Overdue" flag waits. Older months are late on sight.
          if (!isNotLateYet(unpaidRule, entry.year, entry.month, line.startDate)) {
            lineOverdue = true;
          }
        }
      }
      if (lineOverdue) overdue = true;
      if (lineUncovered) uncoveredLineIds.push(line.id);
      if (lineRequired > 0) {
        inPlay++;
        if (lineUnpaid === 0) settled++;
      }

      // Quick pay collects THIS month, so what it must skip is decided by the
      // current entry alone. "before_start" (the line starts later) and a
      // missing entry both mean the line is not in play this month.
      if (!current || current.status === "before_start") continue;
      if (current.status === "skipped") {
        anySkipped = true;
        notDueLineIds.push(line.id);
        continue;
      }
      // "future" here can only be the 'customer_start_day' rule holding the
      // CURRENT month back — nothing owed yet. It stays quick-payable (pay
      // early is allowed), so it is NOT added to notDueLineIds; a hole behind it
      // is what uncoveredLineIds catches.
      if (current.status === "future") continue;

      dueThisMonth++;
      if (current.status === "paid") notDueLineIds.push(line.id);
    }

    // settled === inPlay → the customer owes nothing at all (inPlay === 0
    // included: no line has ever been required). When no line owes THIS month
    // either, the reason is what's worth showing: a deliberate skip, or a
    // start date / billing day not reached yet. Never fall back to "unpaid" —
    // an absent fact is not a debt.
    const status: CustomerMonthStatus =
      settled === inPlay
        ? dueThisMonth === 0
          ? anySkipped
            ? "skipped"
            : "not_due_yet"
          : "paid"
        : settled > 0
          ? "mixed"
          : "unpaid";

    return {
      status,
      overdue,
      planCount: { paid: settled, total: inPlay },
      notDueLineIds,
      uncoveredLineIds,
    };
  }

  // The customer list's whole badge dataset, in ONE query pass: every payment
  // and skip is fetched ONCE by the caller (the ledger owns the bills query) and
  // handed in here, so this service stays pure month-rule logic with no data
  // access of its own. Customers absent from the returned map have no status
  // yet — the list must render no payment badge for them rather than guessing.
  getCustomerStatuses(
    customers: Customer[],
    bills: MonthBill[],
    skips: SkippedMonth[],
    unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
  ): Map<string, CustomerStatus> {
    const billsByCustomer = groupBy(bills, (b) => b.charge.customerId ?? '');
    const skipsByCustomer = groupBy(skips, (s) => s.customerId);

    const statuses = new Map<string, CustomerStatus>();
    for (const customer of customers) {
      // Inactive and occasional (non-regular) customers show their own flag
      // instead of a payment one, and quick pay skips them — so there is
      // nothing to compute.
      if (!customer.active || !customer.isRegular) continue;
      statuses.set(
        customer.id,
        this.buildCustomerStatus(
          customer.customerPlans ?? [],
          billsByCustomer.get(customer.id) ?? [],
          skipsByCustomer.get(customer.id) ?? [],
          unpaidRule,
        ),
      );
    }
    return statuses;
  }

  // How many DISTINCT months each customer is behind — the reports' overdue
  // ageing (1 / 2 / 3+ months), which is what decides who gets cut off. Same
  // one-fetch shape as getCustomerStatuses and derived from the same month grid
  // (rule #1), so the buckets can never disagree with the list badges.
  //
  // Distinct months, not a per-line sum: a customer holding three plans that are
  // all one month behind is one month behind, not three.
  //
  // OVERDUE months only (unpaidBillingMonths) — a prepay gap is not a debt.
  getOverdueMonthCounts(
    customers: Customer[],
    bills: MonthBill[],
    skips: SkippedMonth[],
    unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
  ): Map<string, number> {
    const billsByCustomer = groupBy(bills, (b) => b.charge.customerId ?? '');
    const skipsByCustomer = groupBy(skips, (s) => s.customerId);

    const counts = new Map<string, number>();
    for (const customer of customers) {
      if (!customer.active || !customer.isRegular) continue;
      const customerBills = billsByCustomer.get(customer.id) ?? [];
      const skipRows = skipsByCustomer.get(customer.id) ?? [];
      const months = new Set<string>();
      for (const line of customer.customerPlans ?? []) {
        if (!line.active || line.cancelledAt) continue;
        for (const m of this.unpaidBillingMonths(
          line,
          customerBills.filter((b) => b.charge.customerPlanId === line.id),
          skipRows.filter((sk) => sk.customerPlanId === line.id),
          unpaidRule,
        )) {
          months.add(m);
        }
      }
      if (months.size > 0) counts.set(customer.id, months.size);
    }
    return counts;
  }

  // Every month this service line still owes, oldest first, across ALL years
  // from its start to today. Derived from buildMonthGrid (rule #1) because an
  // unpaid month can sit in a year the caller isn't looking at — the panel only
  // holds the viewed year's grid.
  //
  // OVERDUE months only. For the pay-in-order gate use uncoveredBillingMonths,
  // which also counts not-yet-due gaps (see #81b).
  unpaidBillingMonths(
    line: CustomerPlan,
    lineBills: MonthBill[],
    lineSkips: SkippedMonth[],
    unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
  ): string[] {
    const { year: currentYear } = getCurrentYearMonth();
    const months: string[] = [];
    for (let year = new Date(line.startDate).getFullYear(); year <= currentYear; year++) {
      for (const entry of this.buildMonthGrid(line, lineBills, lineSkips, year, unpaidRule)) {
        if (entry.status === "unpaid") months.push(entry.billingMonth);
      }
    }
    return months;
  }

  // Every month this line has NOT covered, oldest first — "unpaid" plus the
  // not-yet-due months a prepay would jump over. This is what the pay-in-order
  // gate compares against: paying ahead is allowed, paying ahead out of ORDER is
  // not, so paying December while September–November sit empty is refused even
  // though none of those three is overdue yet (#81b).
  //
  // The walk runs past the current year up to the line's latest covered month,
  // because a gap is only a gap when something later is paid — that is exactly
  // the row a prepay leaves behind.
  uncoveredBillingMonths(
    line: CustomerPlan,
    lineBills: MonthBill[],
    lineSkips: SkippedMonth[],
    unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
  ): string[] {
    const { year: currentYear } = getCurrentYearMonth();
    const covered = this.paidBillingMonths(lineBills);
    // Nothing is covered beyond today → no prepay to leave a hole behind, so the
    // overdue walk already says everything there is to say.
    const lastCovered = covered.length > 0 ? covered[covered.length - 1] : null;
    const endYear = Math.max(
      currentYear,
      lastCovered ? Number(lastCovered.slice(0, 4)) : currentYear,
    );

    const months: string[] = [];
    for (let year = new Date(line.startDate).getFullYear(); year <= endYear; year++) {
      for (const entry of this.buildMonthGrid(line, lineBills, lineSkips, year, unpaidRule)) {
        // "future" joins "unpaid" here — both mean nothing has been collected.
        // before_start (line hadn't started) and skipped (nothing expected) are
        // not holes, and paid needs nothing.
        if (entry.status === "unpaid" || entry.status === "future") {
          months.push(entry.billingMonth);
        }
      }
    }
    return months;
  }

  // Every month this service line currently has PAID, across all years — a
  // multi-month block counted month by month. Straight from the bills (not the
  // grid), so it is not year-scoped: the void-newest-first gate must see a paid
  // month sitting in a year the caller is not looking at.
  paidBillingMonths(lineBills: MonthBill[]): string[] {
    return [...buildCoverageSet(lineBills)].sort();
  }

  // Months are settled OLDEST FIRST: a write is refused while an earlier month
  // of the same line is still uncovered — overdue OR merely not due yet, so a
  // prepay can't leave a hole behind it. The guard every pay path runs before it
  // writes; `targetMonths` is every month the write would cover, so paying a
  // backlog (or a run of future months) in one batch is allowed.
  assertPayableInOrder(
    line: CustomerPlan,
    targetMonths: string[],
    lineBills: MonthBill[],
    lineSkips: SkippedMonth[],
    unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
  ): void {
    const blocking = blockingUnpaidMonths(
      // Uncovered, not merely overdue — a prepay must not jump a not-yet-due month.
      this.uncoveredBillingMonths(line, lineBills, lineSkips, unpaidRule),
      targetMonths,
    );
    // Only the oldest is named — that is the one month the user must collect next.
    if (blocking.length > 0) {
      throw new Error(
        i18n.t("errors.earlier_month_unpaid", { month: billingMonthLabel(blocking[0]) }),
      );
    }
  }

  // THE single source of truth for month status logic. No other file may reimplement this.
  // Builds the grid for ONE service line: `bills` and `skips` must already be
  // scoped to that line, and `line.startDate` sets the before_start boundary. (A
  // customer with several lines builds one grid per line — see paymentSlice.buildGrids.)
  // `unpaidRule` is the tenant's UnpaidStartRule; it only ever affects the CURRENT
  // month (see the status ladder below).
  buildMonthGrid(
    line: CustomerPlan,
    bills: MonthBill[],
    skips: SkippedMonth[],
    year: number,
    unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
  ): MonthEntry[] {
    const { year: cy, month: cm } = getCurrentYearMonth();

    const skipByMonth = new Map<string, SkippedMonth>();
    for (const skip of skips) {
      if (skip.skipped) skipByMonth.set(skip.billingMonth, skip);
    }

    // Build coverage map: billingMonth → { bill, isSecondary }
    // A multi-month bill covers consecutive months; each covered month points back to it.
    const coverageMap = new Map<string, { bill: MonthBill; isGroupSecondary: boolean }>();
    for (const bill of bills) {
      const { charge } = bill;
      if (!charge.billingMonth) continue;
      const [pYear, pMonthNum] = charge.billingMonth.split("-").map(Number);
      for (let d = 0; d < charge.durationMonths; d++) {
        const date = new Date(pYear, pMonthNum - 1 + d, 1);
        const covYear = date.getFullYear();
        const covMonth = date.getMonth() + 1;
        if (covYear !== year) continue; // only populate months in the requested year
        const bm = toBillingMonth(covYear, covMonth);
        coverageMap.set(bm, { bill, isGroupSecondary: d > 0 });
      }
    }

    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const billingMonth = toBillingMonth(year, month);
      const label = MONTHS[i];
      const coverage = coverageMap.get(billingMonth) ?? null;
      const bill = coverage?.bill ?? null;
      const isGroupSecondary = coverage?.isGroupSecondary ?? false;

      if (isBeforeStartDate(year, month, line.startDate)) {
        return {
          year,
          month,
          label,
          billingMonth,
          status: "before_start" as MonthStatus,
          charge: null,
          collected: 0,
          isGroupSecondary: false,
          balance: 0,
          skip: null,
        };
      }

      // MONEY decides, never the existence of a bill: an empty charge row left
      // behind by a voided collection must read exactly like a month that was
      // never touched at all.
      const collected = bill?.collected ?? 0;
      const isEffectivelyPaid = collected > 0;
      const skip = skipByMonth.get(billingMonth) ?? null;

      let status: MonthStatus;
      if (isEffectivelyPaid) {
        // A partial payment (balance > 0) counts as "paid" — the month looks
        // settled and the remaining amount is surfaced as a debt (never here).
        // The owed amount still rides along on `balance` for drill-in views.
        status = "paid";
      } else if (skip) {
        // Nothing is expected this month. Ranks below "paid" (money always wins)
        // and above future/unpaid, so a skipped month is never overdue and never
        // payable until it is unskipped.
        status = "skipped";
      } else if (year > cy || (year === cy && month > cm)) {
        status = "future";
      } else if (isNotDueYet(unpaidRule, year, month, line.startDate)) {
        // 'customer_start_day' rule: the CURRENT month is not owed until the
        // line's own billing day arrives. Reported as "future" — the month stays
        // fully payable (pay-early is allowed) but counts as nothing owed yet.
        // Past months are always red; what waits for the billing day there is the
        // customer's "Overdue" flag, not the cell (isNotLateYet, #83).
        status = "future";
      } else {
        // Past month, or a current month whose due day has arrived.
        status = "unpaid";
      }

      const balance = isEffectivelyPaid ? (bill!.charge.amount - collected) : 0;

      return {
        year,
        month,
        label,
        billingMonth,
        status,
        charge: bill?.charge ?? null,
        collected,
        isGroupSecondary,
        balance,
        skip: status === "skipped" ? skip : null,
      };
    });
  }
}

export default new PaymentService()

// Buckets rows by a key — used to slice one tenant-wide fetch per customer.
function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(key(row));
    if (list) list.push(row);
    else map.set(key(row), [row]);
  }
  return map;
}

// Billing months already covered, multi-month bundles counted month by month.
// A bill with nothing collected is NOT covered — money decides, never the mere
// existence of a row (an empty bill is what a voided collection leaves behind).
function buildCoverageSet(bills: MonthBill[]): Set<string> {
  const covered = new Set<string>();
  for (const { charge, collected } of bills) {
    if (charge.voidedAt !== null || collected === 0 || !charge.billingMonth) continue;
    const [pYear, pMonthNum] = charge.billingMonth.split("-").map(Number);
    for (let d = 0; d < charge.durationMonths; d++) {
      const date = new Date(pYear, pMonthNum - 1 + d, 1);
      covered.add(toBillingMonth(date.getFullYear(), date.getMonth() + 1));
    }
  }
  return covered;
}
