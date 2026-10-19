import { numberOrNull } from "@shared/core/utils/numberOrNull";
import type { DbSkippedMonth, DbUsageReading } from "@shared/core/types/db";
import type { SkippedMonth, UsageReading } from "@shared/core/types";

export function mapDbUsageReading(db: DbUsageReading): UsageReading {
  const replaced = db.old_meter_final != null && db.new_meter_start != null;
  return {
    id: db.id,
    tenantId: db.tenant_id,
    customerId: db.customer_id,
    customerPlanId: db.customer_plan_id,
    billingMonth: db.billing_month.slice(0, 10),
    reading: numberOrNull(db.reading),
    units: numberOrNull(db.units),
    meterChange: replaced
      ? {
          oldMeterFinal: Number(db.old_meter_final),
          newMeterStart: Number(db.new_meter_start),
          newMeterNumber: db.new_meter_number,
        }
      : null,
    recordedByUserId: db.recorded_by_user_id,
    recordedAt: db.recorded_at,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

// A skipped month carries no money, so it survived the ledger rewrite untouched
// — the payment mapper that used to sit beside it now lives in `ledger/utils`.
export function mapDbSkippedMonthToSkippedMonth(
  db: DbSkippedMonth,
): SkippedMonth {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    customerId: db.customer_id,
    customerPlanId: db.customer_plan_id,
    billingMonth: db.billing_month,
    skipped: db.skipped,
    note: db.note,
    skippedByUserId: db.skipped_by_user_id,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}
