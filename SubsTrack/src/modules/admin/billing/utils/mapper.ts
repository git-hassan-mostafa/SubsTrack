import { CustomerRequest, Tenant } from "@/src/core/types";
import { DbCustomerRequest, DbTenant } from "@/src/core/types/db";

export function mapDbTenantToTenant(db: DbTenant): Tenant {
    return {
        id: db.id,
        name: db.name,
        tenantCode: db.tenant_code,
        active: db.active,
        customerAllowance: Number(db.customer_allowance),
        planAllowance: Number(db.plan_allowance),
        pricePerPlanUsd: Number(db.price_per_plan_usd),
        createdAt: db.created_at,
    };
}

export function mapDbCustomerRequestToCustomerRequest(db: DbCustomerRequest): CustomerRequest {
    return {
        id: db.id,
        tenantId: db.tenant_id,
        requestedCount: db.requested_count,
        grantedCount: db.granted_count,
        requestedPlans: db.requested_plans ?? 0,
        grantedPlans: db.granted_plans,
        status: db.status,
        requestedBy: db.requested_by,
        decidedAt: db.decided_at,
        createdAt: db.created_at,
    };
}
