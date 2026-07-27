import { Product, StockMovement } from "@/src/core/types";
import { DbProduct, DbStockMovement } from "@/src/core/types/db";

// stockOnHand has no DB column — the caller passes the ledger sum.
export function mapDbProductToProduct(db: DbProduct, stockOnHand = 0): Product {
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
        stockOnHand,
    };
}

export function mapDbStockMovementToStockMovement(db: DbStockMovement): StockMovement {
    return {
        id: db.id,
        tenantId: db.tenant_id,
        productId: db.product_id,
        quantityDelta: Number(db.quantity_delta),
        reason: db.reason,
        saleId: db.sale_id,
        note: db.note,
        recordedByUserId: db.recorded_by_user_id,
        occurredAt: db.occurred_at,
        voidedAt: db.voided_at,
        voidedBy: db.voided_by,
        createdAt: db.created_at,
    };
}