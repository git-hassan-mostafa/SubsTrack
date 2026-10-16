import type { DbUsageReading } from "@shared/core/types/db";
import type { IUsageReadingRepository } from "@shared/modules/customer/customer-payments/repository/IUsageReadingRepository";

// In-memory usage readings, one row per (line, month) like the real natural key.
export const readingStore = {
  rows: [] as DbUsageReading[],
  reset() {
    this.rows = [];
  },
};

let nextId = 0;

export const fakeUsageReadingRepository: IUsageReadingRepository = {
  async findForLines(customerPlanIds) {
    return readingStore.rows.filter(
      (r) => r.voided_at === null && customerPlanIds.includes(r.customer_plan_id),
    );
  },
  async save(payload) {
    const now = new Date().toISOString();
    const i = readingStore.rows.findIndex(
      (r) =>
        r.customer_plan_id === payload.customer_plan_id &&
        r.billing_month === payload.billing_month,
    );
    const held = i === -1 ? null : readingStore.rows[i];
    const row: DbUsageReading = {
      ...payload,
      id: held?.id ?? `reading-${++nextId}`,
      voided_at: null,
      voided_by: null,
      created_at: held?.created_at ?? now,
      updated_at: now,
    };
    if (i === -1) readingStore.rows.push(row);
    else readingStore.rows[i] = row;
    return row;
  },
  async remove(id, voidedBy) {
    const row = readingStore.rows.find((r) => r.id === id && r.voided_at === null);
    if (!row) throw new Error("This reading was not found.");
    row.voided_at = new Date().toISOString();
    row.voided_by = voidedBy;
    return row;
  },
};
