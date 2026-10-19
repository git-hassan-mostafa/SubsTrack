import type { DbSkippedMonth } from "@shared/core/types/db";
import type { ISkippedMonthRepository } from "@shared/modules/customer/customer-payments/repository/ISkippedMonthRepository";

// In-memory skips, one row per (line, month) like the real natural key.
export const skipStore = {
  rows: [] as DbSkippedMonth[],
  reset() {
    this.rows = [];
  },
};

let nextId = 0;

export const fakeSkippedMonthRepository: ISkippedMonthRepository = {
  async findActiveByCustomer(customerId) {
    return skipStore.rows.filter((r) => r.skipped && r.customer_id === customerId);
  },
  async findActive() {
    return skipStore.rows.filter((r) => r.skipped);
  },
  async upsertMany(payloads) {
    const now = new Date().toISOString();
    return payloads.map((payload) => {
      const i = skipStore.rows.findIndex(
        (r) =>
          r.customer_plan_id === payload.customer_plan_id &&
          r.billing_month === payload.billing_month,
      );
      const held = i === -1 ? null : skipStore.rows[i];
      const row: DbSkippedMonth = {
        ...payload,
        id: held?.id ?? `skip-${++nextId}`,
        created_at: held?.created_at ?? now,
        updated_at: now,
      };
      if (i === -1) skipStore.rows.push(row);
      else skipStore.rows[i] = row;
      return row;
    });
  },
};
