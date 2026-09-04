import { Sale, SaleItem } from "@/src/core/types";
import { DbSale, DbSaleItem } from "@/src/core/types/db";
import { mapDbProductToProduct } from "@/src/modules/admin/products";
import { mapDbServiceToService } from "@/src/modules/admin/service-catalog/utils/mapper";
import { mapDbCustomerToCustomer } from "@/src/modules/customer/customers";

export function mapDbSaleItemToSaleItem(db: DbSaleItem): SaleItem {
    const unitAmount = Number(db.unit_amount);
    return {
        id: db.id,
        saleId: db.sale_id,
        tenantId: db.tenant_id,
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
        items: (db.sale_items ?? [])
            .filter((it) => it.voided_at === null)
            .map(mapDbSaleItemToSaleItem),
        customer: db.customers ? mapDbCustomerToCustomer(db.customers) : null,
    };
}