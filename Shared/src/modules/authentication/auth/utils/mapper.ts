import { AuthUser } from "@shared/core/types";
import type { DbTenant, DbUser } from "@shared/core/types/db";
import { mapDbBranchToBranch } from "@shared/modules/admin/branches/utils/mapper";
import { mapDbTenantToTenant } from "@shared/modules/admin/billing/utils/mapper";

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
