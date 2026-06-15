import { AppUser } from "@/src/core/types";
import { DbUser } from "@/src/core/types/db";

export function mapDbUserToAppUser(db: DbUser): AppUser {
    return {
        id: db.id,
        username: db.username,
        fullName: db.full_name,
        phoneNumber: db.phone_number,
        role: db.role,
        active: db.active,
        tenantId: db.tenant_id,
        branchId: db.branch_id,
        createdAt: db.created_at,
    };
}
