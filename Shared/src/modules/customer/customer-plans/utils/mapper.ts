import type {
  CustomerPlan,
  LinePriceChange,
  PlanPriceChange,
} from "@shared/core/types";
import type {
  DbCustomerPlan,
  DbLinePriceChange,
  DbPlanPriceChange,
} from "@shared/core/types/db";
import { mapDbPlanToPlan } from "@shared/modules/admin/plans/utils/mapper";

export function mapDbCustomerPlanToCustomerPlan(
  db: DbCustomerPlan,
): CustomerPlan {
  return {
    id: db.id,
    customerId: db.customer_id,
    planId: db.plan_id,
    startDate: db.start_date,
    cancelledAt: db.cancelled_at,
    active: db.active,
    customPrice: db.custom_price != null ? Number(db.custom_price) : null,
    customCurrencyId: db.custom_currency_id,
    tenantId: db.tenant_id,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    plan: db.plans ? mapDbPlanToPlan(db.plans) : null,
  };
}

function toMonth(day: string | null): string | null {
  return day ? day.slice(0, 10) : null;
}

export function mapDbPlanPriceChange(db: DbPlanPriceChange): PlanPriceChange {
  return {
    id: db.id,
    planId: db.plan_id,
    fromMonth: toMonth(db.from_month),
    price: db.price != null ? Number(db.price) : null,
    currencyId: db.currency_id,
    durationMonths: db.duration_months,
    isCustomPrice: db.is_custom_price,
    createdAt: db.created_at,
  };
}

export function mapDbLinePriceChange(db: DbLinePriceChange): LinePriceChange {
  return {
    id: db.id,
    customerId: db.customer_id,
    customerPlanId: db.customer_plan_id,
    fromMonth: toMonth(db.from_month),
    planId: db.plan_id,
    customPrice: db.custom_price != null ? Number(db.custom_price) : null,
    customCurrencyId: db.custom_currency_id,
    createdAt: db.created_at,
  };
}
