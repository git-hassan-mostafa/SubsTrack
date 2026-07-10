import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import { PAGE_SIZE, type BranchFilter } from '@/src/core/constants';
import type { DbPayment } from '@/src/core/types/db';
import type { FindPaymentsOptions } from '../utils/types';
import type { CreatePaymentPayload, IPaymentRepository } from './IPaymentRepository';
import { OfflinePaymentRepository } from './PaymentRepository.offline';

// Joins the customer name (and branch_id, needed by the inherited branch filter)
// for the flat Payments list.
const PAYMENT_LIST_SELECT = '*, customers!inner(name, branch_id), plans(name)';

// Start of a YYYY-MM-DD day as a local-time ISO timestamp (matches the
// day-bound helpers in SaleRepository — same local→UTC conversion).
function dayStartIso(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}

// Start of the day AFTER the given YYYY-MM-DD — exclusive upper bound so a
// paid-date filter covers the whole calendar day (day+1 rolls over correctly).
function nextDayStartIso(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d + 1).toISOString();
}

export class PaymentRepository extends BaseRepository implements IPaymentRepository {
  // Tenant-wide, paginated payment list for the Transactions → Payments tab. Only
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
    // paid_at within the [from, to] day range — `to` is inclusive of its whole day.
    if (opts.paidFrom) query = query.gte('paid_at', dayStartIso(opts.paidFrom));
    if (opts.paidTo) query = query.lt('paid_at', nextDayStartIso(opts.paidTo));
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
        { onConflict: 'customer_plan_id,billing_month' },
      )
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbPayment;
  }

  // Inserts several payments in a single round-trip. Callers must ensure the
  // batch has no duplicate (customer_plan_id, billing_month) keys — Postgres
  // rejects a batch upsert that touches the same conflict target twice.
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
      .upsert(rows, { onConflict: 'customer_plan_id,billing_month' })
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

  // Returns customer IDs whose CURRENT-month status, aggregated across all their
  // active (started) service lines, is:
  //   - fullyPaidIds — every started line is covered and settled (balance == 0)
  //   - partialIds   — some coverage exists, but a line is uncovered or unsettled
  // A customer with several lines only turns "fully paid" once every line is
  // settled. Handles multi-month coverage. amount_paid = 0 is treated as unpaid.
  // Branch scoping is left to RLS (customer_plans + payments inherit the
  // customer's branch). Must stay in sync with PaymentService.buildMonthGrid().
  async findPaymentStatusForMonth(
    billingMonth: string,
  ): Promise<{ fullyPaidIds: Set<string>; partialIds: Set<string> }> {
    const [year, monthStr] = billingMonth.split('-').map(Number);
    // A payment from up to 12 months prior could still cover this month (max duration = 12).
    const cutoffDate = new Date(year, monthStr - 1 - 12, 1);
    const cutoff = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-01`;
    const target = new Date(billingMonth);

    // Active lines that have started by this month, grouped per customer.
    const { data: lineRows, error: lErr } = await this.db
      .from('customer_plans')
      .select('id, customer_id, start_date')
      .eq('active', true);
    if (lErr) this.handleError(lErr);
    const linesByCustomer = new Map<string, string[]>();
    for (const l of (lineRows ?? []) as { id: string; customer_id: string; start_date: string }[]) {
      const [sy, sm] = l.start_date.split('-').map(Number);
      if (new Date(`${sy}-${String(sm).padStart(2, '0')}-01`) > target) continue; // not started yet
      const list = linesByCustomer.get(l.customer_id);
      if (list) list.push(l.id);
      else linesByCustomer.set(l.customer_id, [l.id]);
    }

    // Covering payments for the month, keyed by line (last write wins per line).
    const { data, error } = await this.db
      .from('payments')
      .select('customer_plan_id, billing_month, duration_months, amount_paid, balance')
      .lte('billing_month', billingMonth)
      .gte('billing_month', cutoff)
      .is('voided_at', null)
      .gt('amount_paid', 0);
    if (error) this.handleError(error);

    const settledByLine = new Map<string, boolean>();
    for (const r of (data ?? []) as {
      customer_plan_id: string;
      billing_month: string;
      duration_months: number;
      balance: string | number;
    }[]) {
      const start = new Date(r.billing_month);
      const end = new Date(start);
      end.setMonth(end.getMonth() + r.duration_months - 1);
      if (end < target) continue;
      settledByLine.set(r.customer_plan_id, Number(r.balance) === 0);
    }

    const fullyPaidIds = new Set<string>();
    const partialIds = new Set<string>();
    for (const [customerId, lineIds] of linesByCustomer) {
      let anyCovered = false;
      let allCoveredAndSettled = true;
      for (const lineId of lineIds) {
        if (settledByLine.has(lineId)) {
          anyCovered = true;
          if (!settledByLine.get(lineId)) allCoveredAndSettled = false;
        } else {
          allCoveredAndSettled = false; // an active line has no payment this month
        }
      }
      if (!anyCovered) continue;
      if (allCoveredAndSettled) fullyPaidIds.add(customerId);
      else partialIds.add(customerId);
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
  // convert to USD using the frozen rate (drift-free aggregation). Scoped by
  // paid_at (when it was recorded), matching the Payments tab's "This Month"
  // section — not by billing_month (which month it's for).
  async paidAmountsForMonth(
    monthStartIso: string,
    monthEndExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<{ amount: number; ratePerUsdSnapshot: number }[]> {
    let query = this.db
      .from('payments')
      .select('amount_paid, rate_per_usd_snapshot, customers!inner(branch_id)')
      .gte('paid_at', monthStartIso)
      .lt('paid_at', monthEndExclusiveIso)
      .is('voided_at', null);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.payments);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []).map((r: { amount_paid: number; rate_per_usd_snapshot: number }) => ({
      amount: Number(r.amount_paid),
      ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
    }));
  }

  async paidAmountsInRange(
    rangeStartIso: string,
    rangeEndExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<{ paidAt: string; amount: number; ratePerUsdSnapshot: number }[]> {
    let query = this.db
      .from('payments')
      .select('paid_at, amount_paid, rate_per_usd_snapshot, customers!inner(branch_id)')
      .gte('paid_at', rangeStartIso)
      .lt('paid_at', rangeEndExclusiveIso)
      .is('voided_at', null);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.payments);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []).map(
      (r: { paid_at: string; amount_paid: number; rate_per_usd_snapshot: number }) => ({
        paidAt: r.paid_at,
        amount: Number(r.amount_paid),
        ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
      }),
    );
  }

  // Same filters as findAll but unpaginated + a lean projection — used to
  // compute the true per-month total when a month holds more rows than one
  // findAll page (PAGE_SIZE).
  async monthlyTotals(
    opts: FindPaymentsOptions = {},
  ): Promise<{ paidAt: string; amount: number; ratePerUsdSnapshot: number }[]> {
    let query = this.db
      .from('payments')
      .select('paid_at, amount_paid, rate_per_usd_snapshot, customers!inner(branch_id)')
      .gt('amount_paid', 0);

    if (!opts.includeVoided) query = query.is('voided_at', null);
    if (opts.customerId) query = query.eq('customer_id', opts.customerId);
    if (opts.receivedByUserId) query = query.eq('received_by_user_id', opts.receivedByUserId);
    if (opts.billingMonth) query = query.eq('billing_month', opts.billingMonth);
    if (opts.paidFrom) query = query.gte('paid_at', dayStartIso(opts.paidFrom));
    if (opts.paidTo) query = query.lt('paid_at', nextDayStartIso(opts.paidTo));
    if (opts.status === 'paid') query = query.eq('balance', 0);
    else if (opts.status === 'partial') query = query.gt('balance', 0);

    query = this.applyBranchFilter(query, opts.branchFilter ?? null, this.BRANCH_SCOPES.payments);

    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []).map((r: { paid_at: string; amount_paid: number; rate_per_usd_snapshot: number }) => ({
      paidAt: r.paid_at,
      amount: Number(r.amount_paid),
      ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
    }));
  }

  async partialPayments(branchFilter: BranchFilter = null): Promise<DbPayment[]> {
    let query = this.db
      .from('payments')
      .select(PAYMENT_LIST_SELECT)
      .gt('amount_paid', 0)
      .gt('balance', 0)
      .is('voided_at', null)
      .order('billing_month', { ascending: false });
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.payments);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbPayment[];
  }
}

// Platform seam: web → Supabase directly (unchanged); native → offline SQLite.
const impl: IPaymentRepository =
  Platform.OS === 'web' ? new PaymentRepository() : new OfflinePaymentRepository();

export default impl;
