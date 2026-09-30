import type {
  CustomerMonthStatus,
  CustomerStatus,
  MonthBill,
  MonthCell,
  MonthEntry,
  MonthStatus,
  SkippedMonth,
  StatusBill,
  StatusCharge,
  StatusCustomer,
  StatusLine,
  StatusSkip,
  UnpaidStartRule,
} from "@shared/core/types";
import { MONTHS } from "@shared/core/constants";
import { getCurrentYearMonth, toBillingMonth } from "@shared/core/utils/date";
import { groupBy } from "@shared/core/utils/groupBy";
import {
  isBeforeStartDate,
  isNotDueYet,
  isNotLateYet,
} from "@shared/modules/customer/customer-payments/utils/monthDueRules";
import { DEFAULT_UNPAID_START_RULE } from "@shared/modules/admin/tenant-settings/utils/constants";

// The ONLY place a month's status is decided — see docs/month-grid.md.
export function buildMonthGrid(
  line: StatusLine,
  bills: MonthBill[],
  skips: SkippedMonth[],
  year: number,
  unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
): MonthEntry[] {
  return monthCells(line, bills, skips, year, unpaidRule);
}

// The grid over only the fields it reads, so server facts fit (month-grid.md).
function monthCells<C extends StatusCharge, S extends StatusSkip>(
  line: StatusLine,
  bills: StatusBill<C>[],
  skips: S[],
  year: number,
  unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
): MonthCell<C, S>[] {
  const { year: cy, month: cm } = getCurrentYearMonth();

  const skipByMonth = new Map<string, S>();
  for (const skip of skips) {
    if (skip.skipped) skipByMonth.set(skip.billingMonth, skip);
  }

  const coverageMap = new Map<
    string,
    { bill: StatusBill<C>; isGroupSecondary: boolean }
  >();
  for (const bill of bills) {
    const { charge } = bill;
    if (!charge.billingMonth) continue;
    const [pYear, pMonthNum] = charge.billingMonth.split("-").map(Number);
    for (let d = 0; d < charge.durationMonths; d++) {
      const date = new Date(pYear, pMonthNum - 1 + d, 1);
      const covYear = date.getFullYear();
      const covMonth = date.getMonth() + 1;
      if (covYear !== year) continue;
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

    const collected = bill?.collected ?? 0;
    const isEffectivelyPaid = collected > 0;
    const skip = skipByMonth.get(billingMonth) ?? null;

    let status: MonthStatus;
    if (isEffectivelyPaid) {
      status = "paid";
    } else if (skip) {
      status = "skipped";
    } else if (year > cy || (year === cy && month > cm)) {
      status = "future";
    } else if (isNotDueYet(unpaidRule, year, month, line.startDate)) {
      status = "future";
    } else {
      status = "unpaid";
    }

    const balance = isEffectivelyPaid ? bill!.charge.amount - collected : 0;

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

// The only place a customer list badge is decided; "paid" means owes nothing.
export function buildCustomerStatus(
  lines: StatusLine[],
  bills: StatusBill[],
  skips: StatusSkip[],
  unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
): CustomerStatus {
  const { year: currentYear, month: currentMonth } = getCurrentYearMonth();
  const notDueLineIds: string[] = [];
  const uncoveredLineIds: string[] = [];
  let overdue = false;
  let anySkipped = false;
  let dueThisMonth = 0;
  let inPlay = 0;
  let settled = 0;

  for (const line of lines) {
    if (!line.active) continue;
    const lineBills = bills.filter((b) => b.charge.customerPlanId === line.id);
    const lineSkips = skips.filter((s) => s.customerPlanId === line.id);
    const startYear = new Date(line.startDate).getFullYear();

    let current: MonthCell<StatusCharge, StatusSkip> | null = null;
    let lineOverdue = false;
    let lineUncovered = false;
    let lineRequired = 0;
    let lineUnpaid = 0;
    for (let year = startYear; year <= currentYear; year++) {
      for (const entry of monthCells(
        line,
        lineBills,
        lineSkips,
        year,
        unpaidRule,
      )) {
        if (entry.status === "paid" || entry.status === "unpaid") {
          lineRequired++;
          if (entry.status === "unpaid") lineUnpaid++;
        }
        if (entry.year === currentYear && entry.month >= currentMonth) {
          if (entry.month === currentMonth) current = entry;
          continue;
        }
        if (entry.status !== "unpaid") continue;
        lineUncovered = true;
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

    if (!current || current.status === "before_start") continue;
    if (current.status === "skipped") {
      anySkipped = true;
      notDueLineIds.push(line.id);
      continue;
    }
    if (current.status === "future") continue;

    dueThisMonth++;
    if (current.status === "paid") notDueLineIds.push(line.id);
  }

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

export function getCustomerStatuses(
  customers: StatusCustomer[],
  bills: StatusBill[],
  skips: StatusSkip[],
  unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
): Map<string, CustomerStatus> {
  const billsByCustomer = groupBy(bills, (b) => b.charge.customerId ?? "");
  const skipsByCustomer = groupBy(skips, (s) => s.customerId);

  const statuses = new Map<string, CustomerStatus>();
  for (const customer of customers) {
    if (!customer.active || !customer.isRegular) continue;
    statuses.set(
      customer.id,
      buildCustomerStatus(
        customer.customerPlans ?? [],
        billsByCustomer.get(customer.id) ?? [],
        skipsByCustomer.get(customer.id) ?? [],
        unpaidRule,
      ),
    );
  }
  return statuses;
}

export function getOverdueMonthCounts(
  customers: (StatusCustomer & {
    customerPlans?: (StatusLine & { cancelledAt: string | null })[];
  })[],
  bills: StatusBill[],
  skips: StatusSkip[],
  unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
): Map<string, number> {
  const billsByCustomer = groupBy(bills, (b) => b.charge.customerId ?? "");
  const skipsByCustomer = groupBy(skips, (s) => s.customerId);

  const counts = new Map<string, number>();
  for (const customer of customers) {
    if (!customer.active || !customer.isRegular) continue;
    const customerBills = billsByCustomer.get(customer.id) ?? [];
    const skipRows = skipsByCustomer.get(customer.id) ?? [];
    const months = new Set<string>();
    for (const line of customer.customerPlans ?? []) {
      if (!line.active || line.cancelledAt) continue;
      for (const m of unpaidBillingMonths(
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

// Overdue months only — never the pay-order gate's input (gotcha #81b).
export function unpaidBillingMonths(
  line: StatusLine,
  lineBills: StatusBill[],
  lineSkips: StatusSkip[],
  unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
): string[] {
  const { year: currentYear } = getCurrentYearMonth();
  const months: string[] = [];
  for (
    let year = new Date(line.startDate).getFullYear();
    year <= currentYear;
    year++
  ) {
    for (const entry of monthCells(
      line,
      lineBills,
      lineSkips,
      year,
      unpaidRule,
    )) {
      if (entry.status === "unpaid") months.push(entry.billingMonth);
    }
  }
  return months;
}

// Every month money has not reached yet, future ones too — the pay-order input.
export function uncoveredBillingMonths(
  line: StatusLine,
  lineBills: StatusBill[],
  lineSkips: StatusSkip[],
  unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
  throughYear?: number,
): string[] {
  const { year: currentYear } = getCurrentYearMonth();
  const covered = paidBillingMonths(lineBills);
  const lastCovered = covered.length > 0 ? covered[covered.length - 1] : null;
  const endYear = Math.max(
    currentYear,
    lastCovered ? Number(lastCovered.slice(0, 4)) : currentYear,
    throughYear ?? currentYear,
  );

  const months: string[] = [];
  for (
    let year = new Date(line.startDate).getFullYear();
    year <= endYear;
    year++
  ) {
    for (const entry of monthCells(
      line,
      lineBills,
      lineSkips,
      year,
      unpaidRule,
    )) {
      if (entry.status === "unpaid" || entry.status === "future") {
        months.push(entry.billingMonth);
      }
    }
  }
  return months;
}

export function paidBillingMonths(lineBills: StatusBill[]): string[] {
  return [...buildCoverageSet(lineBills)].sort();
}

// Money decides coverage, never a row existing — an empty bill covers nothing.
function buildCoverageSet(bills: StatusBill[]): Set<string> {
  const covered = new Set<string>();
  for (const { charge, collected } of bills) {
    if (charge.voidedAt !== null || collected === 0 || !charge.billingMonth)
      continue;
    const [pYear, pMonthNum] = charge.billingMonth.split("-").map(Number);
    for (let d = 0; d < charge.durationMonths; d++) {
      const date = new Date(pYear, pMonthNum - 1 + d, 1);
      covered.add(toBillingMonth(date.getFullYear(), date.getMonth() + 1));
    }
  }
  return covered;
}
