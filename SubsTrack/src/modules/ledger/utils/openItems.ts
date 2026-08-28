import i18n from '@/src/core/i18n';
import type { Charge, MonthBill, OpenItem } from '@/src/core/types';
import type { DbCharge } from '@/src/core/types/db';
import { getBlockRangeLabel } from '@/src/modules/customer/customer-payments/utils/blockRangeLabel';

/**
 * THE debt rule, in one place.
 *
 * A fully unpaid month is OWED but is not a DEBT — it is red in the month grid,
 * which is its own screen and its own workflow. It becomes a debt the moment it
 * is partly paid, which is exactly when it stops being routine.
 *
 * Everything else with a balance is a debt from day one: an unpaid sale is a
 * pay-later, and a hand-typed fee is a debt by definition.
 *
 * Note it keys off MONEY (`paid`), never on whether a charge row exists — an
 * empty bill left behind by a voided collection must read the same as a month
 * that was never touched.
 */
export function isDebtItem(kind: Charge['kind'], paid: number): boolean {
  return kind !== 'month' || paid > 0;
}

/** A stored bill as an OpenItem. `paid` comes from the balance view. */
export function openItemFromCharge(charge: Charge, paid: number, label: string): OpenItem {
  return {
    chargeId: charge.id,
    kind: charge.kind,
    customerId: charge.customerId ?? '',
    customerName: '',
    customerPlanId: charge.customerPlanId,
    billingMonth: charge.billingMonth,
    durationMonths: charge.durationMonths,
    planId: charge.planId,
    saleId: charge.saleId,
    label,
    amount: charge.amount,
    paid,
    balance: charge.amount - paid,
    currencyId: charge.currencyId,
    ratePerUsdSnapshot: charge.ratePerUsdSnapshot,
    dueDate: charge.dueDate,
    issuedAt: charge.issuedAt,
    createdAt: charge.createdAt,
    isDebt: isDebtItem(charge.kind, paid),
  };
}

/**
 * A month the customer owes that has NO bill yet — derived from the grid. The
 * waterfall materializes its charge at the moment money reaches it, which is
 * the only thing that ever turns a month into a bill.
 *
 * `chargeId` is null and `createdAt`/`issuedAt` are the due date, so it sorts
 * beside stored bills without pretending to have been raised earlier.
 */
export function virtualMonthItem(args: {
  customerId: string;
  customerName: string;
  customerPlanId: string;
  billingMonth: string;
  durationMonths: number;
  planId: string | null;
  label: string;
  amount: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  dueDate: string;
}): OpenItem {
  return {
    chargeId: null,
    kind: 'month',
    customerId: args.customerId,
    customerName: args.customerName,
    customerPlanId: args.customerPlanId,
    billingMonth: args.billingMonth,
    durationMonths: args.durationMonths,
    planId: args.planId,
    saleId: null,
    label: args.label,
    amount: args.amount,
    paid: 0,
    balance: args.amount,
    currencyId: args.currencyId,
    ratePerUsdSnapshot: args.ratePerUsdSnapshot,
    dueDate: args.dueDate,
    issuedAt: args.dueDate,
    createdAt: args.dueDate,
    // Nothing collected on a month → owed, but not a debt.
    isDebt: false,
  };
}

/** "Jan 2026 · Internet" | "Sale #12 · Router" | "Installation fee". */
export function chargeLabel(row: DbCharge): string {
  if (row.kind === 'month') {
    // Reuses the grid's own label builder, so a 3-month bundle reads
    // "Apr – Jun 2026" here exactly as it does on the cells.
    const month = row.billing_month
      ? getBlockRangeLabel(row.billing_month, row.duration_months, i18n.t.bind(i18n))
      : '';
    const plan = row.customer_plans?.plans?.name;
    return plan ? `${month} · ${plan}` : month;
  }
  if (row.kind === 'sale') {
    return row.sales?.items_summary ?? i18n.t('debts.sale');
  }
  return row.description ?? i18n.t('debts.custom');
}

/** The bill for a month, if one exists — the grid's per-month lookup. */
export function billForMonth(bills: MonthBill[], billingMonth: string): MonthBill | null {
  return bills.find((b) => b.charge.billingMonth === billingMonth) ?? null;
}
