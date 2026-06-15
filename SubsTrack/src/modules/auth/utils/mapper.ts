import { AuthUser } from "@/src/core/types";
import type { DbTenant, DbUser } from "@/src/core/types/db";
import { mapDbBranchToBranch } from "@/src/modules/branches";
import { mapDbTenantToTenant } from "@/src/modules/subscription";

export function mapDbUserToAuthUser(db: DbUser, tenant: DbTenant): AuthUser {
    return {
        id: db.id,
        username: db.username,
        fullName: db.full_name,
        role: db.role,
        active: db.active,
        tenantId: db.tenant_id,
        tenant: mapDbTenantToTenant(tenant),
        branchId: db.branch_id,
        branch: db.branches ? mapDbBranchToBranch(db.branches) : null,
    };
}