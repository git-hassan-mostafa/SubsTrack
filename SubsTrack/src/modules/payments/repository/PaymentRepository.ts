import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { DbPayment } from '@/src/core/types/db';

interface CreatePaymentPayload {
  billing_month: string;
  amount: number;
  customer_id: string;
  plan_id: string | null;
  received_by_user_id: string | null;
  tenant_id: string;
}

export class PaymentRepository extends BaseRepository {
  async findByCustomerAndYear(customerId: string, year: number): Promise<DbPayment[]> {
    const { data, error } = await this.db
      .from('payments')
      .select('*')
      .eq('customer_id', customerId)
      .gte('billing_month', `${year}-01-01`)
      .lte('billing_month', `${year}-12-01`)
      .is('voided_at', null)
      .order('billing_month');
    if (error) this.handleError(error);
    return (data ?? []) as DbPayment[];
  }

  async create(payload: CreatePaymentPayload): Promise<DbPayment> {
    const { data, error } = await this.db
      .from('payments')
      .insert(payload)
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

  async findPaidCustomerIdsForMonth(billingMonth: string): Promise<Set<string>> {
    const { data, error } = await this.db
      .from('payments')
      .select('customer_id')
      .eq('billing_month', billingMonth)
      .is('voided_at', null);
    if (error) this.handleError(error);
    return new Set((data ?? []).map((r: { customer_id: string }) => r.customer_id));
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
