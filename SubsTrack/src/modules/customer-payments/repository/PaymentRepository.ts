import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { BranchFilter } from '@/src/core/constants';
import type { DbPayment } from '@/src/core/types/db';

type CreatePaymentPayload = Pick<DbPayment, 'billing_month' | 'amount_due' | 'amount_paid' | 'duration_months' | 'currency_id' | 'rate_per_usd_snapshot' | 'customer_id' | 'plan_id' | 'received_by_user_id' | 'tenant_id' | 'notes'>

class PaymentRepository extends BaseRepository {
  // Fetches payments that START within the given year, plus payments that
  // started in the previous year and may extend into this year (multi-month blocks).
  async findByCustomerAndYear(customerId: string, year: number): Promise<DbPayment[]> {
    const { data, error } = await this.db
      .from('payments')
      .select('*')
      .eq('customer_id', customerId)
      .gte('billing_month', `${year - 1}-01-01`)
      .lte('billing_month', `${year}-12-01`)
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
