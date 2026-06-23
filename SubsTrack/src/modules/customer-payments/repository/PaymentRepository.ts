import { BaseRepository } from '@/src/core/utils/BaseRepository';
import { PAGE_SIZE, type BranchFilter } from '@/src/core/constants';
import type { DbPayment } from '@/src/core/types/db';
import type { FindPaymentsOptions } from '../utils/types';

type CreatePaymentPayload = Pick<DbPayment, 'billing_month' | 'amount_due' | 'amount_paid' | 'duration_months' | 'currency_id' | 'rate_per_usd_snapshot' | 'customer_id' | 'plan_id' | 'received_by_user_id' | 'tenant_id' | 'notes'>

// Joins the customer name (and branch_id, needed by the inherited branch filter)
// for the flat Payments list.
const PAYMENT_LIST_SELECT = '*, customers!inner(name, branch_id)';

// Start of a YYYY-MM-01 month as a local-time ISO timestamp (matches the
// day-bound helpers in SaleRepository — same local→UTC conversion).
function monthStartIso(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toISOString();
}

// Start of the month AFTER the given YYYY-MM-01 — exclusive upper bound so a
// paid-month filter covers the whole month.
function nextMonthStartIso(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 1).toISOString();
}

class PaymentRepository extends BaseRepository {
  // Tenant-wide, paginated payment list for the Invoices → Payments tab. Only
  // settled (amount_paid > 0), non-voided rows — an empty slot isn't a payment.
  async findAll(opts: FindPaymentsOptions = {}): Promise<DbPayment[]> {
    const page = opts.page ?? 0;
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = this.db
      .from('payments')
      .select(PAYMENT_LIST_SELECT)
      .gt('amount_paid', 0)
      .order('paid_at', { ascending: false })
      .range(from, to);

    if (!opts.includeVoided) query = query.is('voided_at', null);
    if (opts.customerId) query = query.eq('customer_id', opts.customerId);
    if (opts.receivedByUserId) query = query.eq('received_by_user_id', opts.receivedByUserId);
    if (opts.billingMonth) query = query.eq('billing_month', opts.billingMonth);
    if (opts.paidMonth) {
      query = query
        .gte('paid_at', monthStartIso(opts.paidMonth))
        .lt('paid_at', nextMonthStartIso(opts.paidMonth));
    }
    if (opts.status === 'paid') query = query.eq('balance', 0);
    else if (opts.status === 'partial') query = query.gt('balance', 0);

    query = this.applyBranchFilter(query, opts.branchFilter ?? null, this.BRANCH_SCOPES.payments);

    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbPayment[];
  }

  // Fetches every non-voided payment for a customer (all years), so the panel
  // can build any year's grid and switch years without re-querying.
  async findByCustomer(customerId: string): Promise<DbPayment[]> {
    const { data, error } = await this.db
      .from('payments')
      .select('*')
      .eq('customer_id', customerId)
      .is('voided_at', null)
      .order('billing_month');
    if (error) this.handleError(error);
    return (data ?? []) as DbPayment[];
  }

  async create(payload: CreatePaymentPayload): Promise<DbPayment> {
    const { data, error } = await this.db
      .from('payments')
      .upsert(
        { ...payload, paid_at: new Date().toISOString(), voided_at: null, voided_by: null },
        { onConflict: 'customer_id,billing_month' },
      )
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbPayment;
  }

  // Inserts several payments in a single round-trip. Callers must ensure the
  // batch has no duplicate (customer_id, billing_month) keys — Postgres rejects
  // a batch upsert that touches the same conflict target twice.
  async createMany(payloads: CreatePaymentPayload[]): Promise<DbPayment[]> {
    if (payloads.length === 0) return [];
    const now = new Date().toISOString();
    const rows = payloads.map((p) => ({
      ...p,
      paid_at: now,
      voided_at: null,
      voided_by: null,
    }));
    const { data, error } = await this.db
      .from('payments')
      .upsert(rows, { onConflict: 'customer_id,billing_month' })
      .select();
    if (error) this.handleError(error);
    return (data ?? []) as DbPayment[];
  }

  async updatePayment(
    id: string,
    payload: {
      amountDue: number;
      amountPaid: number;
      currencyId: string | null;
      ratePerUsdSnapshot: number;
    },
  ): Promise<DbPayment> {
    const { data, error } = await this.db
      .from('payments')
      .update({
        amount_due: payload.amountDue,
        amount_paid: payload.amountPaid,
        currency_id: payload.currencyId,
        rate_per_usd_snapshot: payload.ratePerUsdSnapshot,
      })
      .eq('id', id)
      .is('voided_at', null)
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbPayment;
  }

  async voidPayment(id: string, voidedBy: string, notes: string | null): Promise<DbPayment> {
    const { data, error } = await this.db
      .from('payments')
      .update({
        voided_at: new Date().toISOString(),
        voided_by: voidedBy,
        notes,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbPayment;
  }

  // Voids several payments in a single round-trip.
  async voidMany(ids: string[], voidedBy: string, notes: string | null): Promise<DbPayment[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.db
      .from('payments')
      .update({
        voided_at: new Date().toISOString(),
        voided_by: voidedBy,
        notes,
      })
      .in('id', ids)
      .select();
    if (error) this.handleError(error);
    return (data ?? []) as DbPayment[];
  }

  // Returns the customer IDs that have an active (non-voided), non-zero-paid
  // payment covering the given billing month, split into:
  //   - fullyPaidIds — payment fully settled (balance == 0)
  //   - partialIds   — payment recorded but balance > 0
  // Handles multi-month payments. amount_paid = 0 is intentionally excluded —
  // it is treated as unpaid. This must stay in sync with PaymentService.buildMonthGrid().
  async findPaymentStatusForMonth(
    billingMonth: string,
  ): Promise<{ fullyPaidIds: Set<string>; partialIds: Set<string> }> {
    const [year, monthStr] = billingMonth.split('-').map(Number);
    // A payment from up to 12 months prior could still cover this month (max duration = 12).
    const cutoffDate = new Date(year, monthStr - 1 - 12, 1);
    const cutoff = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-01`;
    const target = new Date(billingMonth);

    const { data, error } = await this.db
      .from('payments')
      .select('customer_id, billing_month, duration_months, amount_paid, balance')
      .lte('billing_month', billingMonth)
      .gte('billing_month', cutoff)
      .is('voided_at', null)
      .gt('amount_paid', 0);
    if (error) this.handleError(error);

    const fullyPaidIds = new Set<string>();
    const partialIds = new Set<string>();
    for (const r of (data ?? []) as {
      customer_id: string;
      billing_month: string;
      duration_months: number;
      balance: string | number;
    }[]) {
      const start = new Date(r.billing_month);
      const end = new Date(start);
      end.setMonth(end.getMonth() + r.duration_months - 1);
      if (end < target) continue;
      if (Number(r.balance) > 0) partialIds.add(r.customer_id);
      else fullyPaidIds.add(r.customer_id);
    }
    return { fullyPaidIds, partialIds };
  }

  // Returns every active (non-voided, non-zero-paid) payment across all
  // customers/years, so the service can run buildMonthGrid per customer and
  // detect overdue (unpaid past) months for the customer-list status badge.
  // amount_paid = 0 is excluded — it is treated as unpaid (same as the grid).
  async findActivePayments(): Promise<DbPayment[]> {
    const { data, error } = await this.db
      .from('payments')
      .select('*')
      .is('voided_at', null)
      .gt('amount_paid', 0);
    if (error) this.handleError(error);
    return (data ?? []) as DbPayment[];
  }

  // Returns raw paid amounts + their snapshot rate so the service layer can
  // convert to USD using the frozen rate (drift-free aggregation).
  async paidAmountsForMonth(
    billingMonth: string,
    branchFilter: BranchFilter = null,
  ): Promise<{ amount: number; ratePerUsdSnapshot: number }[]> {
    let query = this.db
      .from('payments')
      .select('amount_paid, rate_per_usd_snapshot, customers!inner(branch_id)')
      .eq('billing_month', billingMonth)
      .is('voided_at', null);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.payments);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []).map((r: { amount_paid: number; rate_per_usd_snapshot: number }) => ({
      amount: Number(r.amount_paid),
      ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
    }));
  }

  async balancesForMonth(
    billingMonth: string,
    branchFilter: BranchFilter = null,
  ): Promise<{ amount: number; ratePerUsdSnapshot: number }[]> {
    let query = this.db
      .from('payments')
      .select('balance, rate_per_usd_snapshot, customers!inner(branch_id)')
      .eq('billing_month', billingMonth)
      .is('voided_at', null)
      .gt('amount_paid', 0);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.payments);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []).map((r: { balance: number; rate_per_usd_snapshot: number }) => ({
      amount: Number(r.balance),
      ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
    }));
  }
}

export default new PaymentRepository()
