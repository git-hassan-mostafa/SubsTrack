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
};

// One row in the customer form's inline Plans editor. `id` present = an existing
// line being kept/edited; absent = a new line to create.
export type LineDraft = {
  id?: string;
  planId: string | null;
  startDate: string;
};

class CustomerPlanService {
  async createLine(data: CustomerPlanInput, tenantId: string): Promise<CustomerPlan> {
    this.validateDate(data.startDate);
    const row = await repository.create({
      customer_id: data.customerId,
      plan_id: data.planId,
      start_date: data.startDate,
      tenant_id: tenantId,
    });
    return mapDbCustomerPlanToCustomerPlan(row);
  }

  async updateLine(
    id: string,
    data: { planId: string | null; startDate: string },
  ): Promise<CustomerPlan> {
    this.validateDate(data.startDate);
    const row = await repository.update(id, {
      plan_id: data.planId,
      start_date: data.startDate,
    });
    return mapDbCustomerPlanToCustomerPlan(row);
  }

  // Removes a line: hard-delete when it has no payments (returns null), else
  // soft-cancel so payment history is never lost (rule #7 — no hard deletes of
  // paid records) and return the cancelled line so callers can keep it visible
  // for history.
  async deleteLine(id: string): Promise<CustomerPlan | null> {
    const paymentCount = await repository.countPayments(id);
    if (paymentCount === 0) {
      await repository.delete(id);
      return null;
    }
    const row = await repository.cancel(id);
    return mapDbCustomerPlanToCustomerPlan(row);
  }

  // Applies the customer form's inline Plans editor in one pass. Removals and
  // create/updates touch independent rows, so they all run concurrently; a kept
  // line whose plan + start date are unchanged is carried over without a DB
  // round-trip. Returns the resulting lines — active rows plus any soft-cancelled
  // removals — so the caller can patch state instead of re-fetching the customer.
  async syncLines(
    customerId: string,
    lines: LineDraft[],
    removedIds: string[],
    tenantId: string,
    existingLines: CustomerPlan[] = [],
  ): Promise<{ active: CustomerPlan[]; cancelled: CustomerPlan[] }> {
    const existingById = new Map(existingLines.map((l) => [l.id, l]));

    const removals = Promise.all(removedIds.map((id) => this.deleteLine(id)));

    const upserts = Promise.all(
      lines.map((line) => {
        if (!line.id) {
          return this.createLine(
            { customerId, planId: line.planId, startDate: line.startDate },
            tenantId,
          );
        }
        const prev = existingById.get(line.id);
        // Unchanged kept line — reuse the loaded row, skip the round-trip.
        if (prev && prev.planId === line.planId && prev.startDate === line.startDate) {
          return Promise.resolve(prev);
        }
        return this.updateLine(line.id, {
          planId: line.planId,
          startDate: line.startDate,
        });
      }),
    );

    const [active, removalResults] = await Promise.all([upserts, removals]);
    const cancelled = removalResults.filter(
      (r): r is CustomerPlan => r !== null,
    );
    return { active, cancelled };
  }

  private validateDate(startDate: string): void {
    if (!startDate || !isValidDateString(startDate)) {
      throw new Error(i18n.t("errors.start_date_format"));
    }
  }
}

export default new CustomerPlanService()
