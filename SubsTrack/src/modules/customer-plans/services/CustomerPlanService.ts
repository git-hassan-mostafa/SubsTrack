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

  // Removes a line: hard-delete when it has no payments, else soft-cancel so the
  // payment history is never lost (rule #7 — no hard deletes of paid records).
  async deleteLine(id: string): Promise<void> {
    const paymentCount = await repository.countPayments(id);
    if (paymentCount === 0) await repository.delete(id);
    else await repository.cancel(id);
  }

  // Applies the customer form's inline Plans editor in one pass: remove deleted
  // lines, then create/update the rest. Used by both create and edit flows.
  async syncLines(
    customerId: string,
    lines: LineDraft[],
    removedIds: string[],
    tenantId: string,
  ): Promise<void> {
    for (const id of removedIds) {
      await this.deleteLine(id);
    }
    for (const line of lines) {
      if (line.id) {
        await this.updateLine(line.id, { planId: line.planId, startDate: line.startDate });
      } else {
        await this.createLine(
          { customerId, planId: line.planId, startDate: line.startDate },
          tenantId,
        );
      }
    }
  }

  private validateDate(startDate: string): void {
    if (!startDate || !isValidDateString(startDate)) {
      throw new Error(i18n.t("errors.start_date_format"));
    }
  }
}

export default new CustomerPlanService()
