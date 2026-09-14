import { CustomerRequest, Tenant } from "@/src/core/types";
import { DbCustomerRequest, DbTenant } from "@/src/core/types/db";

export function mapDbTenantToTenant(db: DbTenant): Tenant {
    return {
        id: db.id,
        name: db.name,
        tenantCode: db.tenant_code,
        active: db.active,
        customerAllowance: Number(db.customer_allowance),
        pricePerCustomerUsd: Number(db.price_per_customer_usd),
        createdAt: db.created_at,
    };
}

export function mapDbCustomerRequestToCustomerRequest(db: DbCustomerRequest): CustomerRequest {
    return {
        id: db.id,
        tenantId: db.tenant_id,
        requestedCount: db.requested_count,
        grantedCount: db.granted_count,
        status: db.status,
        requestedBy: db.requested_by,
        decidedAt: db.decided_at,
        createdAt: db.created_at,
    };
}
