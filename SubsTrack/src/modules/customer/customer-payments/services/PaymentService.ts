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
  coveredBillingMonths,
  latestTargetYear,
} from "../utils/payOrder";

class PaymentService {
  voidOrderBlocker(targetMonths: string[], lineBills: MonthBill[]): string | null {
    return blockingPaidMonths(this.paidBillingMonths(lineBills), targetMonths)[0] ?? null;
  }

  billVoidOrderBlocker(bill: MonthBill, lineBills: MonthBill[]): string | null {
    if (!bill.charge.billingMonth) return null;
    return this.voidOrderBlocker(
      coveredBillingMonths(bill.charge.billingMonth, bill.charge.durationMonths),
      lineBills,
    );
  }

  assertVoidableInOrder(targetMonths: string[], lineBills: MonthBill[]): void {
    const blocking = this.voidOrderBlocker(targetMonths, lineBills);
    if (blocking) {
      throw new Error(i18n.t("errors.later_month_paid", { month: billingMonthLabel(blocking) }));
    }
  }

  assertUnskippableInOrder(targetMonths: string[], lineBills: MonthBill[]): void {
    const blocking = blockingPaidMonths(this.paidBillingMonths(lineBills), targetMonths);
    if (blocking.length > 0) {
      throw new Error(
        i18n.t("errors.later_month_paid_unskip", { month: billingMonthLabel(blocking[0]) }),
      );
    }
  }

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
    let dueThisMonth = 0;
    let inPlay = 0;
    let settled = 0;

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

  uncoveredBillingMonths(
    line: CustomerPlan,
    lineBills: MonthBill[],
    lineSkips: SkippedMonth[],
    unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
    throughYear?: number,
  ): string[] {
    const { year: currentYear } = getCurrentYearMonth();
    const covered = this.paidBillingMonths(lineBills);
    const lastCovered = covered.length > 0 ? covered[covered.length - 1] : null;
    const endYear = Math.max(
      currentYear,
      lastCovered ? Number(lastCovered.slice(0, 4)) : currentYear,
      throughYear ?? currentYear,
    );

    const months: string[] = [];
    for (let year = new Date(line.startDate).getFullYear(); year <= endYear; year++) {
      for (const entry of this.buildMonthGrid(line, lineBills, lineSkips, year, unpaidRule)) {
        if (entry.status === "unpaid" || entry.status === "future") {
          months.push(entry.billingMonth);
        }
      }
    }
    return months;
  }

  paidBillingMonths(lineBills: MonthBill[]): string[] {
    return [...buildCoverageSet(lineBills)].sort();
  }

  assertPayableInOrder(
    line: CustomerPlan,
    targetMonths: string[],
    lineBills: MonthBill[],
    lineSkips: SkippedMonth[],
    unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
  ): void {
    const blocking = blockingUnpaidMonths(
      this.uncoveredBillingMonths(
        line,
        lineBills,
        lineSkips,
        unpaidRule,
        latestTargetYear(targetMonths),
      ),
      targetMonths,
    );
    if (blocking.length > 0) {
      throw new Error(
        i18n.t("errors.earlier_month_unpaid", { month: billingMonthLabel(blocking[0]) }),
      );
    }
  }

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

    const coverageMap = new Map<string, { bill: MonthBill; isGroupSecondary: boolean }>();
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
