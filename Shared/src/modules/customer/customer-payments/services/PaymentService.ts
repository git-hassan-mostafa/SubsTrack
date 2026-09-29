import type {
  CustomerPlan,
  MonthBill,
  SkippedMonth,
  UnpaidStartRule,
} from "@shared/core/types";
import { DEFAULT_UNPAID_START_RULE } from "@shared/modules/admin/tenant-settings/utils/constants";
import i18n from "@shared/core/i18n";
import {
  billingMonthLabel,
  blockingPaidMonths,
  blockingUnpaidMonths,
  coveredBillingMonths,
  latestTargetYear,
} from "@shared/modules/customer/customer-payments/utils/payOrder";
import {
  paidBillingMonths,
  uncoveredBillingMonths,
} from "@shared/modules/customer/customer-payments/utils/monthStatus";

// Pay oldest-first, void newest-first; month status itself lives in monthStatus.
class PaymentService {
  voidOrderBlocker(
    targetMonths: string[],
    lineBills: MonthBill[],
  ): string | null {
    return (
      blockingPaidMonths(paidBillingMonths(lineBills), targetMonths)[0] ?? null
    );
  }

  billVoidOrderBlocker(bill: MonthBill, lineBills: MonthBill[]): string | null {
    if (!bill.charge.billingMonth) return null;
    return this.voidOrderBlocker(
      coveredBillingMonths(
        bill.charge.billingMonth,
        bill.charge.durationMonths,
      ),
      lineBills,
    );
  }

  assertVoidableInOrder(targetMonths: string[], lineBills: MonthBill[]): void {
    const blocking = this.voidOrderBlocker(targetMonths, lineBills);
    if (blocking) {
      throw new Error(
        i18n.t("errors.later_month_paid", {
          month: billingMonthLabel(blocking),
        }),
      );
    }
  }

  assertUnskippableInOrder(
    targetMonths: string[],
    lineBills: MonthBill[],
  ): void {
    const blocking = blockingPaidMonths(
      paidBillingMonths(lineBills),
      targetMonths,
    );
    if (blocking.length > 0) {
      throw new Error(
        i18n.t("errors.later_month_paid_unskip", {
          month: billingMonthLabel(blocking[0]),
        }),
      );
    }
  }

  assertPayableInOrder(
    line: CustomerPlan,
    targetMonths: string[],
    lineBills: MonthBill[],
    lineSkips: SkippedMonth[],
    unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
  ): void {
    const blocking = blockingUnpaidMonths(
      uncoveredBillingMonths(
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
        i18n.t("errors.earlier_month_unpaid", {
          month: billingMonthLabel(blocking[0]),
        }),
      );
    }
  }
}

export default new PaymentService();
