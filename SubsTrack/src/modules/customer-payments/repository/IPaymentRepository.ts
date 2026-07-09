import type { BranchFilter } from '@/src/core/constants';
import type { DbPayment } from '@/src/core/types/db';
import type { FindPaymentsOptions } from '../utils/types';

export type CreatePaymentPayload = Pick<
  DbPayment,
  | 'billing_month'
  | 'amount_due'
  | 'amount_paid'
  | 'duration_months'
  | 'currency_id'
  | 'rate_per_usd_snapshot'
  | 'customer_id'
  | 'customer_plan_id'
  | 'plan_id'
  | 'received_by_user_id'
  | 'tenant_id'
  | 'notes'
>;

export interface UpdatePaymentPayload {
  amountDue: number;
  amountPaid: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;
}

export interface AmountRow {
  amount: number;
  ratePerUsdSnapshot: number;
}

// AmountRow tagged with the payment's recorded date — for the revenue trend.
export interface MonthlyAmountRow extends AmountRow {
  paidAt: string; // ISO timestamp
}

export interface IPaymentRepository {
  findAll(opts?: FindPaymentsOptions): Promise<DbPayment[]>;
  findByCustomer(customerId: string): Promise<DbPayment[]>;
  create(payload: CreatePaymentPayload): Promise<DbPayment>;
  createMany(payloads: CreatePaymentPayload[]): Promise<DbPayment[]>;
  updatePayment(id: string, payload: UpdatePaymentPayload): Promise<DbPayment>;
  voidPayment(id: string, voidedBy: string, notes: string | null): Promise<DbPayment>;
  voidMany(ids: string[], voidedBy: string, notes: string | null): Promise<DbPayment[]>;
  findPaymentStatusForMonth(
    billingMonth: string,
  ): Promise<{ fullyPaidIds: Set<string>; partialIds: Set<string> }>;
  findActivePayments(): Promise<DbPayment[]>;
  // Scoped by paid_at (recorded date), matching the Payments tab's "This Month".
  paidAmountsForMonth(
    monthStartIso: string,
    monthEndExclusiveIso: string,
    branchFilter?: BranchFilter,
  ): Promise<AmountRow[]>;
  // Paid amounts per payment across a paid_at range (end exclusive), each tagged
  // with its recorded date — the dashboard buckets these into the revenue trend.
  // Scoped by paid_at so the trend's current-month bar matches paidAmountsForMonth.
  paidAmountsInRange(
    rangeStartIso: string,
    rangeEndExclusiveIso: string,
    branchFilter?: BranchFilter,
  ): Promise<MonthlyAmountRow[]>;
  balancesForMonth(billingMonth: string, branchFilter?: BranchFilter): Promise<AmountRow[]>;
  // Non-voided payments with an outstanding balance (partial payments), across
  // all months — the "Months" debt category. Joined with customer + plan name.
  partialPayments(branchFilter?: BranchFilter): Promise<DbPayment[]>;
}
