import type { CustomDebt, DebtPayment } from '@/src/core/types';
import type { DbCustomDebt, DbDebtPayment } from '@/src/core/types/db';

export function mapDbCustomDebtToCustomDebt(db: DbCustomDebt): CustomDebt {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    customerId: db.customer_id,
    description: db.description,
    amount: Number(db.amount),
    currencyId: db.currency_id,
    ratePerUsdSnapshot: Number(db.rate_per_usd_snapshot),
    recordedByUserId: db.recorded_by_user_id,
    incurredAt: db.incurred_at,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    voidedAt: db.voided_at,
    voidedBy: db.voided_by,
    voidReason: db.void_reason,
    notes: db.notes,
  };
}

export function mapDbDebtPaymentToDebtPayment(db: DbDebtPayment): DebtPayment {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    customerId: db.customer_id,
    amount: Number(db.amount),
    currencyId: db.currency_id,
    ratePerUsdSnapshot: Number(db.rate_per_usd_snapshot),
    receivedByUserId: db.received_by_user_id,
    paidAt: db.paid_at,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    voidedAt: db.voided_at,
    voidedBy: db.voided_by,
    voidReason: db.void_reason,
    notes: db.notes,
    remittedAt: db.remitted_at,
    remittedBy: db.remitted_by,
  };
}
