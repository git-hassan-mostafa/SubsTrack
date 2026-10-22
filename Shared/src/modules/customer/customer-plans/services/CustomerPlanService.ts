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
import { isStartReadingLocked } from "@shared/modules/customer/customer-payments/utils/usageBill";
import { chargeService } from "@shared/modules/ledger/services/ChargeService";
import { usageOf } from "@shared/modules/admin/plans/utils/mapper";
import {
  canBePrepaid,
  withPrepaidStart,
} from "@shared/modules/customer/customer-plans/utils/prepaidLine";
import {
  currentBillingMonth,
  linePriceChanged,
} from "@shared/modules/customer/customer-plans/utils/priceHistory";

// planId null = a custom line; meter fields only on a line billed by meter reading.
export type LineFields = {
  planId: string | null;
  startDate: string;
  customPrice: number | null;
  customCurrencyId: string | null;
  meterNumber: string | null;
  startReading: number | null;
  prepaid: boolean;
};

export type CustomerPlanInput = LineFields & { customerId: string };

// `id` present = a saved line being kept or edited; absent = a new line.
export type LineDraft = LineFields & { id?: string; priceFrom?: string };

export type RemovedLine = RemoveLineChoice & { id: string };

function fieldsOf(line: LineDraft): LineFields {
  return {
    planId: line.planId,
    startDate: line.startDate,
    customPrice: line.customPrice,
    customCurrencyId: line.customCurrencyId,
    meterNumber: line.meterNumber?.trim() || null,
    startReading: line.startReading,
    prepaid: line.prepaid,
  };
}

function sameLineFields(prev: CustomerPlan, line: LineDraft): boolean {
  const next = fieldsOf(line);
  return (Object.keys(next) as (keyof LineFields)[]).every((key) => prev[key] === next[key]);
}

export function lineRowOf(data: LineFields) {
  return {
    plan_id: data.planId,
    start_date: data.startDate,
    custom_price: data.customPrice,
    custom_currency_id: data.customCurrencyId,
    meter_number: data.meterNumber,
    start_reading: data.startReading,
    prepaid: data.prepaid,
  };
}

class CustomerPlanService {
  async createLine(
    data: CustomerPlanInput,
    tenantId: string,
  ): Promise<CustomerPlan> {
    this.validateDate(data.startDate);
    const row = await repositories().customerPlan.create({
      customer_id: data.customerId,
      tenant_id: tenantId,
      ...lineRowOf(data),
    });
    return mapDbCustomerPlanToCustomerPlan(row);
  }

  async updateLine(
    id: string,
    data: LineFields,
    reactivate = false,
  ): Promise<CustomerPlan> {
    this.validateDate(data.startDate);
    const row = await repositories().customerPlan.update(id, {
      ...lineRowOf(data),
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

  // `lines` is the final list, so removals and reactivations net out in the count.
  async syncLines(
    customerId: string,
    drafts: LineDraft[],
    removed: RemovedLine[],
    reactivated: string[],
    tenantId: string,
    existingLines: CustomerPlan[],
    limits: QuotaPair,
    activeCounts: QuotaPair,
  ): Promise<{ active: CustomerPlan[]; cancelled: CustomerPlan[] }> {
    const lines = drafts.map(withPrepaidStart);
    const existingById = new Map(existingLines.map((l) => [l.id, l]));
    const reactivatedSet = new Set(reactivated);
    billingService.assertQuotas(limits, activeCounts, {
      customers: activeCounts.customers,
      plans: activeCounts.plans - existingLines.length + lines.length,
    });
    await this.assertPaidLinesKept(customerId, lines, existingById);
    this.assertNewLinesValid(lines);
    await this.assertPrepaidPlansAllowed(lines);
    await this.assertStartReadingsKept(lines, existingById);
    await this.assertCancelDatesAllowed(removed, existingById);

    const removals = Promise.all(removed.map((r) => this.deleteLine(r)));

    const upserts = Promise.all(
      lines.map(async (line) => {
        if (!line.id) {
          return this.createLine({ customerId, ...fieldsOf(line) }, tenantId);
        }
        const reactivate = reactivatedSet.has(line.id);
        const prev = existingById.get(line.id);
        if (!reactivate && prev && sameLineFields(prev, line)) {
          return prev;
        }
        if (prev && linePriceChanged(prev, line)) {
          await priceHistoryService.recordLineChange(
            prev,
            line,
            line.priceFrom ?? currentBillingMonth(),
          );
        }
        return this.updateLine(line.id, fieldsOf(line), reactivate);
      }),
    );

    const [active, removalResults] = await Promise.all([upserts, removals]);
    const cancelled = removalResults.filter(
      (r): r is CustomerPlan => r !== null,
    );
    return { active, cancelled };
  }

  // The checks a line passes before any row exists; the form and the import share them.
  assertNewLinesValid(lines: LineFields[]): void {
    for (const line of lines) this.validateDate(line.startDate);
    this.assertCustomPricesAllowed(lines);
    this.assertStartReadingsAllowed(lines);
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

  async getStartPaidLineIds(
    lines: Pick<CustomerPlan, "id" | "startDate">[],
  ): Promise<string[]> {
    if (lines.length === 0) return [];
    const bills = await chargeService.getMonthBillsForLines(lines.map((l) => l.id));
    return lines
      .filter((l) => isStartReadingLocked(l.startDate, paidBillingMonths(bills.get(l.id) ?? [])))
      .map((l) => l.id);
  }

  // A paid line keeps its plan, start date and prepaid switch; change = a new line.
  private async assertPaidLinesKept(
    customerId: string,
    lines: LineDraft[],
    existingById: Map<string, CustomerPlan>,
  ): Promise<void> {
    const moved = lines.flatMap((line) => {
      const prev = line.id ? existingById.get(line.id) : undefined;
      if (!prev) return [];
      const planMoved = prev.planId !== line.planId;
      const prepaidMoved = prev.prepaid !== line.prepaid;
      return planMoved || prepaidMoved || prev.startDate !== line.startDate
        ? [{ id: prev.id, planMoved, prepaidMoved }]
        : [];
    });
    if (moved.length === 0) return;
    const locked = new Set(await repositories().customerPlan.findPaidLineIds(customerId));
    const paid = moved.filter((m) => locked.has(m.id));
    if (paid.some((m) => m.planMoved)) {
      throw new Error(i18n.t("errors.plan_locked_paid"));
    }
    if (paid.some((m) => m.prepaidMoved)) {
      throw new Error(i18n.t("errors.prepaid_locked_paid"));
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

  private async assertStartReadingsKept(
    lines: LineDraft[],
    existingById: Map<string, CustomerPlan>,
  ): Promise<void> {
    const changed = lines.flatMap((line) => {
      const prev = line.id ? existingById.get(line.id) : undefined;
      return prev && prev.startReading !== line.startReading ? [prev] : [];
    });
    if ((await this.getStartPaidLineIds(changed)).length > 0) {
      throw new Error(i18n.t("errors.start_reading_locked_paid"));
    }
  }

  private async assertPrepaidPlansAllowed(lines: LineDraft[]): Promise<void> {
    const planIds = new Set(lines.flatMap((l) => (l.prepaid && l.planId ? [l.planId] : [])));
    if (planIds.size === 0) return;
    const plans = (await repositories().plan.findAll()).filter((p) => planIds.has(p.id));
    if (plans.some((p) => !canBePrepaid(usageOf(p)))) {
      throw new Error(i18n.t("errors.prepaid_usage_plan"));
    }
  }

  private assertStartReadingsAllowed(lines: LineDraft[]): void {
    if (lines.some((l) => l.startReading !== null && !(l.startReading >= 0))) {
      throw new Error(i18n.t("errors.start_reading_not_negative"));
    }
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
