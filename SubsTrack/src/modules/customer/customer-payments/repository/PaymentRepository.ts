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

  // Payments carry no branch_id of their own; the audit row denormalizes the
  // owning customer's so a branch-scoped admin can filter on one column.
  private async branchOf(customerId: string): Promise<string | null> {
    const { data } = await this.db
      .from('customers')
      .select('branch_id')
      .eq('id', customerId)
      .maybeSingle();
    return (data as { branch_id: string | null } | null)?.branch_id ?? null;
  }

  async create(payload: CreatePaymentPayload): Promise<DbPayment> {
    const { data, error } = await this.db
      .from('payments')
      .upsert(
        {
          ...payload,
          paid_at: new Date().toISOString(),
          voided_at: null,
          voided_by: null,
          // Re-recording a voided month is fresh, unremitted cash.
          remitted_at: null,
          remitted_by: null,
        },
        { onConflict: 'customer_plan_id,billing_month' },
      )
      .select()
      .single();
    if (error) this.handleError(error);
    const created = data as DbPayment;
    await this.audit({
      table: 'payments',
      recordId: created.id,
      action: 'create',
      after: created,
      branchId: await this.branchOf(created.customer_id),
    });
    return created;
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
      remitted_at: null,
      remitted_by: null,
    }));
    const { data, error } = await this.db
      .from('payments')
      .upsert(rows, { onConflict: 'customer_plan_id,billing_month' })
      .select();
    if (error) this.handleError(error);
    const created = (data ?? []) as DbPayment[];
    const branches = new Map<string, string | null>();
    for (const p of created) {
      if (!branches.has(p.customer_id)) branches.set(p.customer_id, await this.branchOf(p.customer_id));
    }
    for (const p of created) {
      await this.audit({
        table: 'payments',
        recordId: p.id,
        action: 'create',
        after: p,
        branchId: branches.get(p.customer_id) ?? null,
      });
    }
    return created;
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
    // One extra read so the trail can say what the amount WAS. PostgREST cannot
    // return old values from an UPDATE.
    const { data: prior } = await this.db.from('payments').select('*').eq('id', id).maybeSingle();
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
    const updated = data as DbPayment;
    await this.audit({
      table: 'payments',
      recordId: id,
      action: 'update',
      before: prior,
      after: updated,
      branchId: await this.branchOf(updated.customer_id),
    });
    return updated;
  }

  async voidPayment(id: string, voidedBy: string, notes: string | null): Promise<DbPayment> {
    const { data: prior } = await this.db.from('payments').select('*').eq('id', id).maybeSingle();
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
    const voided = data as DbPayment;
    await this.audit({
      table: 'payments',
      recordId: id,
      action: 'void',
      before: prior,
      after: voided,
      branchId: await this.branchOf(voided.customer_id),
    });
    return voided;
  }

  // Voids several payments in a single round-trip.
  async voidMany(ids: string[], voidedBy: string, notes: string | null): Promise<DbPayment[]> {
    if (ids.length === 0) return [];
    const { data: prior } = await this.db.from('payments').select('*').in('id', ids);
    const before = new Map(
      ((prior ?? []) as DbPayment[]).map((p) => [p.id, p]),
    );
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
    const voided = (data ?? []) as DbPayment[];
    for (const p of voided) {
      await this.audit({
        table: 'payments',
        recordId: p.id,
        action: 'void',
        before: before.get(p.id) ?? null,
        after: p,
        branchId: await this.branchOf(p.customer_id),
      });
    }
    return voided;
  }

  // Every active (non-voided, non-zero-paid) payment across all customers and
  // years — the single input the service needs to build the whole customer-list
  // status (this month AND overdue) from buildMonthGrid. amount_paid = 0 is
  // excluded: it is treated as unpaid, same as the grid.
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

  async unremittedForWallet(
    branchFilter: BranchFilter = null,
    collectorUserId: string | null = null,
  ): Promise<DbPayment[]> {
    let query = this.db
      .from('payments')
      .select(PAYMENT_LIST_SELECT)
      .gt('amount_paid', 0)
      .is('voided_at', null)
      .is('remitted_at', null)
      .order('paid_at', { ascending: false });
    if (collectorUserId) query = query.eq('received_by_user_id', collectorUserId);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.payments);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbPayment[];
  }

  async markRemitted(ids: string[], remittedBy: string): Promise<void> {
    if (ids.length === 0) return;
    const remittedAt = new Date().toISOString();
    const { error, data } = await this.db
      .from('payments')
      .update({ remitted_at: remittedAt, remitted_by: remittedBy })
      .in('id', ids)
      .is('remitted_at', null)
      .is('voided_at', null)
      // Returned so the trail records only the rows the conditional UPDATE
      // actually moved, not every id the caller passed.
      .select();
    if (error) this.handleError(error);
    for (const p of (data ?? []) as DbPayment[]) {
      await this.audit({
        table: 'payments',
        recordId: p.id,
        action: 'update',
        before: { ...p, remitted_at: null, remitted_by: null },
        after: p,
        branchId: await this.branchOf(p.customer_id),
      });
    }
  }
}

// Platform seam: web → Supabase directly (unchanged); native → offline SQLite.
const impl: IPaymentRepository =
  Platform.OS === 'web' ? new PaymentRepository() : new OfflinePaymentRepository();

export default impl;
