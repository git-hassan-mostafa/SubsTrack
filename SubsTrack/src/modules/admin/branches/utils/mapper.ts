import type { DbBranch } from '@/src/core/types/db';
import type { Branch } from '@/src/core/types';

export function mapDbBranchToBranch(db: DbBranch): Branch {
    return {
        id: db.id,
        tenantId: db.tenant_id,
        name: db.name,
        active: db.active,
        createdAt: db.created_at,
        updatedAt: db.updated_at,
    };
}