import { repositories } from "@shared/core/runtime/repositories";
import type { CustomerPlan } from "@shared/core/types";
import {
  dayToInstantIso,
  getTodayDateString,
  isValidDateString,
} from "@shared/core/utils/date";
import i18n from "@shared/core/i18n";
import billingService from "@shared/modules/admin/billing/services/BillingService";
import type { QuotaPair } from "@shared/modules/admin/billing/utils/types";
import { mapDbCustomerPlanToCustomerPlan } from "@shared/modules/customer/customer-plans/utils/mapper";
import { priceHistoryService } from "@shared/modules/customer/customer-plans/services/PriceHistoryService";
import {
  cancelDateBounds,
  isCancelDateAllowed,
  type RemoveLineChoice,
} from "@shared/modules/customer/customer-plans/utils/cancelDate";
import { paidBillingMonths } from "@shared/modules/customer/customer-payments/utils/monthStatus";
import { chargeService } from "@shared/modules/ledger/services/ChargeService";
import {
  currentBillingMonth,
  linePriceChanged,
} from "@shared/modules/customer/customer-plans/utils/priceHistory";

// A new / edited service line. planId null = custom/occasional line (ad-hoc
// amounts, no fixed plan).
export type CustomerPlanInput = {
  customerId: string;
  planId: string | null;
  startDate: string;
  customPrice: number | null;
  customCurrencyId: string | null;
};

// One row in the customer form's inline Plans editor. `id` present = an existing
// line being kept/edited; absent = a new line to create.
export type LineDraft = {
  id?: string;
  planId: string | null;
  startDate: string;
  customPrice: number | null;
  customCurrencyId: string | null;
  priceFrom?: string;
};

export type RemovedLine = RemoveLineChoice & { id: string };

class CustomerPlanService {
  async createLine(
    data: CustomerPlanInput,
    tenantId: string,
  ): Promise<CustomerPlan> {
    this.validateDate(data.startDate);
    const row = await repositories().customerPlan.create({
      customer_id: data.customerId,
      plan_id: data.planId,
      start_date: data.startDate,
      custom_price: data.customPrice,
      custom_currency_id: data.customCurrencyId,
      tenant_id: tenantId,
    });
    return mapDbCustomerPlanToCustomerPlan(row);
  }

  async updateLine(
    id: string,
    data: {
      planId: string | null;
      startDate: string;
      customPrice: number | null;
      customCurrencyId: string | null;
    },
    reactivate = false,
  ): Promise<CustomerPlan> {
    this.validateDate(data.startDate);
    const row = await repositories().customerPlan.update(id, {
      plan_id: data.planId,
      start_date: data.startDate,
      custom_price: data.customPrice,
      custom_currency_id: data.customCurrencyId,
      ...(reactivate ? { active: true, cancelled_at: null } : {}),
    });
    return mapDbCustomerPlanToCustomerPlan(row);
  }

  async deleteLine(removed: RemovedLine): Promise<CustomerPlan | null> {
    const paymentCount = await repositories().customerPlan.countPayments(removed.id);
    if (removed.hardDelete || paymentCount === 0) {
      await repositories().customerPlan.delete(removed.id);
      return null;
    }
    const row = await repositories().customerPlan.cancel(
      removed.id,
      dayToInstantIso(removed.cancelDate),
    );
    return mapDbCustomerPlanToCustomerPlan(row);
  }

  async countActive(): Promise<number> {
    return repositories().customerPlan.countActive();
  }

  // `lines` is the final list, so removals and reactivations net out against
  // this customer's own share of the tenant-wide count.
  async syncLines(
    customerId: string,
    lines: LineDraft[],
    removed: RemovedLine[],
    reactivated: string[],
    tenantId: string,
    existingLines: CustomerPlan[],
    limits: QuotaPair,
    activeCounts: QuotaPair,
  ): Promise<{ active: CustomerPlan[]; cancelled: CustomerPlan[] }> {
    const existingById = new Map(existingLines.map((l) => [l.id, l]));
    const reactivatedSet = new Set(reactivated);
    billingService.assertQuotas(limits, activeCounts, {
      customers: activeCounts.customers,
      plans: activeCounts.plans - existingLines.length + lines.length,
    });
    await this.assertPaidLinesKept(customerId, lines, existingById);
    this.assertCustomPricesAllowed(lines);
    await this.assertCancelDatesAllowed(removed, existingById);

    const removals = Promise.all(removed.map((r) => this.deleteLine(r)));

    const upserts = Promise.all(
      lines.map(async (line) => {
        if (!line.id) {
          return this.createLine(
            {
              customerId,
              planId: line.planId,
              startDate: line.startDate,
              customPrice: line.customPrice,
              customCurrencyId: line.customCurrencyId,
            },
            tenantId,
          );
        }
        const reactivate = reactivatedSet.has(line.id);
        const prev = existingById.get(line.id);
        if (
          !reactivate &&
          prev &&
          prev.planId === line.planId &&
          prev.startDate === line.startDate &&
          prev.customPrice === line.customPrice &&
          prev.customCurrencyId === line.customCurrencyId
        ) {
          return prev;
        }
        if (prev && linePriceChanged(prev, line)) {
          await priceHistoryService.recordLineChange(
            prev,
            line,
            line.priceFrom ?? currentBillingMonth(),
          );
        }
        return this.updateLine(
          line.id,
          {
            planId: line.planId,
            startDate: line.startDate,
            customPrice: line.customPrice,
            customCurrencyId: line.customCurrencyId,
          },
          reactivate,
        );
      }),
    );

    const [active, removalResults] = await Promise.all([upserts, removals]);
    const cancelled = removalResults.filter(
      (r): r is CustomerPlan => r !== null,
    );
    return { active, cancelled };
  }

  async hasPayments(id: string): Promise<boolean> {
    return (await repositories().customerPlan.countPayments(id)) > 0;
  }

  async getPaidLineIds(customerId: string): Promise<string[]> {
    return repositories().customerPlan.findPaidLineIds(customerId);
  }

  async getLastPaidMonth(lineId: string): Promise<string | null> {
    const bills = (await chargeService.getMonthBillsForLines([lineId])).get(lineId) ?? [];
    const months = paidBillingMonths(bills);
    return months.length > 0 ? months[months.length - 1] : null;
  }

  // A line money reached keeps its plan and start date; switch = a new line.
  private async assertPaidLinesKept(
    customerId: string,
    lines: LineDraft[],
    existingById: Map<string, CustomerPlan>,
  ): Promise<void> {
    const moved = lines.flatMap((line) => {
      const prev = line.id ? existingById.get(line.id) : undefined;
      if (!prev) return [];
      const planMoved = prev.planId !== line.planId;
      return planMoved || prev.startDate !== line.startDate
        ? [{ id: prev.id, planMoved }]
        : [];
    });
    if (moved.length === 0) return;
    const locked = new Set(await repositories().customerPlan.findPaidLineIds(customerId));
    const paid = moved.filter((m) => locked.has(m.id));
    if (paid.some((m) => m.planMoved)) {
      throw new Error(i18n.t("errors.plan_locked_paid"));
    }
    if (paid.length > 0) {
      throw new Error(i18n.t("errors.start_date_locked_paid"));
    }
  }

  // Paid months read here, never taken from the form.
  private async assertCancelDatesAllowed(
    removed: RemovedLine[],
    existingById: Map<string, CustomerPlan>,
  ): Promise<void> {
    const today = getTodayDateString();
    const checks = await Promise.all(
      removed.map(async (r) => {
        if (r.hardDelete) return true;
        const startDate = existingById.get(r.id)?.startDate ?? today;
        const lastPaid = await this.getLastPaidMonth(r.id);
        const bounds = cancelDateBounds(startDate, lastPaid, today);
        return isCancelDateAllowed(r.cancelDate, bounds);
      }),
    );
    if (checks.includes(false)) throw new Error(i18n.t("errors.cancel_date_range"));
  }

  private assertCustomPricesAllowed(lines: LineDraft[]): void {
    if (lines.some((l) => l.customPrice !== null && !(l.customPrice > 0))) {
      throw new Error(i18n.t("errors.custom_price_positive"));
    }
  }

  private validateDate(startDate: string): void {
    if (!startDate || !isValidDateString(startDate)) {
      throw new Error(i18n.t("errors.start_date_format"));
    }
  }
}

export default new CustomerPlanService();
