import type { BranchFilter } from '@/src/core/constants';
import type { DbCustomDebt, DbDebtPayment } from '@/src/core/types/db';

export type CreateCustomDebtPayload = Pick<
  DbCustomDebt,
  | 'tenant_id'
  | 'customer_id'
  | 'description'
  | 'amount'
  | 'currency_id'
  | 'rate_per_usd_snapshot'
  | 'recorded_by_user_id'
  | 'incurred_at'
  | 'notes'
>;

export type CreateDebtPaymentPayload = Pick<
  DbDebtPayment,
  | 'tenant_id'
  | 'customer_id'
  | 'amount'
  | 'currency_id'
  | 'rate_per_usd_snapshot'
  | 'received_by_user_id'
  | 'paid_at'
  | 'notes'
>;

// The debts feature stores only what has no source transaction: custom debts +
// debt payments. "Months"/"sales" debts are derived (partial payments/sales) in
// the service. Reads join the customer for display + branch scoping.
export interface IDebtRepository {
  customDebts(branchFilter?: BranchFilter): Promise<DbCustomDebt[]>;
  debtPayments(branchFilter?: BranchFilter): Promise<DbDebtPayment[]>;
  createCustomDebt(payload: CreateCustomDebtPayload): Promise<DbCustomDebt>;
  voidCustomDebt(id: string, voidedBy: string, reason: string | null): Promise<DbCustomDebt>;
  createDebtPayment(payload: CreateDebtPaymentPayload): Promise<DbDebtPayment>;
  voidDebtPayment(id: string, voidedBy: string, reason: string | null): Promise<DbDebtPayment>;
  // Cash collected on debts across a date range, tagged with paid_at. Revenue is
  // cash, so a collected debt is revenue in the month it was collected — this is
  // the third stream behind the dashboard total, next to payments and sales.
  paidAmountsInRange(
    rangeStartIso: string,
    rangeEndExclusiveIso: string,
    branchFilter?: BranchFilter,
  ): Promise<{ paidAt: string; amount: number; ratePerUsdSnapshot: number }[]>;
  // Collector wallet: non-voided debt payments someone is holding
  // (held_by_user_id IS NOT NULL), joined with the customer. Optionally scoped
  // to one holder.
  heldDebtPayments(
    branchFilter?: BranchFilter,
    holderUserId?: string | null,
  ): Promise<DbDebtPayment[]>;
  // Move the given debt payments' cash to the next holder. See
  // IPaymentRepository.transferCustody — same contract.
  transferDebtPaymentCustody(
    ids: string[],
    fromUserId: string,
    toUserId: string | null,
    actorUserId: string,
  ): Promise<void>;
}
