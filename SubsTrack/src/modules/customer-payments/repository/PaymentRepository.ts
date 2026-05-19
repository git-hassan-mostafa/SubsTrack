import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { DbPayment } from '@/src/core/types/db';

type CreatePaymentPayload = Pick<DbPayment, 'billing_month' | 'amount' | 'duration_months' | 'customer_id' | 'plan_id' | 'received_by_user_id' | 'tenant_id' | 'notes'>

export class PaymentRepository extends BaseRepository {
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

  async updateAmount(id: string, amount: number): Promise<DbPayment> {
    const { data, error } = await this.db
      .from('payments')
      .update({ amount })
      .eq('id', id)
      .is('voided_at', null)
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbPayment;
  }

  async voidPayment(id: string, voidedBy: string, notes: string): Promise<DbPayment> {
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

  // Returns the set of customer IDs that have an active (non-voided) payment covering
  // the given billing month. Handles multi-month payments by checking date ranges.
  async findPaidCustomerIdsForMonth(billingMonth: string): Promise<Set<string>> {
    const [year, monthStr] = billingMonth.split('-').map(Number);
    // A payment from up to 12 months prior could still cover this month (max duration = 12).
    const cutoffDate = new Date(year, monthStr - 1 - 12, 1);
    const cutoff = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-01`;
    const target = new Date(billingMonth);

    const { data, error } = await this.db
      .from('payments')
      .select('customer_id, billing_month, duration_months')
      .lte('billing_month', billingMonth)
      .gte('billing_month', cutoff)
      .is('voided_at', null);
    if (error) this.handleError(error);

    return new Set(
      (data ?? [])
        .filter((r: { billing_month: string; duration_months: number }) => {
          const start = new Date(r.billing_month);
          const end = new Date(start);
          end.setMonth(end.getMonth() + r.duration_months - 1);
          return end >= target;
        })
        .map((r: { customer_id: string }) => r.customer_id),
    );
  }

  async sumForMonth(billingMonth: string): Promise<number> {
    const { data, error } = await this.db
      .from('payments')
      .select('amount')
      .eq('billing_month', billingMonth)
      .is('voided_at', null);
    if (error) this.handleError(error);
    return (data ?? []).reduce((sum: number, row: { amount: number }) => sum + row.amount, 0);
  }
}
