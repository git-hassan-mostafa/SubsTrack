import { numberOrNull } from "@shared/core/utils/numberOrNull";
import { Plan, PlanUsage } from "@shared/core/types";
import { DbPlan } from "@shared/core/types/db";

export function usageOf(
  db: Pick<
    DbPlan,
    "billing_type" | "usage_entry" | "unit_name" | "fee_name" | "high_usage_percent"
  >,
): PlanUsage | null {
  if (db.billing_type !== "usage") return null;
  return {
    entry: db.usage_entry === "direct" ? "direct" : "reading",
    unitName: db.unit_name ?? "",
    feeName: db.fee_name ?? "",
    highUsagePercent: numberOrNull(db.high_usage_percent),
  };
}

export function mapDbPlanToPlan(db: DbPlan): Plan {
  return {
    id: db.id,
    name: db.name,
    price: numberOrNull(db.price),
    isCustomPrice: db.is_custom_price,
    durationMonths: db.duration_months,
    currencyId: db.currency_id,
    branchId: db.branch_id,
    tenantId: db.tenant_id,
    createdAt: db.created_at,
    usage: usageOf(db),
  };
}

// The plan's usage settings as columns; a fixed plan clears all of them.
export function planUsageColumns(usage: PlanUsage | null) {
  return {
    billing_type: usage ? ("usage" as const) : ("fixed" as const),
    usage_entry: usage?.entry ?? null,
    unit_name: usage?.unitName.trim() || null,
    fee_name: usage?.feeName.trim() || null,
    high_usage_percent: usage?.highUsagePercent ?? null,
  };
}
