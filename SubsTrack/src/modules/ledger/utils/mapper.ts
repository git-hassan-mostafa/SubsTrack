import type { Charge, Collection, CollectionItem } from '@/src/core/types';
import type { DbCharge, DbCollection, DbCollectionItem } from '@/src/core/types/db';

export function mapDbChargeToCharge(row: DbCharge): Charge {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    customerId: row.customer_id,
    kind: row.kind,
    customerPlanId: row.customer_plan_id,
    billingMonth: row.billing_month,
    durationMonths: row.duration_months,
    planId: row.plan_id,
    saleId: row.sale_id,
    description: row.description,
    amount: row.amount,
    currencyId: row.currency_id,
    ratePerUsdSnapshot: row.rate_per_usd_snapshot,
    issuedAt: row.issued_at,
    dueDate: row.due_date,
    recordedByUserId: row.recorded_by_user_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    voidedAt: row.voided_at,
    voidedBy: row.voided_by,
    voidReason: row.void_reason,
    writtenOffAt: row.written_off_at,
    writtenOffBy: row.written_off_by,
    writeOffReason: row.write_off_reason,
  };
}

export function mapDbCollectionItemToCollectionItem(row: DbCollectionItem): CollectionItem {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    collectionId: row.collection_id,
    chargeId: row.charge_id,
    amount: row.amount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    charge: row.charges ? mapDbChargeToCharge(row.charges) : null,
  };
}

export function mapDbCollectionToCollection(row: DbCollection): Collection {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    customerId: row.customer_id,
    amount: row.amount,
    currencyId: row.currency_id,
    ratePerUsdSnapshot: row.rate_per_usd_snapshot,
    receivedAt: row.received_at,
    receivedByUserId: row.received_by_user_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    voidedAt: row.voided_at,
    voidedBy: row.voided_by,
    voidReason: row.void_reason,
    heldByUserId: row.held_by_user_id,
    remittedAt: row.remitted_at,
    remittedBy: row.remitted_by,
    items: row.collection_items?.map(mapDbCollectionItemToCollectionItem),
  };
}
