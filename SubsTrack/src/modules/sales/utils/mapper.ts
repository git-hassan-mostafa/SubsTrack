import { Sale } from "@/src/core/types";
import { DbSale } from "@/src/core/types/db";
import { mapDbCustomerToCustomer } from "../../customers";
import { mapDbProductToProduct } from "../../products";

export function mapDbSaleToSale(db: DbSale): Sale {
    return {
        id: db.id,
        tenantId: db.tenant_id,
        branchId: db.branch_id,
        productId: db.product_id,
        productNameSnapshot: db.product_name_snapshot,
        customerId: db.customer_id,
        recordedByUserId: db.recorded_by_user_id,
        quantity: db.quantity,
        unitAmount: Number(db.unit_amount),
        totalAmount: Number(db.total_amount),
        amountPaid: Number(db.amount_paid),
        currencyId: db.currency_id,
        ratePerUsdSnapshot: Number(db.rate_per_usd_snapshot),
        soldAt: db.sold_at,
        voidedAt: db.voided_at,
        voidedBy: db.voided_by,
        voidReason: db.void_reason,
        notes: db.notes,
        createdAt: db.created_at,
        product: db.products ? mapDbProductToProduct(db.products) : null,
        customer: db.customers ? mapDbCustomerToCustomer(db.customers) : null,
    };
}