import type { DbSkippedMonth } from "@/src/core/types/db";
import type { SkippedMonth } from "@/src/core/types";

// A skipped month carries no money, so it survived the ledger rewrite untouched
// — the payment mapper that used to sit beside it now lives in `ledger/utils`.
export function mapDbSkippedMonthToSkippedMonth(db: DbSkippedMonth): SkippedMonth {
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
