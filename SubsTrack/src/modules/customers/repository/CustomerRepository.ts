import { BaseRepository } from '@/src/core/utils/BaseRepository';
import { PAGE_SIZE } from '@/src/core/constants';
import type { DbCustomer } from '@/src/core/types/db';

type CustomerWithPlan = DbCustomer & { plans: DbCustomer['plans'] };

type CreateCustomerPayload = Pick<
  DbCustomer,
  | 'name'
  | 'phone_number'
  | 'address'
  | 'plan_id'
  | 'tenant_id'
  | 'start_date'
  | 'active'
  | 'is_regular'
  | 'cancelled_at'
>;

export class CustomerRepository extends BaseRepository {
  async findAll(page: number, searchQuery?: string): Promise<CustomerWithPlan[]> {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    // Strip PostgREST-reserved chars that break .or() parsing.
    const q = (searchQuery ?? '').trim().replace(/[,()]/g, '');
    let query = this.db
      .from('customers')
      .select('*, plans(*)')
      .order('name');
    if (q) {
      query = query.or(
        `name.ilike.%${q}%,phone_number.ilike.%${q}%,address.ilike.%${q}%`,
      );
    }
    const { data, error } = await query.range(from, to);
    if (error) this.handleError(error);
    return (data ?? []) as CustomerWithPlan[];
  }

  async findById(id: string): Promise<CustomerWithPlan> {
    const { data, error } = await this.db
      .from('customers')
      .select('*, plans(*)')
      .eq('id', id)
      .single();
    if (error) this.handleError(error);
    if (!data) throw new Error('Customer not found');
    return data as CustomerWithPlan;
  }

  async create(payload: CreateCustomerPayload): Promise<CustomerWithPlan> {
    const { data, error } = await this.db
      .from('customers')
      .insert(payload)
      .select('*, plans(*)')
      .single();
    if (error) this.handleError(error);
    return data as CustomerWithPlan;
  }

  async update(
    id: string,
    payload: Partial<Pick<DbCustomer, 'name' | 'phone_number' | 'address' | 'plan_id' | 'start_date' | 'is_regular'>>,
  ): Promise<CustomerWithPlan> {
    const { data, error } = await this.db
      .from('customers')
      .update(payload)
      .eq('id', id)
      .select('*, plans(*)')
      .single();
    if (error) this.handleError(error);
    return data as CustomerWithPlan;
  }

  async deactivate(id: string): Promise<CustomerWithPlan> {
    const { data, error } = await this.db
      .from('customers')
      .update({ active: false, cancelled_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, plans(*)')
      .single();
    if (error) this.handleError(error);
    return data as CustomerWithPlan;
  }

  async reactivate(id: string): Promise<CustomerWithPlan> {
    const { data, error } = await this.db
      .from('customers')
      .update({ active: true, cancelled_at: null })
      .eq('id', id)
      .select('*, plans(*)')
      .single();
    if (error) this.handleError(error);
    return data as CustomerWithPlan;
  }

  async countAll(): Promise<number> {
    const { count, error } = await this.db
      .from('customers')
      .select('id', { count: 'exact', head: true });
    if (error) this.handleError(error);
    return count ?? 0;
  }

  async countActive(): Promise<number> {
    const { count, error } = await this.db
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('active', true);
    if (error) this.handleError(error);
    return count ?? 0;
  }

  async countUnpaidForMonth(billingMonth: string): Promise<number> {
    // Count active regular customers who do NOT have a payment covering the given month.
    // Includes multi-month payments that started earlier but still cover this month.
    const [year, monthStr] = billingMonth.split('-').map(Number);
    const cutoffDate = new Date(year, monthStr - 1 - 12, 1);
    const cutoff = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-01`;
    const target = new Date(billingMonth);

    const { data: payments, error: pErr } = await this.db
      .from('payments')
      .select('customer_id, billing_month, duration_months')
      .lte('billing_month', billingMonth)
      .gte('billing_month', cutoff)
      .is('voided_at', null);
    if (pErr) this.handleError(pErr);

    const paidIds = new Set(
      (payments ?? [])
        .filter((r: { billing_month: string; duration_months: number }) => {
          const start = new Date(r.billing_month);
          const end = new Date(start);
          end.setMonth(end.getMonth() + r.duration_months - 1);
          return end >= target;
        })
        .map((r: { customer_id: string }) => r.customer_id),
    );

    const { data: active, error: cErr } = await this.db
      .from('customers')
      .select('id')
      .eq('active', true)
      .eq('is_regular', true);
    if (cErr) this.handleError(cErr);

    return (active ?? []).filter((c: { id: string }) => !paidIds.has(c.id)).length;
  }
}
