import { Plan } from "@/src/core/types";
import { DbPlan } from "@/src/core/types/db";

export function mapDbPlanToPlan(db: DbPlan): Plan {
    return {
        id: db.id,
        name: db.name,
        price: db.price != null ? Number(db.price) : null,
        isCustomPrice: db.is_custom_price,
        durationMonths: db.duration_months,
        currencyId: db.currency_id,
        branchId: db.branch_id,
        tenantId: db.tenant_id,
        createdAt: db.created_at,
    };
}
