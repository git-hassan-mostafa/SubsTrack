import { Product, StockMovement } from "@/src/core/types";
import { DbProduct, DbStockMovement } from "@/src/core/types/db";
import type { StockCostRow } from "../repository/IProductRepository";

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
        costPrice: db.cost_price == null ? null : Number(db.cost_price),
        costCurrencyId: db.cost_currency_id,
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
        unitCost: db.unit_cost == null ? null : Number(db.unit_cost),
        currencyId: db.currency_id,
        ratePerUsdSnapshot:
            db.rate_per_usd_snapshot == null ? null : Number(db.rate_per_usd_snapshot),
        note: db.note,
        recordedByUserId: db.recorded_by_user_id,
        occurredAt: db.occurred_at,
        voidedAt: db.voided_at,
        voidedBy: db.voided_by,
        createdAt: db.created_at,
    };
}

// One costed stock movement → one Expenses row. Shared by both product
// repositories (they differ only in how they fetch the joined product).
export function toStockCostRow(
    r: {
        id: string;
        product_id: string;
        quantity_delta: number | string;
        unit_cost: number | string;
        currency_id: string | null;
        rate_per_usd_snapshot: number | string | null;
        occurred_at: string;
        recorded_by_user_id: string | null;
    },
    product: { name: string; branch_id: string | null } | null,
): StockCostRow {
    const quantity = Number(r.quantity_delta);
    return {
        movementId: r.id,
        productId: r.product_id,
        productName: product?.name ?? '',
        quantity,
        amount: quantity * Number(r.unit_cost),
        currencyId: r.currency_id,
        // A costed row always carries its rate; 1 is the USD fallback.
        ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot ?? 1) || 1,
        occurredAt: r.occurred_at,
        branchId: product?.branch_id ?? null,
        recordedByUserId: r.recorded_by_user_id,
    };
}