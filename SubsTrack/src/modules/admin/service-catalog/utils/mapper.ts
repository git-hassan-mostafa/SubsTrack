import { Service } from "@/src/core/types";
import { DbService } from "@/src/core/types/db";

export function mapDbServiceToService(db: DbService): Service {
    return {
        id: db.id,
        tenantId: db.tenant_id,
        branchId: db.branch_id,
        name: db.name,
        description: db.description,
        price: Number(db.price),
        currencyId: db.currency_id,
        active: db.active,
        createdAt: db.created_at,
        updatedAt: db.updated_at,
    };
}
