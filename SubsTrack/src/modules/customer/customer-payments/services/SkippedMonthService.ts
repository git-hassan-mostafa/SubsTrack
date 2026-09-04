import type { SkippedMonth } from "@/src/core/types";
import i18n from "@/src/core/i18n";
import repository from "../repository/SkippedMonthRepository";
import { mapDbSkippedMonthToSkippedMonth } from "../utils/mapper";

// One month of one service line to skip / unskip. `note` is optional and is
// carried through on unskip too, so the reason stays readable in history.
export interface SetSkipInput {
  customerId: string;
  customerPlanId: string;
  billingMonth: string;
  note: string | null;
}

/**
 * Skipped months — the "nothing is expected here" mark on a service line's
 * month. Deliberately knows nothing about payments: `paid` outranks `skipped`
 * in buildMonthGrid, so a skip left on a month that later gets paid is inert.
 */
class SkippedMonthService {
  async getSkipsForCustomer(customerId: string): Promise<SkippedMonth[]> {
    const rows = await repository.findActiveByCustomer(customerId);
    return rows.map(mapDbSkippedMonthToSkippedMonth);
  }

  async getActiveSkips(): Promise<SkippedMonth[]> {
    const rows = await repository.findActive();
    return rows.map(mapDbSkippedMonthToSkippedMonth);
  }

  async setSkipped(
    inputs: SetSkipInput[],
    skipped: boolean,
    tenantId: string,
    skippedByUserId: string | null,
  ): Promise<SkippedMonth[]> {
    if (inputs.length === 0) return [];
    for (const input of inputs) {
      if (!input.billingMonth.endsWith("-01")) {
        throw new Error(i18n.t("errors.billing_month_format"));
      }
    }
    const rows = await repository.upsertMany(
      inputs.map((input) => ({
        tenant_id: tenantId,
        customer_id: input.customerId,
        customer_plan_id: input.customerPlanId,
        billing_month: input.billingMonth,
        skipped,
        note: input.note?.trim() || null,
        skipped_by_user_id: skippedByUserId,
      })),
    );
    return rows.map(mapDbSkippedMonthToSkippedMonth);
  }
}

export default new SkippedMonthService();
