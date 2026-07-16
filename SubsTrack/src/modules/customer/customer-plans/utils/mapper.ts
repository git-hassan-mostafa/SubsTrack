import type { CustomerPlan } from "@/src/core/types";
import type { DbCustomerPlan } from "@/src/core/types/db";
import { mapDbPlanToPlan } from "@/src/modules/admin/plans/utils/mapper";

export function mapDbCustomerPlanToCustomerPlan(db: DbCustomerPlan): CustomerPlan {
  return {
    id: db.id,
    customerId: db.customer_id,
    planId: db.plan_id,
    startDate: db.start_date,
    cancelledAt: db.cancelled_at,
    active: db.active,
    tenantId: db.tenant_id,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    plan: db.plans ? mapDbPlanToPlan(db.plans) : null,
  };
}
