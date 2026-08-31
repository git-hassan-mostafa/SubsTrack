import { Sale, SaleItem } from "@/src/core/types";
import { DbSale, DbSaleItem } from "@/src/core/types/db";
import { mapDbProductToProduct } from "@/src/modules/admin/products";
// Direct path, not the service-catalog barrel: the barrel pulls in components →
// the global store → saleSlice → back here. (The products import above predates
// this and still goes through its barrel.)
import { mapDbServiceToService } from "@/src/modules/admin/service-catalog/utils/mapper";
import { mapDbCustomerToCustomer } from "@/src/modules/customer/customers";

export function mapDbSaleItemToSaleItem(db: DbSaleItem): SaleItem {
    const unitAmount = Number(db.unit_amount);
    return {
        id: db.id,
        saleId: db.sale_id,
        tenantId: db.tenant_id,
        // Defaulted, so a row written before services existed still reads as goods.
        lineType: db.line_type ?? 'product',
        productId: db.product_id,
        serviceId: db.service_id,
        itemNameSnapshot: db.item_name_snapshot,
        quantity: db.quantity,
        unitAmount,
        lineTotal: unitAmount * db.quantity,
        createdAt: db.created_at,
        product: db.products ? mapDbProductToProduct(db.products) : null,
        service: db.services ? mapDbServiceToService(db.services) : null,
    };
}

export function mapDbSaleToSale(db: DbSale): Sale {
    return {
        id: db.id,
        tenantId: db.tenant_id,
        branchId: db.branch_id,
        itemsSummary: db.items_summary,
        customerId: db.customer_id,
        recordedByUserId: db.recorded_by_user_id,
        totalAmount: Number(db.total_amount),
        // Derived, and unknown at mapping time — SaleService fills all three from
        // the sale's charge balance. A caller that skips that step sees "owes it all".
        amountPaid: 0,
        chargeId: null,
        charge: null,
        currencyId: db.currency_id,
        ratePerUsdSnapshot: Number(db.rate_per_usd_snapshot),
        soldAt: db.sold_at,
        voidedAt: db.voided_at,
        voidedBy: db.voided_by,
        voidReason: db.void_reason,
        notes: db.notes,
        createdAt: db.created_at,
        // Lines an edit dropped are soft-voided rather than deleted (the sync
        // engine has no tombstones), so they are filtered out here — the one
        // place both the web and the offline reads pass through.
        items: (db.sale_items ?? [])
            .filter((it) => it.voided_at === null)
            .map(mapDbSaleItemToSaleItem),
        customer: db.customers ? mapDbCustomerToCustomer(db.customers) : null,
    };
}