import type { CustomerPlan } from "@/src/core/types";
import { isValidDateString } from "@/src/core/utils/date";
import i18n from "@/src/core/i18n";
import repository from "../repository/CustomerPlanRepository";
import { mapDbCustomerPlanToCustomerPlan } from "../utils/mapper";

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
};

// A line the user removed in the form. `hardDelete` = permanently delete the
// line and all its payments (checkbox on); false = soft-cancel and keep it.
export type RemovedLine = {
  id: string;
  hardDelete: boolean;
};

class CustomerPlanService {
  async createLine(data: CustomerPlanInput, tenantId: string): Promise<CustomerPlan> {
    this.validateDate(data.startDate);
    const row = await repository.create({
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
    const row = await repository.update(id, {
      plan_id: data.planId,
      start_date: data.startDate,
      custom_price: data.customPrice,
      custom_currency_id: data.customCurrencyId,
      ...(reactivate ? { active: true, cancelled_at: null } : {}),
    });
    return mapDbCustomerPlanToCustomerPlan(row);
  }

  async deleteLine(id: string, hardDelete = false): Promise<CustomerPlan | null> {
    const paymentCount = await repository.countPayments(id);
    if (hardDelete || paymentCount === 0) {
      await repository.delete(id);
      return null;
    }
    const row = await repository.cancel(id);
    return mapDbCustomerPlanToCustomerPlan(row);
  }

  async syncLines(
    customerId: string,
    lines: LineDraft[],
    removed: RemovedLine[],
    reactivated: string[],
    tenantId: string,
    existingLines: CustomerPlan[] = [],
  ): Promise<{ active: CustomerPlan[]; cancelled: CustomerPlan[] }> {
    const existingById = new Map(existingLines.map((l) => [l.id, l]));
    const reactivatedSet = new Set(reactivated);
    await this.assertStartDatesUnlocked(customerId, lines, existingById);
    this.assertCustomPricesAllowed(lines);

    const removals = Promise.all(
      removed.map((r) => this.deleteLine(r.id, r.hardDelete)),
    );

    const upserts = Promise.all(
      lines.map((line) => {
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
          return Promise.resolve(prev);
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
    return (await repository.countPayments(id)) > 0;
  }

  async getPaidLineIds(customerId: string): Promise<string[]> {
    return repository.findPaidLineIds(customerId);
  }

  private async assertStartDatesUnlocked(
    customerId: string,
    lines: LineDraft[],
    existingById: Map<string, CustomerPlan>,
  ): Promise<void> {
    const moved = lines.filter((l) => {
      const prev = l.id ? existingById.get(l.id) : undefined;
      return prev != null && prev.startDate !== l.startDate;
    });
    if (moved.length === 0) return;
    const locked = new Set(await repository.findPaidLineIds(customerId));
    if (moved.some((l) => l.id && locked.has(l.id))) {
      throw new Error(i18n.t("errors.start_date_locked_paid"));
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

export default new CustomerPlanService()
