import type {
  Charge,
  ChargeUsage,
  Collection,
  CollectionItem,
} from "@shared/core/types";
import type {
  DbCharge,
  DbCollection,
  DbCollectionItem,
} from "@shared/core/types/db";
import { numberOrNull } from "@shared/core/utils/numberOrNull";

export type ChargeUsageColumns = Pick<
  DbCharge,
  | "usage_previous_reading"
  | "usage_reading"
  | "usage_units"
  | "unit_price"
  | "fixed_fee"
  | "computed_amount"
>;

export function chargeUsageFromRow(row: ChargeUsageColumns): ChargeUsage | null {
  if (row.computed_amount == null) return null;
  return {
    previousReading: numberOrNull(row.usage_previous_reading),
    reading: numberOrNull(row.usage_reading),
    units: Number(row.usage_units ?? 0),
    unitPrice: Number(row.unit_price ?? 0),
    fixedFee: Number(row.fixed_fee ?? 0),
    computedAmount: Number(row.computed_amount),
  };
}

// A usage bill's parts as columns; any other bill leaves them empty.
export function chargeUsageColumns(usage: ChargeUsage | null): ChargeUsageColumns {
  return {
    usage_previous_reading: usage?.previousReading ?? null,
    usage_reading: usage?.reading ?? null,
    usage_units: usage?.units ?? null,
    unit_price: usage?.unitPrice ?? null,
    fixed_fee: usage?.fixedFee ?? null,
    computed_amount: usage?.computedAmount ?? null,
  };
}

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
    usage: chargeUsageFromRow(row),
  };
}

export function mapDbCollectionItemToCollectionItem(
  row: DbCollectionItem,
): CollectionItem {
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
